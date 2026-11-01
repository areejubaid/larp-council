"""The three heavy steps as plain JSON-in, JSON-out functions.

README asks for these to be Render Workflows tasks: score_idea, generate_debate,
score_character. Render Workflows is in public beta, so check the installed SDK
source for the exact decorator and trigger signatures, then wrap these functions
with it. Nothing here depends on the SDK, so the wrapping is the only edit needed.
"""
from . import character, debate, scorer


def score_idea(pitch_text: str) -> dict:
    return scorer.score_idea(pitch_text)


def generate_debate(pitch_text: str, idea_score: dict, mode: str, chosen_mind_id=None) -> dict:
    return debate.generate_debate(pitch_text, idea_score, mode, chosen_mind_id)


def score_character(pitch_text: str, mind_id: str) -> int:
    return character.score_character(pitch_text, mind_id)
