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
