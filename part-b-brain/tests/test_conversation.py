import json
import os
import threading
import unittest
import urllib.error
import urllib.request

os.environ["BRAIN_OFFLINE"] = "1"  # tests never call the network

from brain import conversation, llm  # noqa: E402
from brain.contract import validate_turn_request, validate_turn_response  # noqa: E402
from brain.textutil import classify_idea  # noqa: E402
from server import make_server  # noqa: E402

IDEA_A = "Google Maps for jobs, open jobs near you on a map"
IDEA_B = "A subscription box of reusable rocket kits for teenage engineers"
ALL = ["jobs", "musk", "altman", "buffett"]
ANSWER = "Ours shows walk-in jobs posted in the last hour, and we have 40 employers signed up already."


def req(idea, history=None, sid="t1", end=False):
    return {"sessionId": sid, "idea": idea, "personas": ALL, "history": history or [], "endCall": end}


class Classification(unittest.TestCase):
    def test_life_vs_startup(self):
        for text in ["Should I quit my job to go back to school?", "Should I move to Toronto for a new job?",
                     "I'm deciding whether to break up with my girlfriend", "Should I take the job offer abroad?"]:
            self.assertEqual(classify_idea(text), "life", text)
        for text in [IDEA_A, IDEA_B, "An app that splits grocery bills between roommates", "Uber for dog walkers"]:
            self.assertEqual(classify_idea(text), "startup", text)

    def test_life_and_startup_use_different_templates(self):
        life = conversation.next_turns(req("Should I quit my job to go back to school?"))["turns"][0]["text"]
        self.assertIn("quitting your job", life)
        self.assertNotIn("users", life.lower())


class OfflineConversation(unittest.TestCase):
    def test_first_turn_is_idea_specific_and_differs(self):
        a = conversation.next_turns(req(IDEA_A))
        b = conversation.next_turns(req(IDEA_B))
        validate_turn_response(a, ALL)
        validate_turn_response(b, ALL)
        self.assertEqual(len(a["turns"]), 1)
        self.assertTrue(a["awaitingUser"] and not a["done"] and a["summary"] is None)
        ta, tb = a["turns"][0]["text"], b["turns"][0]["text"]
        self.assertNotEqual(ta, tb)
        self.assertTrue(any(w in ta.lower() for w in ("jobs", "maps")), ta)
        self.assertTrue(any(w in tb.lower() for w in ("rocket", "subscription", "teenage", "engineers", "kits")), tb)
        self.assertIn("?", ta)

    def test_deterministic_for_same_session(self):
        self.assertEqual(conversation.next_turns(req(IDEA_A, sid="same")), conversation.next_turns(req(IDEA_A, sid="same")))

    def test_user_answer_gives_one_or_two_valid_turns(self):
        first = conversation.next_turns(req(IDEA_A))["turns"][0]
        history = [{"speaker": first["speaker"], "text": first["text"]}, {"speaker": "user", "text": ANSWER}]
        counts = set()
        for i in range(12):
            out = conversation.next_turns(req(IDEA_A, history, sid=f"s{i}"))
            validate_turn_response(out, ALL)
            self.assertIn(len(out["turns"]), (1, 2))
            self.assertTrue(out["awaitingUser"])
            self.assertIn("?", out["turns"][-1]["text"])
            counts.add(len(out["turns"]))
            for t in out["turns"]:
                self.assertNotIn("—", t["text"])
                self.assertNotIn("–", t["text"])
        self.assertEqual(counts, {1, 2})  # both shapes occur across sessions

    def test_speakers_rotate(self):
        speakers = {conversation.next_turns(req(IDEA_A, sid=f"r{i}"))["turns"][0]["speaker"] for i in range(20)}
        self.assertGreaterEqual(len(speakers), 3)

    def test_restricted_personas(self):
        out = conversation.next_turns({"sessionId": "p", "idea": IDEA_A, "personas": ["buffett"]})
        self.assertEqual({t["speaker"] for t in out["turns"]}, {"buffett"})

    def test_end_call_returns_summary(self):
        history = [{"speaker": "musk", "text": "What is different?"}, {"speaker": "user", "text": ANSWER}]
        out = conversation.next_turns(req(IDEA_A, history, end=True))
        validate_turn_response(out, ALL)
        self.assertTrue(out["done"])
        self.assertFalse(out["awaitingUser"])
        s = out["summary"]
        self.assertEqual([p["speaker"] for p in s["perPersona"]], ALL)
        self.assertTrue(all(1 <= p["score"] <= 10 for p in s["perPersona"]))
        self.assertEqual(len(s["nextSteps"]), 3)

    def test_five_answers_ends_call(self):
        history = []
        for i in range(5):
            history += [{"speaker": "jobs", "text": "Question?"}, {"speaker": "user", "text": f"Answer number {i} with 10 users."}]
        out = conversation.next_turns(req(IDEA_A, history))
        self.assertTrue(out["done"])
        self.assertIsNotNone(out["summary"])

    def test_bad_requests_raise(self):
        for bad in [None, {}, {"idea": ""}, {"idea": "x", "personas": ["nobody"]}, {"idea": "x", "history": "no"},
                    {"idea": "x", "history": [{"speaker": "user"}]}, {"idea": "x", "endCall": "yes"}, {"idea": "x" * 5000}]:
            with self.assertRaises(ValueError, msg=repr(bad)):
                validate_turn_request(bad, ALL)

    def test_llm_garbage_falls_back_offline(self):
        original = llm.chat_json
        llm.chat_json = lambda *a, **k: {"turns": [{"speaker": "nobody", "text": "hi"}]}
        try:
            out = conversation.next_turns(req(IDEA_A), use_llm=True)
        finally:
            llm.chat_json = original
        validate_turn_response(out, ALL)

    def test_llm_output_is_used_when_valid(self):
        original = llm.chat_json
        llm.chat_json = lambda *a, **k: {"turns": [{"speaker": "musk", "text": "Maps for jobs — why not just a list?",
                                                     "mood": "skeptical", "stance": "challenge", "replyTo": "user"}], "summary": None}
        try:
            out = conversation.next_turns(req(IDEA_A), use_llm=True)
        finally:
            llm.chat_json = original
        self.assertEqual(out["turns"][0]["text"], "Maps for jobs, why not just a list?")

    def test_personas_have_required_fields(self):
        for p in conversation.load_personas().values():
            self.assertTrue(6 <= len(p["principles"]) <= 8)
            for k in ("typicalQuestions", "speakingStyle", "impresses", "annoys", "lifeVsStartup", "sources", "color", "lens"):
                self.assertTrue(p[k], k)


class HttpTurn(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.httpd = make_server(0)
        cls.base = f"http://127.0.0.1:{cls.httpd.server_address[1]}"
        threading.Thread(target=cls.httpd.serve_forever, daemon=True).start()

    @classmethod
    def tearDownClass(cls):
        cls.httpd.shutdown()

    def post(self, body, raw=None, path="/turn"):
        data = raw if raw is not None else json.dumps(body).encode()
        r = urllib.request.Request(self.base + path, data=data, headers={"Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(r) as resp:
                return resp.status, json.loads(resp.read()), resp.headers
        except urllib.error.HTTPError as e:
            return e.code, json.loads(e.read()), e.headers

    def test_personas(self):
        with urllib.request.urlopen(self.base + "/personas") as r:
            self.assertEqual(r.headers["Access-Control-Allow-Origin"], "*")
            data = json.loads(r.read())
        self.assertEqual([p["id"] for p in data], ALL)
        for p in data:
            self.assertEqual(set(p), {"id", "name", "role", "lens", "color"})
            self.assertRegex(p["color"], r"^#[0-9A-Fa-f]{6}$")
        self.assertEqual(len({p["color"] for p in data}), 4)

    def test_health_reports_provider(self):
        with urllib.request.urlopen(self.base + "/health") as r:
            h = json.loads(r.read())
        self.assertTrue(h["ok"])
        self.assertEqual(h["provider"], "offline")

    def test_turn_ok(self):
        code, out, headers = self.post(req(IDEA_A))
        self.assertEqual(code, 200)
        self.assertEqual(headers["Access-Control-Allow-Origin"], "*")
        validate_turn_response(out, ALL)

    def test_turn_end_call(self):
        code, out, _ = self.post(req(IDEA_A, [{"speaker": "user", "text": ANSWER}], end=True))
        self.assertEqual(code, 200)
        self.assertTrue(out["done"])

    def test_turn_bad_input_is_400(self):
        self.assertEqual(self.post({"sessionId": "a"})[0], 400)
        self.assertEqual(self.post(None, raw=b"not json")[0], 400)
        self.assertEqual(self.post({"idea": "x", "personas": ["nobody"]})[0], 400)
        code, out, _ = self.post({"idea": ""})
        self.assertEqual(code, 400)
        self.assertIn("error", out)

    def test_turn_body_limit(self):
        code, out, _ = self.post(None, raw=b'{"idea":"' + b"x" * 70_000 + b'"}')
        self.assertEqual(code, 400)

    def test_run_still_works(self):
        code, out, _ = self.post({"sessionId": "w1", "mode": "roast", "pitchText": "Uber for toasters on the blockchain."}, path="/run")
        self.assertEqual(code, 200)
        self.assertIn("script", out)


if __name__ == "__main__":
    unittest.main()
