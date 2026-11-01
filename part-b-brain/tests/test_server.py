import json
import os
import threading
import unittest
import urllib.error
import urllib.request

os.environ["BRAIN_OFFLINE"] = "1"

from server import make_server  # noqa: E402


class ServerTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.httpd = make_server(0)  # port 0 = any free port
        cls.base = f"http://127.0.0.1:{cls.httpd.server_address[1]}"
        threading.Thread(target=cls.httpd.serve_forever, daemon=True).start()

    @classmethod
    def tearDownClass(cls):
        cls.httpd.shutdown()

    def post(self, body, raw=None):
        data = raw if raw is not None else json.dumps(body).encode()
        req = urllib.request.Request(self.base + "/run", data=data, headers={"Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(req) as r:
                return r.status, json.loads(r.read())
        except urllib.error.HTTPError as e:
            return e.code, json.loads(e.read())

    def test_health(self):
        with urllib.request.urlopen(self.base + "/health") as r:
            self.assertEqual(r.status, 200)
            self.assertTrue(json.loads(r.read())["ok"])

    def test_run_returns_script_and_events(self):
        code, out = self.post({"sessionId": "w1", "mode": "roast", "pitchText": "Uber for toasters on the blockchain but with AI."})
        self.assertEqual(code, 200)
        self.assertEqual(out["script"]["ideaScore"]["mood"], "appalled")
        self.assertTrue(any(e["type"] == "rage_quit" for e in out["events"]))

    def test_bad_input_is_400_not_500(self):
        self.assertEqual(self.post({"mode": "roast"})[0], 400)
        self.assertEqual(self.post(None, raw=b"not json")[0], 400)
        self.assertEqual(self.post({"sessionId": "a", "mode": "larp", "pitchText": "x", "chosenMindId": "nobody"})[0], 400)

    def test_cors_header_present(self):
        with urllib.request.urlopen(self.base + "/health") as r:
            self.assertEqual(r.headers["Access-Control-Allow-Origin"], "*")


if __name__ == "__main__":
    unittest.main()
