"""The three heavy steps as plain JSON-in, JSON-out functions.

workflow_app.py (repo folder root) registers these as Render Workflows tasks.
Nothing in this file depends on the Render SDK, so it also runs in tests and the CLI.
"""
from . import character, debate, scorer


def score_idea(pitch_text: str) -> dict:
    return scorer.score_idea(pitch_text)


def generate_debate(pitch_text: str, idea_score: dict, mode: str, chosen_mind_id=None) -> dict:
    return debate.generate_debate(pitch_text, idea_score, mode, chosen_mind_id)


def score_character(pitch_text: str, mind_id: str) -> int:
    return character.score_character(pitch_text, mind_id)
