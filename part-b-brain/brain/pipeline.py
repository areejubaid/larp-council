"""PitchInput in, DebateScript plus events out."""
from .character import score_character
from .contract import validate_debate_script, validate_pitch_input
from .debate import generate_debate
from .events import Emitter
from .minds import get_mind, participants
from .scorer import score_idea
from .verdict import build_verdict


def run(pitch_input: dict, emitter=None, use_llm: bool = True) -> dict:
    validate_pitch_input(pitch_input)
    mode, chosen = pitch_input["mode"], pitch_input.get("chosenMindId")
    if mode == "larp":
        get_mind(chosen)  # fail early on an unknown mind
    em = emitter or Emitter(pitch_input["sessionId"])
    pitch = pitch_input["pitchText"]

    em.emit("pitch_received", {"mode": mode, "chosenMindId": chosen})

    idea = score_idea(pitch, use_llm)
    em.emit("idea_scored", idea)
    for mind_id in participants(mode, chosen):
        em.emit("mood_changed", {"mindId": mind_id, "mood": idea["mood"]})

    debate = generate_debate(pitch, idea, mode, chosen, use_llm)
    for line in debate["lines"]:
        em.emit("line_ready", line)
        if line["interruptsLineId"]:
            em.emit("interruption", {"lineId": line["lineId"], "mindId": line["mindId"],
                                     "interruptsLineId": line["interruptsLineId"]})
        if line["principleId"] == "rage_quit":
            em.emit("rage_quit", {"lineId": line["lineId"], "mindId": line["mindId"]})
        if line["principleId"] == "slow_clap":
            em.emit("slow_clap", {"lineId": line["lineId"], "mindId": line["mindId"]})

    character = None
    if mode == "larp":
        character = score_character(pitch, chosen, use_llm)
        em.emit("character_scored", {"mindId": chosen, "characterScore": character})

    verdict = build_verdict(idea["average"], character, debate["summary"], debate["roast"])
    em.emit("verdict_ready", verdict)

    script = {"version": 1, "sessionId": pitch_input["sessionId"], "mode": mode, "ideaScore": idea,
              "lines": debate["lines"], "characterScore": character, "verdict": verdict}
    return validate_debate_script(script)
