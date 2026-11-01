"""Deterministic mood engine (README section 5)."""


def mood_for_average(avg: float) -> str:
    if avg >= 4.5:
        return "slow_clap"
    if avg >= 4.0:
        return "impressed"
    if avg >= 3.0:
        return "skeptical"
    if avg >= 2.0:
        return "sarcastic"
    return "appalled"


def average(originality: int, feasibility: int, effort: int) -> float:
    return round((originality + feasibility + effort) / 3, 1)
