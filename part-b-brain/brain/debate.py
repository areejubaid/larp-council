"""Debate generator: lines with audio tags, interruptions, rivalries, principle ids.

Uses Claude when a key is set, otherwise (or on any failure) a written-by-hand
offline script, so the demo never depends on the network.
"""
import json

from . import llm
from .minds import all_minds, get_mind, participants, principle

RAGE_QUIT_NOTE = "Comedy beat, not a sourced principle."
SLOW_CLAP_NOTE = "Comedy beat, not a sourced principle."

# (mindId, text, principleId, interruptsPrevious)
TEMPLATES = {
    "appalled": [
        ("perfectionist", "[long pause] [deadpan] I have seen cluttered ideas. This is not an idea. This is a junk drawer.", "taste_saying_no", False),
        ("engineer", "[interrupting] [dry laugh] The hard constraint here is the entire concept. Physics would like its afternoon back.", "first_principles_constraint", True),
        ("operator", "[softly] I want to be fair. Who are the first hundred users? [pause] Right. Nobody.", "first_hundred_users", False),
        ("perfectionist", "[sharply] And whose fault is this? You two keep shouting ship it, and look what ships.", "whole_experience", False),
        ("engineer", "[overlapping] My fault? You would cut every feature, including the point.", "cost_per_unit", True),
        ("operator", "[quietly] I am going to step out. I wish you luck. I mean that as the harshest thing I can say.", "rage_quit", False),
    ],
    "sarcastic": [
        ("perfectionist", "[sighs] There are fourteen ideas in here wearing a trench coat. Pick one.", "taste_saying_no", False),
        ("engineer", "[interrupting] [chuckles] Incremental. You found a slightly better version of something that already works fine.", "first_principles_constraint", True),
        ("operator", "[evenly] Growth is a strong word for what I just heard. Where do the users come from?", "first_hundred_users", False),
        ("perfectionist", "[dry] The Operator's answer is always a funnel. Of course it is.", "whole_experience", False),
        ("engineer", "[laughs] And yours is always fewer buttons. Neither of you asked if it can be built by Friday.", "ambitious_timeline", True),
    ],
    "skeptical": [
        ("perfectionist", "[thoughtful] There is something here. I just cannot tell what you decided to leave out.", "first_ten_seconds", False),
        ("operator", "[calmly] Interesting, but nothing here makes me feel urgency. Why now?", "speed_of_learning", False),
        ("engineer", "[slowly] [pause] Okay. What is the hard part? Because I do not see the hard part yet.", "first_principles_constraint", False),
    ],
    "impressed": [
        ("engineer", "[pause] [surprised] Huh. That is actually a constraint-aware answer. I did not expect that.", "first_principles_constraint", False),
        ("perfectionist", "[quietly] The first ten seconds work. That is rare. Do not clutter it.", "first_ten_seconds", False),
        ("operator", "[warmly] I can see the first hundred users. I can see the next thousand. Keep going.", "first_hundred_users", False),
    ],
    "slow_clap": [
        ("engineer", "[stunned silence] [exhales] I came here to find the flaw. I cannot find the flaw.", "first_principles_constraint", False),
        ("operator", "[quiet] [pause] The compounding is obvious. Nobody say anything.", "compounding_growth", False),
        ("perfectionist", "[slow clap] [grudgingly] ... Fine.", "slow_clap", False),
    ],
}

SUMMARIES = {
    "appalled": "The council rejected this idea so hard that one member left the call.",
    "sarcastic": "The council found too many ideas, too little focus, and no path to users.",
    "skeptical": "The council sees promise but wants to know what was left out and why now.",
    "impressed": "The council is impressed and warns you not to clutter it.",
    "slow_clap": "The council could not find a flaw, and one of them said fine.",
}
ROASTS = {
    "appalled": "The council did not just disagree with this pitch. One of them left the call. It was cluttered, unconstrained, and had no users, which is a rare triple. Reading the room is a skill, and this pitch read none of it.",
    "sarcastic": "This pitch had fourteen ideas, zero users, and a timeline that physics laughed at. The council argued about whose fault it was instead of fixing it, which tells you everything about the pitch.",
    "skeptical": "Not bad, not good, just a pitch the council could not stop asking questions about. Next time bring answers, not a vibe.",
    "impressed": "The council is impressed, which is the most annoying thing they could do to you, because now you have to keep going.",
    "slow_clap": "There is nothing to roast. The council checked three times. Please enjoy this brief moment, because it will not last.",
}

SYSTEM = (
    "You write a short, funny, sarcastic spoken debate between AI parody 'minds' reacting to a pitch. "
    "Rules: original lines only, never real quotes; roast the idea and the thinking style only, never private life, health or family. "
    "Each line is 1-2 sentences, with ElevenLabs v3 audio tags in square brackets like [sighs], [interrupting], [laughs], [whispers]. "
    "Each line must use one principleId from that mind's own principles. "
    "Reply with ONLY JSON: "
    '{"lines":[{"mindId":str,"text":str,"principleId":str,"interruptsPrevious":bool}],"summary":str,"roast":str}. '
    "summary is one sentence. roast is about 40 words."
)


def _mood_rules(mood):
    return {
        "appalled": "Mood: appalled. 6-8 lines. At least one line interrupts the previous one. The minds blame each other. "
                    "The LAST line is one mind rage quitting the call, with principleId \"rage_quit\".",
        "sarcastic": "Mood: sarcastic. 5-7 lines. The minds argue with each other and interrupt at least once.",
        "skeptical": "Mood: skeptical. 3-5 lines. Measured doubt, no insults.",
        "impressed": "Mood: impressed. 3-4 lines. Grudging respect.",
        "slow_clap": "Mood: slow clap. 3-4 lines. The minds go quiet, then the LAST line is one mind grudgingly saying 'fine' "
                     "after a slow clap, with principleId \"slow_clap\".",
    }[mood]


def _profiles(parts):
    out = []
    for mid in parts:
        m = get_mind(mid)
        out.append({"mindId": mid, "name": m["name"], "sarcasmTriggers": m["sarcasmTriggers"],
                    "rivalries": m["rivalries"],
                    "principles": [{"id": p["id"], "text": p["text"]} for p in m["principles"]]})
    return json.dumps(out)


def _source_note(mind_id, principle_id):
    if principle_id == "rage_quit":
        return RAGE_QUIT_NOTE
    if principle_id == "slow_clap":
        return SLOW_CLAP_NOTE
    p = principle(mind_id, principle_id)
    return p["sourceNote"] if p else RAGE_QUIT_NOTE


def _build_lines(raw, parts, mood):
    """Turn (mindId, text, principleId, interruptsPrevious) tuples into DebateLines."""
    lines = []
    for mind_id, text, pid, interrupts in raw:
        if mind_id not in parts:
            if pid in ("rage_quit", "slow_clap"):
                mind_id = parts[-1]  # the beat still happens, with someone who is present
            else:
                continue
        if pid not in ("rage_quit", "slow_clap") and principle(mind_id, pid) is None:
            pid = get_mind(mind_id)["principles"][0]["id"]
        lines.append({
            "lineId": f"l{len(lines) + 1}",
            "mindId": mind_id,
            "text": text.strip(),
            "mood": mood,
            "interruptsLineId": lines[-1]["lineId"] if (interrupts and lines) else None,
            "principleId": pid,
            "sourceNote": _source_note(mind_id, pid),
        })
    return lines


def _enforce(lines, parts, mood):
    """Guarantee the comedy beats the README requires, whatever the model wrote."""
    pids = {l["principleId"] for l in lines}
    if mood == "appalled":
        if "rage_quit" not in pids:
            lines += _build_lines([(parts[-1], "[quietly] I am going to step out. I wish you luck.", "rage_quit", False)], parts, mood)
            lines[-1]["lineId"] = f"l{len(lines)}"
        if not any(l["interruptsLineId"] for l in lines) and len(lines) > 1:
            lines[1]["interruptsLineId"] = lines[0]["lineId"]
            if "[interrupting]" not in lines[1]["text"]:
                lines[1]["text"] = "[interrupting] " + lines[1]["text"]
    if mood == "slow_clap" and "slow_clap" not in pids:
        lines += _build_lines([(parts[-1], "[slow clap] [grudgingly] ... Fine.", "slow_clap", False)], parts, mood)
        lines[-1]["lineId"] = f"l{len(lines)}"
    return lines


def generate_offline(mood, parts):
    return {"lines": _enforce(_build_lines(TEMPLATES[mood], parts, mood), parts, mood),
            "summary": SUMMARIES[mood], "roast": ROASTS[mood]}


def generate_debate(pitch, idea_score, mode, chosen=None, use_llm=True):
    mood = idea_score["mood"]
    parts = participants(mode, chosen)
    if use_llm and llm.available():
        try:
            who = f" The player is LARPing as {get_mind(chosen)['name']}; the minds react to that." if mode == "larp" else ""
            user = (f"Pitch:\n{pitch}\n\nIdea score: {json.dumps(idea_score)}\n{_mood_rules(mood)}{who}\n"
                    f"Minds present: {_profiles(parts)}")
            raw = llm.ask_json(SYSTEM, user, max_tokens=3000)
            tuples = [(l["mindId"], l["text"], l.get("principleId", ""), bool(l.get("interruptsPrevious")))
                      for l in raw["lines"]]
            lines = _enforce(_build_lines(tuples, parts, mood), parts, mood)
            if lines and raw.get("summary") and raw.get("roast"):
                return {"lines": lines, "summary": str(raw["summary"]), "roast": str(raw["roast"])}
        except Exception:
            pass  # fall through to the offline script
    return generate_offline(mood, parts)
