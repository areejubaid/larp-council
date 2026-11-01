"""LARP Council conversation engine: implements turn contract v2 (POST /turn).

next_turns(request) validates the request, then asks the active LLM provider for the next turns.
Any provider failure or invalid output falls back to the offline engine in brain/offline.py.
"""
import json
import os
import random
import re

from . import llm, offline
from .contract import validate_turn_request, validate_turn_response, TURN_MOODS, TURN_STANCES
from .textutil import answer_phrase, classify_idea, keywords, topic_phrase

PERSONA_DIR = os.path.join(os.path.dirname(__file__), "data", "personas")
PERSONA_ORDER = ("jobs", "musk", "altman", "buffett")
MAX_ANSWERS = 5

_cache = None


def load_personas() -> dict:
    global _cache
    if _cache is None:
        out = {}
        for pid in PERSONA_ORDER:
            with open(os.path.join(PERSONA_DIR, f"{pid}.json"), encoding="utf-8") as f:
                out[pid] = json.load(f)
        _cache = out
    return _cache


def list_personas() -> list:
    return [{k: p[k] for k in ("id", "name", "role", "lens", "color")} for p in load_personas().values()]


def known_ids() -> tuple:
    return tuple(load_personas().keys())


# Words that make a persona's lens a good fit for the latest answer.
LENS = {
    "jobs": ["design", "user", "experience", "interface", "simple", "beautiful", "brand", "consumer", "music", "phone",
             "taste", "focus", "story", "feel", "app", "creative", "art", "passion", "love"],
    "musk": ["rocket", "space", "car", "battery", "energy", "hardware", "manufactur", "cost", "physics", "engineer",
             "robot", "mars", "fast", "scale", "technology", "factory", "speed", "build", "tech", "risk"],
    "altman": ["ai", "startup", "growth", "users", "fund", "venture", "saas", "software", "platform", "network",
               "marketplace", "model", "agent", "launch", "founder", "grow", "signup", "weekly", "market", "career"],
    "buffett": ["money", "revenue", "profit", "price", "invest", "bank", "business", "margin", "loan", "debt", "saving",
                "retire", "insurance", "customer", "pay", "financ", "house", "stock", "safe", "family", "long term"],
}
LIFE_BOOST = {"buffett": 1.0, "jobs": 0.6}


def _fit(pid, text, ctx):
    t = text.lower()
    s = sum(2.0 for w in LENS[pid] if re.search(r"\b" + re.escape(w), t))
    return s + (LIFE_BOOST.get(pid, 0) if ctx == "life" else 0)


def _user_answers(history):
    return [h["text"] for h in history if h["speaker"] == "user"]


def _spoken_counts(history):
    counts = {}
    for h in history:
        if h["speaker"] != "user":
            counts[h["speaker"]] = counts.get(h["speaker"], 0) + 1
    return counts


def _answer_stance(answer, rng):
    a = answer.lower()
    words = len(a.split())
    hedge = bool(re.search(r"\b(maybe|probably|i think|not sure|i guess|hope|might|kind of|sort of)\b", a))
    concrete = bool(re.search(r"\d|\$|%|\b(customers?|users?|paying|revenue|waitlist|signed|pilot|sales?)\b", a))
    if words < 7 or hedge:
        return rng.choice(["challenge", "challenge", "disagree"])
    if concrete:
        return rng.choice(["agree", "agree", "advice", "challenge"])
    return rng.choice(["agree", "disagree", "challenge", "advice"])


# ---------------------------------------------------------------------------
# Offline engine
# ---------------------------------------------------------------------------
def _context(req):
    idea = req["idea"]
    ctx = classify_idea(idea)
    kws = keywords(idea)
    kw = kws[0] if kws else "this"
    if ctx == "startup" and kws:  # among the most repeated words, the longest tends to be the real noun
        top = [w for w in kws if idea.lower().count(w) == idea.lower().count(kws[0])]
        kw = max(top, key=len)
    kw2 = next((w for w in kws if w != kw), kw)
    if ctx == "life" and kws:  # the object noun usually comes last: "quit my job to go back to school" -> school
        order = sorted(kws, key=lambda w: idea.lower().rfind(w))
        kw = order[-1]
    topic = topic_phrase(idea)
    answers = _user_answers(req["history"])
    ap = answer_phrase(answers[-1], avoid=kws[:2]) if answers else ""
    return ctx, topic, kw, kw2, ap


def _offline_turns(req):
    ctx, topic, kw, kw2, ap = _context(req)
    f = offline.fill_vars(topic, kw, kw2, ap)
    history = req["history"]
    answers = _user_answers(history)
    n = len(answers)
    rng = random.Random(f"{req['sessionId']}:{n}:{len(history)}:{req['idea'][:40]}")
    personas = req["personas"]
    said = {h["text"] for h in history}
    counts = _spoken_counts(history)
    last = next((h["speaker"] for h in reversed(history) if h["speaker"] != "user"), None)
    basis = req["idea"] if not answers else req["idea"] + " " + (answers[-1] + " ") * 2

    def pick_speaker(exclude=()):
        pool = [p for p in personas if p not in exclude] or personas
        def score(p):
            s = _fit(p, basis, ctx) + rng.random() * 2.2 - 0.3 * counts.get(p, 0)
            return s - (1.5 if p == last else 0)
        return max(pool, key=score)

    def finish(turns):
        for t in turns:
            t["text"] = offline.clean(offline.with_tag(t["text"], t["mood"], rng))
        return {"turns": turns, "awaitingUser": True, "done": False, "summary": None}

    if not answers:  # first turn: one persona opens with a question about the idea
        pid = pick_speaker()
        text = offline.render(pid, "open", ctx, f, rng, said)
        return finish([{"speaker": pid, "text": text, "mood": "curious", "stance": "question", "replyTo": "user"}])

    stance = _answer_stance(answers[-1], rng)
    if n >= 3 and rng.random() < 0.35:
        stance = "advice"
    a = pick_speaker()
    mood = offline.mood_for(stance, rng)
    react = offline.render(a, stance, ctx, f, rng, said)
    two = len(personas) > 1 and rng.random() < 0.5
    if not two:
        follow = offline.render(a, "follow", ctx, f, rng, said)
        return finish([{"speaker": a, "text": f"{react} {follow}", "mood": mood, "stance": stance, "replyTo": "user"}])
    b = pick_speaker(exclude=(a,))
    peer_stance = rng.choice(["agree", "disagree"])
    peer = offline.render(b, "peer_" + peer_stance, ctx, f, rng, said)
    follow = offline.render(b, "follow", ctx, f, rng, said)
    return finish([
        {"speaker": a, "text": react, "mood": mood, "stance": stance, "replyTo": "user"},
        {"speaker": b, "text": f"{peer} {follow}", "mood": offline.mood_for(peer_stance, rng),
         "stance": peer_stance, "replyTo": a},
    ])


def _offline_done(req):
    ctx, topic, kw, kw2, ap = _context(req)
    f = offline.fill_vars(topic, kw, kw2, ap)
    answers = _user_answers(req["history"])
    rng = random.Random(f"{req['sessionId']}:summary:{len(req['history'])}:{req['idea'][:40]}")
    summ = offline.summary(req["personas"], ctx, f, answers, rng)
    closing = offline.closing_turn(req["personas"], summ, ctx, f, rng)
    return {"turns": [closing], "awaitingUser": False, "done": True, "summary": summ}


# ---------------------------------------------------------------------------
# LLM engine
# ---------------------------------------------------------------------------
def _persona_block(p):
    return (
        f"ID: {p['id']}\nName: {p['name']} ({p['role']})\nLens: {p['lens']}\n"
        "Thinking principles (paraphrased from public material):\n" + "\n".join(f"- {x}" for x in p["principles"]) + "\n"
        "Questions they tend to ask:\n" + "\n".join(f"- {x}" for x in p["typicalQuestions"]) + "\n"
        f"Speaking style: {p['speakingStyle']}\nImpressed by: {p['impresses']}\nAnnoyed by: {p['annoys']}\n"
        f"Startups vs life decisions: {p['lifeVsStartup']}"
    )


def build_system_prompt(persona_ids):
    ps = load_personas()
    return (
        "You write the next lines of a live video call called LARP Council. AI personas of well known public figures "
        "give feedback to a user on an idea they bring: a startup, a project or a life decision.\n\n"
        "IMPORTANT: these are AI simulations built from public interviews, talks and writing. They are not the real "
        "people. Never claim a real quote, never put quotation marks around anything attributed to a person, never "
        "say the person actually said something. Do not invent biographical facts.\n\n"
        "Each persona must respond the way that person reasons publicly, grounded in the profile below, in their own "
        "voice and pace. Reference specifics of the user's idea and their latest answer (names, numbers, words they "
        "used) so the reply could not be pasted onto a different idea. Different personas should disagree sometimes. "
        "A persona may reply to another persona (agree or disagree) instead of the user.\n\n"
        "GROUNDING: every question and every piece of advice must come from the persona's own documented principles, "
        "habits and typical questions in the profile below, applied to this user's specific idea. Do not give generic "
        "advice that any persona could say.\n\n"
        "PLAIN LANGUAGE: the user must understand every question the first time they hear it. Ask in simple everyday words about THEIR idea, name the specific thing you mean, and never use jargon or a persona catchphrase on its own (for example never just ask \"what is the physics of this\"; say what limit or cost you mean instead).\n\n"
        "ONE QUESTION RULE: a round has at most ONE question for the user, asked by the final turn only. Any earlier "
        "turn is a short reaction that agrees or disagrees (with the user or with another persona) and contains no "
        "question mark.\n\n"
        "VERDICT ENERGY: judge the idea honestly. If it is a bad, vague or hopeless idea, ROAST it: a funny, savage but "
        "good natured jab at the IDEA (never the user's looks, identity or anything personal), then moods annoyed or "
        "skeptical. If it is genuinely good or the user gave a strong answer, say so loud and hype it, with mood "
        "impressed. The user should be able to tell from the reaction alone whether the idea is good or bad. "
        "Do not be neutral and do not hedge.\n\n"
        "TONE: super casual, light and funny, like friends texting. Use current slang naturally, such as lowkey, ngl, "
        "no cap, fire, mid, cooked, bet, bro, kinda, lol, W and L, aura. Keep each persona's personality (Jobs blunt "
        "and picky about taste, Musk dry and deadpan, Altman calm and sharp, Buffett folksy and patient with money "
        "jokes) but never formal or corporate. Short punchy lines, 1 or 2 sentences. Do not overdo slang in every "
        "sentence and never use offensive slang.\n\n"
        "Style: spoken, natural, contractions, no corporate speak, no lists. 1 to 3 short sentences per turn. You may "
        "start a turn with at most one ElevenLabs audio tag such as [laughs], [sighs], [thoughtfully], [skeptical], "
        "and only sometimes. Never use em dashes or en dashes.\n\n"
        "PERSONAS\n\n" + "\n\n".join(_persona_block(ps[p]) for p in persona_ids) + "\n\n"
        "OUTPUT: strict JSON only, no markdown, no commentary. Schema:\n"
        '{"turns":[{"speaker":"<persona id>","text":"...","mood":"curious|skeptical|impressed|annoyed|supportive",'
        '"stance":"question|agree|disagree|challenge|advice","replyTo":"user or a persona id"}],'
        '"summary":null}\n'
        "Return 1 or 2 turns. If the call is not ending, the last turn MUST ask the user a question. When the call is "
        'ending, return one short closing turn (stance "advice") and fill summary: {"verdict":"one sentence",'
        '"perPersona":[{"speaker":"<id>","take":"two sentences","score":<integer 1 to 10>}],"nextSteps":["...","...","..."]} '
        "with exactly one perPersona entry per persona listed above and exactly 3 short nextSteps. Write the verdict, "
        "takes and nextSteps in the same casual, funny slang tone, roasting a weak idea and hyping a strong one, and "
        "make the scores match: bad ideas get low scores (1 to 4), solid ones 5 to 7, great ones 8 to 10."
    )


def build_user_prompt(req, ending):
    ctx = classify_idea(req["idea"])
    lines = [f"Idea: {req['idea']}", f"Looks like a: {'life decision' if ctx == 'life' else 'startup or project'}",
             f"Personas on the call: {', '.join(req['personas'])}", "", "Conversation so far:"]
    if not req["history"]:
        lines.append("(nothing yet)")
    for h in req["history"]:
        who = "USER" if h["speaker"] == "user" else h["speaker"].upper()
        lines.append(f"{who}: {h['text']}")
    n = len(_user_answers(req["history"]))
    if ending:
        lines += ["", "The call is ending now. Return a short closing turn and the full summary."]
    elif n == 0:
        lines += ["", "This is the start. One persona whose lens fits best opens with ONE question specific to this idea. Return exactly 1 turn."]
    else:
        last = next((h["speaker"] for h in reversed(req["history"]) if h["speaker"] != "user"), None)
        lines += ["", f"The user has given {n} answer(s). React to their latest answer specifically. Pick the persona "
                  "whose lens fits it best" + (f" (the previous speaker was {last}, so usually pick someone else)" if last else "") +
                  ". Always include one earlier turn (no question) from a persona who reacts to the idea and the answer with real "
                  "energy: if it is weak or boring, ROAST it with a funny jab and mood annoyed, stance disagree; if it is strong, "
                  "hype it hard with slang and mood impressed, stance agree. Then the final turn asks the user exactly ONE "
                  "question, in plain casual words."]
    return "\n".join(lines)


_DASHES = re.compile(r"\s*[–—]\s*")


def _coerce(raw, req, ending):
    """Make lenient LLM output fit the contract, then it gets strictly validated."""
    ids = req["personas"]
    if not isinstance(raw, dict):
        raise ValueError("not an object")
    turns = []
    for t in (raw.get("turns") or [])[:2]:
        if not isinstance(t, dict):
            raise ValueError("bad turn")
        text = _DASHES.sub(", ", str(t.get("text", "")).replace("“", "").replace("”", "")).strip()
        mood = t.get("mood") if t.get("mood") in TURN_MOODS else "curious"
        stance = t.get("stance") if t.get("stance") in TURN_STANCES else "question"
        reply = t.get("replyTo") if (t.get("replyTo") == "user" or t.get("replyTo") in ids) else "user"
        turn = {"speaker": t.get("speaker"), "text": text, "mood": mood, "stance": stance, "replyTo": reply}
        basis = _DASHES.sub(", ", str(t.get("basis") or "")).strip()
        if basis:
            turn["basis"] = basis[:140]
        turns.append(turn)
    resp = {"turns": turns, "awaitingUser": not ending, "done": ending, "summary": None}
    if ending:
        s = raw.get("summary")
        if not isinstance(s, dict):
            raise ValueError("summary missing")
        per = []
        for p in s.get("perPersona") or []:
            if isinstance(p, dict):
                score = p.get("score")
                if isinstance(score, float):
                    score = int(round(score))
                per.append({"speaker": p.get("speaker"), "take": _DASHES.sub(", ", str(p.get("take", ""))), "score": score})
        have = {p["speaker"] for p in per}
        if any(pid not in have for pid in ids):
            raise ValueError("summary must cover every persona")
        resp["summary"] = {
            "verdict": _DASHES.sub(", ", str(s.get("verdict", ""))),
            "perPersona": [p for p in per if p["speaker"] in ids],
            "nextSteps": [_DASHES.sub(", ", str(x)) for x in (s.get("nextSteps") or [])][:3],
        }
    return resp


_SENT = re.compile(r"[^.!?]*[.!?]+|[^.!?]+$")


def _one_question(resp):
    """At most one question per round: earlier turns lose their questions, the last turn keeps its first one."""
    turns = resp["turns"]
    for i, t in enumerate(turns):
        sents = [x.strip() for x in _SENT.findall(t["text"]) if x.strip()]
        if i < len(turns) - 1:
            sents = [x for x in sents if not x.endswith("?")]
            if t["stance"] in ("question", "challenge"):
                t["stance"] = "disagree" if t["stance"] == "challenge" else "agree"
        else:
            out = []
            for x in sents:
                out.append(x)
                if x.endswith("?"):
                    break
            sents = out
        t["text"] = " ".join(sents)
    resp["turns"] = [t for t in turns if t["text"]]
    if resp["turns"]:
        resp["turns"][-1]["stance"] = "question" if resp["turns"][-1]["text"].endswith("?") else resp["turns"][-1]["stance"]
    return resp


def _llm_turns(req, ending):
    raw = llm.chat_json(build_system_prompt(req["personas"]), build_user_prompt(req, ending),
                        max_tokens=1200 if ending else 600)
    resp = _coerce(raw, req, ending)
    validate_turn_response(resp, req["personas"])
    return resp


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------
def next_turns(request, use_llm=None):
    """Implements turn contract v2. Raises ValueError on a bad request; otherwise always returns a valid response."""
    req = validate_turn_request(request, known_ids())
    ending = req["endCall"] or len(_user_answers(req["history"])) >= MAX_ANSWERS
    if use_llm is None:
        use_llm = llm.provider() is not None
    resp = None
    if use_llm:
        try:
            resp = _llm_turns(req, ending)
        except Exception as e:  # provider failure or invalid output: never break the call
            print(f"/turn LLM fallback to offline: {e!r}", flush=True)
    if resp is None:
        resp = _offline_done(req) if ending else _offline_turns(req)
    if not ending:
        resp = _one_question(resp)
    return validate_turn_response(resp, req["personas"])
