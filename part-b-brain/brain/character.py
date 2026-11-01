"""Character Consistency Score for LARP Mode (0-100)."""
import json
import re

from . import llm
from .minds import get_mind

SYSTEM = (
    "You judge how consistently a pitch sounds like a given thinking style. "
    "You get the style's principles, decision habit words and vocabulary. "
    "Reply with ONLY JSON: {\"score\": int 0-100}. Be strict: generic pitches score under 40."
)


def score_offline(pitch: str, mind_id: str) -> int:
    """Keyword heuristic so LARP mode works with no API key."""
    text = pitch.lower()
    vocab = get_mind(mind_id)["vocabulary"]
    hits = sum(1 for w in vocab if w in text)
    words = len(re.findall(r"\w+", text))
    score = 20 + hits * 14 + (10 if words >= 20 else 0)
    return max(0, min(95, score))


def score_character(pitch: str, mind_id: str, use_llm: bool = True) -> int:
    if use_llm and llm.available():
        try:
            m = get_mind(mind_id)
            user = (f"Style: {m['name']}\nPrinciples: {json.dumps([p['text'] for p in m['principles']])}\n"
                    f"Vocabulary: {json.dumps(m['vocabulary'])}\nPitch:\n{pitch}")
            raw = llm.ask_json(SYSTEM, user, max_tokens=200)
            return max(0, min(100, int(raw["score"])))
        except Exception as e:
            llm.note_failure(e)
    return score_offline(pitch, mind_id)
