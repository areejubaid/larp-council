# Part B: Brain

Takes a `PitchInput` and returns a `DebateScript` plus a stream of events (contract v1, main README section 8).

## Run it

Needs Python 3.10+. Offline mode needs nothing else. For live Claude calls:

```
pip install -r requirements.txt
set ANTHROPIC_API_KEY=your-key     (PowerShell: $env:ANTHROPIC_API_KEY = 'your-key')
```

Standalone test from this folder:

```
python -m brain.cli mocks/bad_idea_pitch.txt --offline
python -m brain.cli mocks/good_idea_pitch.txt --mode larp --mind perfectionist
```

It prints a `DebateScript` that has been checked against the contract. Add `--events-out file.json` to save the event replay, `--out file.json` to save the script.

Unit tests: `python -m unittest discover -s tests -t .`

## How it works

| Step | File | Notes |
| --- | --- | --- |
| Idea scorer | `brain/scorer.py` | Claude returns strict JSON, schema checked. Offline heuristic as fallback. |
| Mood engine | `brain/mood.py` | Deterministic thresholds from README section 5. |
| Debate generator | `brain/debate.py` | Audio tags, interruptions, principle ids. Guarantees an interruption + rage quit on `appalled`, and a slow clap on `slow_clap`. |
| Character scorer | `brain/character.py` | LARP mode only. |
| Verdict | `brain/verdict.py` | Embarrassment Score. |
| Events | `brain/events.py` | Set `EVENT_HUB_URL` to POST events to Part C. |
| Render tasks | `brain/tasks.py`, `workflow_app.py` | JSON in, JSON out. `workflow_app.py` registers `score_idea`, `generate_debate`, `score_character` and `run_pitch` (whole loop) as Render Workflows tasks. |

Every Claude call falls back to the offline script on error, so the demo never depends on the network.

## Deploy on Render (free Web Service)

`server.py` is a small HTTP server (standard library only):

- `GET /health` returns `{"ok": true, "llm": <bool>}`
- `POST /run` takes a `PitchInput` and returns `{"script": <DebateScript>, "events": [<Event>, ...]}`. Bad input gets a 400. CORS is open so the browser frontend can call it directly.

In Render choose **New → Web Service**, connect this repo, then:

| Field | Value |
| --- | --- |
| Branch | `main` |
| Language | Python 3 |
| Root Directory | `part-b-brain` |
| Build Command | `pip install -r requirements.txt` |
| Start Command | `python server.py` |
| Instance type | Free |
| Env vars | `ANTHROPIC_API_KEY` (optional, offline scripts are used without it), `EVENT_HUB_URL` (optional) |

Test it (replace the URL with yours):

```
curl https://YOUR-SERVICE.onrender.com/health
curl -X POST https://YOUR-SERVICE.onrender.com/run -H "Content-Type: application/json" -d "{\"sessionId\":\"s1\",\"mode\":\"roast\",\"pitchText\":\"Uber for toasters on the blockchain but with AI.\"}"
```

Free web services sleep when idle, so the first request can take a while. Open `/health` a few minutes before a demo to wake it.

## Render Workflows (optional, paid)

Not used for the free deploy. Install with `pip install -r requirements-workflow.txt`.

Written against `render` 1.6.0 on PyPI (`render_sdk` is only a shim that installs it). Render Workflows is in beta, so the API may change.

In the Render dashboard, create a **Workflow** service from this repo:

- Root directory: `part-b-brain`
- Build command: `pip install -r requirements-workflow.txt`
- Start command: `render-workflows workflow_app:app`
- Environment variables: `ANTHROPIC_API_KEY`, optional `EVENT_HUB_URL` (Part C's hub)

Local dev server (needs the Render CLI): `render ea tasks dev -- render-workflows workflow_app:app`

Trigger from Python (Parts A and C, or a quick test):

```python
from render import Render
render = Render()  # needs RENDER_API_KEY
script = render.workflows.run_task("<workflow-slug>/run_pitch", [
    {"sessionId": "s1", "mode": "roast", "pitchText": "An app that ..."}
])
```

Not tested on Render yet (needs the account and a deploy).

## Mocks for Parts A and C

`mocks/bad_idea_script.json`, `mocks/good_idea_script.json`, `mocks/larp_script.json`, `mocks/event_replay.json`.

## Things to confirm with Parts A and C

1. **Rage quit and slow clap markers.** The contract has no field for them. The Brain marks those lines with `principleId: "rage_quit"` / `"slow_clap"` and also emits the `rage_quit` / `slow_clap` events. If you want a dedicated field, that is a contract change (needs all three owners).
2. **`mindId`s** are `perfectionist`, `engineer`, `operator`.
3. **`mood` values** are `slow_clap`, `impressed`, `skeptical`, `sarcastic`, `appalled`.
4. **Source notes** in `brain/data/minds/*.json` are short honest notes on the kind of public source each principle is based on. They contain no links or quotes.
5. In LARP mode the chosen mind is the player, so only the other minds speak.

# LARP Council conversation engine (turn contract v2)

The Brain also runs the LARP Council call: AI personas of Steve Jobs, Elon Musk, Sam Altman and Warren Buffett react to an idea, a project or a life decision. They are AI simulations built from public interviews, talks and writing, not the real people, and nothing they say is a real quote.

## Endpoints

- `GET /personas` returns `[{"id", "name", "role", "lens", "color"}]` for `jobs`, `musk`, `altman`, `buffett`.
- `POST /turn` takes `{"sessionId", "idea", "personas", "history", "endCall"}` and returns `{"turns", "awaitingUser", "done", "summary"}`. Only `idea` is required. `history` is a list of `{"speaker", "text"}` where the user is `"user"`; it is empty on the first call and the newest user answer is last. Each turn has `speaker`, `text`, `mood` (curious, skeptical, impressed, annoyed, supportive), `stance` (question, agree, disagree, challenge, advice) and `replyTo` (`"user"` or a persona id). The server returns 1 or 2 turns, and the last one asks the user a question. When `endCall` is true, or after 5 user answers, it returns `done: true`, one short closing turn, and a `summary` with `verdict`, `perPersona` (take and score 1 to 10) and 3 `nextSteps`.
- `GET /health` now also returns `"provider": "anthropic" | "featherless" | "offline"`.
- Bad input gets a 400 with `{"error": "..."}`. The `/turn` body limit is 60000 bytes. CORS is open.

```
curl -X POST localhost:8000/turn -H "Content-Type: application/json" -d "{\"sessionId\":\"s1\",\"idea\":\"Google Maps for jobs\"}"
```

## LLM providers and env vars

The first available provider wins, and any error or invalid output falls back to the offline engine, so a call never breaks.

- `ANTHROPIC_API_KEY`: use Anthropic. `BRAIN_MODEL` picks the model (default `claude-sonnet-5-5`). Needs `pip install anthropic`.
- `FEATHERLESS_API_KEY`: use Featherless through its OpenAI compatible API. `FEATHERLESS_MODEL` picks the model (default `meta-llama/Meta-Llama-3.1-70B-Instruct`). Uses only the standard library.
- Neither key: offline engine. It classifies the idea as a startup or a life decision, pulls key words from the idea and the latest answer, and fills persona specific templates with a seeded random from `sessionId` plus the turn count, so a session is repeatable and different ideas get different conversations.
- `BRAIN_OFFLINE=1` forces offline even when a key is set.

Provider calls time out after about 25 seconds and retry once on invalid JSON.

## Files

- `brain/data/personas/*.json`: profiles with principles paraphrased from public material, question habits, speaking style, what impresses and annoys them, and a list of source titles (no links, no quotes).
- `brain/conversation.py`: `next_turns(request)`, speaker choice, LLM prompt and the offline path.
- `brain/offline.py`: offline templates. `brain/textutil.py`: classification and key phrase extraction.
- `brain/contract.py`: `validate_turn_request` and `validate_turn_response`.
- `tests/test_conversation.py`: engine and HTTP tests.

