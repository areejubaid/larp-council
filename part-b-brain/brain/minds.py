import json
from functools import lru_cache
from pathlib import Path

_DIR = Path(__file__).parent / "data" / "minds"


@lru_cache(maxsize=1)
def all_minds() -> dict:
    out = {}
    for p in sorted(_DIR.glob("*.json")):
        m = json.loads(p.read_text(encoding="utf-8"))
        out[m["id"]] = m
    return out


def get_mind(mind_id: str) -> dict:
    minds = all_minds()
    if mind_id not in minds:
        raise ValueError(f"unknown mind '{mind_id}', pick one of {sorted(minds)}")
    return minds[mind_id]


def principle(mind_id: str, principle_id: str):
    for p in get_mind(mind_id)["principles"]:
        if p["id"] == principle_id:
            return p
    return None


def participants(mode: str, chosen) -> list:
    """In LARP mode the player is the chosen mind, so the other minds react."""
    ids = list(all_minds())
    if mode == "larp" and chosen:
        ids = [i for i in ids if i != chosen]
    return ids
