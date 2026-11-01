"""Embarrassment Score and verdict assembly."""


def embarrassment_score(average: float, character_score=None) -> int:
    """0 = flawless, 100 = maximum embarrassment.

    Roast mode: how far the idea is from a 5.
    LARP mode: 60% idea disappointment, 40% how badly you broke character.
    """
    disappointment = (5 - average) / 4 * 100
    if character_score is None:
        return round(max(0, min(100, disappointment)))
    return round(max(0, min(100, 0.6 * disappointment + 0.4 * (100 - character_score))))


def build_verdict(average: float, character_score, summary: str, roast: str) -> dict:
    return {"embarrassmentScore": embarrassment_score(average, character_score),
            "summary": summary, "roast": roast}
