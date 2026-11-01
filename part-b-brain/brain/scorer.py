"""Idea scorer: originality, feasibility, effort (1-5), strict JSON, schema checked."""
import re

from . import llm
from .contract import validate_idea_score
from .mood import average, mood_for_average

SYSTEM = (
    "You score startup and hackathon ideas. Be honest and a little harsh. "
    "Reply with ONLY a JSON object: "
    '{"originality": int 1-5, "feasibility": int 1-5, "effort": int 1-5}. '
    "effort means how much real work the pitcher has shown (detail, specifics, thought), not how hard the idea is."
)

CLICHES = ("uber for", "on the blockchain", "but with ai", "social network", "to-do", "todo app", "tinder for", "airbnb for")
SPECIFICS = ("first hundred", "users", "cost", "ship", "friday", "per session", "customers", "pilot")
IMPOSSIBLE = ("quantum", "agi", "teleport", "time travel", "all of humanity", "cure everything", "perpetual")


def _clamp(n) -> int:
    return max(1, min(5, int(round(n))))


def score_offline(pitch: str) -> dict:
    """Rough heuristic so the demo works with no API key. Not a real judgment."""
    text = pitch.lower()
    words = len(re.findall(r"\w+", text))
    cliches = sum(c in text for c in CLICHES)
    specifics = sum(m in text for m in SPECIFICS)
    originality = 3 - cliches + (1 if words > 40 else 0)
    feasibility = 4 - sum(c in text for c in IMPOSSIBLE) - (1 if cliches >= 2 else 0) + (1 if specifics >= 3 else 0)
    effort = 1 if words < 12 else 2 if words < 20 else 3 if words < 40 else 4 if words < 70 else 5
    effort += 1 if specifics >= 3 else 0
    return {"originality": _clamp(originality), "feasibility": _clamp(feasibility), "effort": _clamp(effort)}


def score_idea(pitch: str, use_llm: bool = True) -> dict:
    raw = None
    if use_llm and llm.available():
        try:
            raw = llm.ask_json(SYSTEM, f"Pitch:\n{pitch}")
            for k in ("originality", "feasibility", "effort"):
                raw[k] = _clamp(raw[k])
        except Exception:
            raw = None
    if raw is None:
        raw = score_offline(pitch)
    avg = average(raw["originality"], raw["feasibility"], raw["effort"])
    out = {"originality": raw["originality"], "feasibility": raw["feasibility"], "effort": raw["effort"],
           "average": avg, "mood": mood_for_average(avg)}
    return validate_idea_score(out)
