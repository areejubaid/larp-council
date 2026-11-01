# Run LARP Council locally

Three services, three terminals. Start from the repo root.

## Needs
* Python 3.10 or newer (Brain).
* Node 22 (Voice Studio and Hub).
* No API keys are required. Without keys the Brain uses offline scripts and Voice Studio can use mock tones.

## 1. Brain (port 8001)
* `cd part-b-brain`
* Optional, for real Claude calls: `pip install -r requirements.txt` and set `ANTHROPIC_API_KEY`.
* `PORT=8001 python3 server.py`
* Check: `curl http://localhost:8001/health` returns `{"ok": true, "llm": ...}`. `llm` is false in offline mode.
* Leave `EVENT_HUB_URL` unset, or every event shows twice.

## 2. Voice Studio (port 8787)
* `cd part_a_voice`
* Real voices: `ELEVENLABS_API_KEY=your-key node server.mjs`
* No key (mock tones): `MOCK_TTS=1 node server.mjs`
* The port is `PORT`, default 8787.
* The terminal prints `mode=LIVE` or `mode=MOCK`.

## 3. Hub and UI (port 3000)
* `cd part-c-experience`
* `npm install` (first time only)
* `BRAIN_URL=http://localhost:8001/run VOICE_URL=http://localhost:8787 npm start`
* Open http://localhost:3000
* `BRAIN_URL` must end in `/run`. Without it the hub plays demo replays.
* Without `VOICE_URL` the app is text only.

## Check everything
* From the repo root: `node tools/design-kit.mjs doctor`
* It checks the Brain health, Voice Studio `/api/voices` and Hub `/healthz`.
* To check deployed services, set `BRAIN_HEALTH`, `VOICE_HEALTH` and `HUB_HEALTH` to the full check URLs.

## Cache demo audio (do this before the demo)
* Start Voice Studio with the real key, then run `cd part_a_voice && node prerender.mjs`.
* Optional argument: the voice server URL, default `http://localhost:8787`.
* It caches every line from the mock scripts so the demo works offline and spends no credits.
* Set `BRAIN_URL` (ending in `/run`) when running it to also cache lines from the pitches in `part-b-brain/DEMO_PITCHES.md`.

## Tests
* Brain: `cd part-b-brain && python3 -m unittest discover -s tests -t .`
* Hub: `cd part-c-experience && npm test`

## Troubleshooting
* Robotic browser voice: a line failed on the voice server and the browser voice took over. Check the Voice Studio terminal for the error (key, credits, rate limit).
* Terminal shows `mode=MOCK`: the key is not set or `MOCK_TTS=1` is on. Restart with `ELEVENLABS_API_KEY` set and no `MOCK_TTS`.
* UI shows "Text only": `VOICE_URL` is missing on the hub, or the voice server is down. Restart the hub with `VOICE_URL`.
* UI shows "Demo replay": the hub could not reach the Brain. Check `BRAIN_URL` ends in `/run` and the Brain is running.
* Free Render services sleep when idle. Open the Brain `/health` and the hub `/healthz` a few minutes before the demo, then run one pitch. The first request can take about a minute.
* Microphone does not work: use Chrome or Edge, allow the mic, or type the pitch.
* Port already in use: change `PORT` for that service and update `BRAIN_URL` or `VOICE_URL` to match.
