"""Shared contract v1 (README section 8) as plain validators. No dependencies."""

MOODS = ("slow_clap", "impressed", "skeptical", "sarcastic", "appalled")
EVENT_TYPES = (
    "pitch_received", "idea_scored", "mood_changed", "line_ready", "audio_started",
    "interruption", "rage_quit", "slow_clap", "character_scored", "verdict_ready", "email_sent",
)
# Special principleIds the Brain uses to mark the two big comedy beats.
# The contract has no field for them, so this is an assumption to confirm with Parts A and C.
SPECIAL_PRINCIPLES = ("rage_quit", "slow_clap")


def _need(cond, msg):
    if not cond:
        raise ValueError(msg)


def validate_pitch_input(p):
    _need(isinstance(p, dict), "PitchInput must be an object")
    _need(isinstance(p.get("sessionId"), str) and p["sessionId"], "sessionId required")
    _need(p.get("mode") in ("larp", "roast"), "mode must be 'larp' or 'roast'")
    _need(isinstance(p.get("pitchText"), str) and p["pitchText"].strip(), "pitchText required")
    if p["mode"] == "larp":
        _need(isinstance(p.get("chosenMindId"), str) and p["chosenMindId"], "chosenMindId required in larp mode")
    return p


def validate_idea_score(s):
    for k in ("originality", "feasibility", "effort"):
        _need(isinstance(s.get(k), int) and 1 <= s[k] <= 5, f"{k} must be an int 1-5")
    _need(isinstance(s.get("average"), (int, float)) and 1 <= s["average"] <= 5, "average must be 1-5")
    _need(s.get("mood") in MOODS, f"mood must be one of {MOODS}")
    return s


def validate_debate_line(line, earlier_ids=()):
    for k in ("lineId", "mindId", "text", "mood", "principleId", "sourceNote"):
        _need(isinstance(line.get(k), str) and line[k], f"line.{k} must be a non-empty string")
    _need(line["mood"] in MOODS, "line.mood invalid")
    ref = line.get("interruptsLineId")
    _need(ref is None or ref in earlier_ids, "interruptsLineId must be null or an earlier lineId")
    return line


def validate_debate_script(d):
    _need(d.get("version") == 1, "version must be 1")
    _need(isinstance(d.get("sessionId"), str), "sessionId required")
    _need(d.get("mode") in ("larp", "roast"), "mode invalid")
    validate_idea_score(d.get("ideaScore") or {})
    lines = d.get("lines")
    _need(isinstance(lines, list) and lines, "lines must be a non-empty list")
    seen = []
    for line in lines:
        validate_debate_line(line, seen)
        seen.append(line["lineId"])
    cs = d.get("characterScore")
    _need(cs is None or (isinstance(cs, int) and 0 <= cs <= 100), "characterScore must be null or 0-100")
    v = d.get("verdict") or {}
    _need(isinstance(v.get("embarrassmentScore"), int) and 0 <= v["embarrassmentScore"] <= 100, "embarrassmentScore 0-100")
    _need(isinstance(v.get("summary"), str) and v["summary"], "verdict.summary required")
    _need(isinstance(v.get("roast"), str) and v["roast"], "verdict.roast required")
    return d


def validate_event(e):
    _need(e.get("version") == 1, "event version must be 1")
    _need(e.get("type") in EVENT_TYPES, f"unknown event type {e.get('type')}")
    _need(isinstance(e.get("payload"), dict), "payload must be an object")
    return e


# ---------------------------------------------------------------------------
# Turn contract version 2 (LARP Council): POST /turn
# ---------------------------------------------------------------------------
TURN_MOODS = ("curious", "skeptical", "impressed", "annoyed", "supportive")
TURN_STANCES = ("question", "agree", "disagree", "challenge", "advice")
MAX_IDEA_CHARS = 2000
MAX_TEXT_CHARS = 2000
MAX_HISTORY = 60


def validate_turn_request(r, known_ids):
    """Check a /turn request and return a normalized copy. Raises ValueError on bad input."""
    _need(isinstance(r, dict), "request must be a JSON object")
    sid = r.get("sessionId", "s1")
    _need(isinstance(sid, str) and sid.strip(), "sessionId must be a non-empty string")
    idea = r.get("idea")
    _need(isinstance(idea, str) and idea.strip(), "idea is required")
    _need(len(idea) <= MAX_IDEA_CHARS, f"idea must be at most {MAX_IDEA_CHARS} characters")
    personas = r.get("personas", list(known_ids))
    _need(isinstance(personas, list) and personas, "personas must be a non-empty list of ids")
    for p in personas:
        _need(isinstance(p, str) and p in known_ids, f"unknown persona {p!r}; known: {', '.join(known_ids)}")
    personas = list(dict.fromkeys(personas))
    history = r.get("history", [])
    _need(isinstance(history, list), "history must be a list")
    _need(len(history) <= MAX_HISTORY, f"history must have at most {MAX_HISTORY} items")
    clean = []
    for h in history:
        _need(isinstance(h, dict), "each history item must be an object")
        sp, tx = h.get("speaker"), h.get("text")
        _need(isinstance(sp, str) and sp.strip(), "history speaker must be a string")
        _need(isinstance(tx, str), "history text must be a string")
        _need(len(tx) <= MAX_TEXT_CHARS, f"history text must be at most {MAX_TEXT_CHARS} characters")
        clean.append({"speaker": sp, "text": tx})
    end = r.get("endCall", False)
    _need(isinstance(end, bool), "endCall must be a boolean")
    return {"sessionId": sid, "idea": idea.strip(), "personas": personas, "history": clean, "endCall": end}


def validate_turn(t, known_ids):
    _need(isinstance(t, dict), "turn must be an object")
    _need(t.get("speaker") in known_ids, "turn.speaker must be a persona id")
    _need(isinstance(t.get("text"), str) and t["text"].strip(), "turn.text must be a non-empty string")
    _need(len(t["text"]) <= 800, "turn.text too long")
    _need(t.get("mood") in TURN_MOODS, f"turn.mood must be one of {TURN_MOODS}")
    _need(t.get("stance") in TURN_STANCES, f"turn.stance must be one of {TURN_STANCES}")
    _need(t.get("replyTo") == "user" or t.get("replyTo") in known_ids, "turn.replyTo must be 'user' or a persona id")
    return t


def validate_summary(s, known_ids):
    _need(isinstance(s, dict), "summary must be an object")
    _need(isinstance(s.get("verdict"), str) and s["verdict"].strip(), "summary.verdict required")
    pp = s.get("perPersona")
    _need(isinstance(pp, list) and pp, "summary.perPersona must be a non-empty list")
    for p in pp:
        _need(isinstance(p, dict) and p.get("speaker") in known_ids, "perPersona.speaker must be a persona id")
        _need(isinstance(p.get("take"), str) and p["take"].strip(), "perPersona.take required")
        _need(isinstance(p.get("score"), int) and not isinstance(p["score"], bool) and 1 <= p["score"] <= 10,
              "perPersona.score must be an int 1-10")
    ns = s.get("nextSteps")
    _need(isinstance(ns, list) and len(ns) == 3 and all(isinstance(x, str) and x.strip() for x in ns),
          "summary.nextSteps must be 3 non-empty strings")
    return s


def validate_turn_response(resp, known_ids):
    """Check a /turn response against contract v2. Raises ValueError on any violation."""
    _need(isinstance(resp, dict), "response must be an object")
    turns = resp.get("turns")
    _need(isinstance(turns, list), "turns must be a list")
    _need(isinstance(resp.get("awaitingUser"), bool), "awaitingUser must be a boolean")
    _need(isinstance(resp.get("done"), bool), "done must be a boolean")
    if resp["done"]:
        _need(len(turns) <= 2, "turns must have at most 2 items")
        _need(resp["awaitingUser"] is False, "awaitingUser must be false when done")
        validate_summary(resp.get("summary"), known_ids)
    else:
        _need(1 <= len(turns) <= 2, "turns must have 1 or 2 items")
        _need(resp.get("summary") is None, "summary must be null until done")
    for t in turns:
        validate_turn(t, known_ids)
    if resp["awaitingUser"]:
        _need(turns and "?" in turns[-1]["text"], "when awaitingUser is true the last turn must ask a question")
    return resp
