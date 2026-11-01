"""Render Workflows entry point for the Brain.

Start command on Render:   render-workflows workflow_app:app
Local dev server:          render ea tasks dev -- render-workflows workflow_app:app

Written against render 1.6.0 (PyPI package `render`; `render_sdk` is only a shim).
Task inputs and outputs are plain JSON, so Parts A and C can trigger them with
render.workflows.run_task("<workflow-slug>/<task name>", [args]).
"""
from render import Retry, TaskContext, Workflows

from brain import tasks as brain_tasks
from brain.events import Emitter
from brain.pipeline import run

app = Workflows(
    default_retry=Retry(max_retries=2, wait_duration_ms=500),
    default_timeout=120,
)


@app.task
def score_idea(ctx: TaskContext, pitch_text: str) -> dict:
    return brain_tasks.score_idea(pitch_text)


@app.task
def generate_debate(ctx: TaskContext, pitch_text: str, idea_score: dict, mode: str, chosen_mind_id: str | None = None) -> dict:
    return brain_tasks.generate_debate(pitch_text, idea_score, mode, chosen_mind_id)


@app.task
def score_character(ctx: TaskContext, pitch_text: str, mind_id: str) -> int:
    return brain_tasks.score_character(pitch_text, mind_id)


@app.task(timeout_seconds=90)
def run_pitch(ctx: TaskContext, pitch_input: dict) -> dict:
    """Whole loop in one task (lowest latency). Streams events to EVENT_HUB_URL if it is set."""
    return run(pitch_input, Emitter(pitch_input.get("sessionId", "s1")))
