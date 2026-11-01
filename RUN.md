# Run LARP Council locally

## Setup
* Python 3.10 or newer and Node 22.
* `git pull` to get the latest version.
* `export ELEVENLABS_API_KEY=your_key` for real voices.
* Set one LLM key: `export ANTHROPIC_API_KEY=your_key` or `export FEATHERLESS_API_KEY=your_key`.
* Optional: `export FEATHERLESS_MODEL=model_name` to pick the Featherless model.
* With no LLM key the Brain uses its offline fallback. With no ElevenLabs key the voices are mock tones.

## Start
* From the repo root run `./start.sh`.
* It starts the Brain (8001), Voice Studio (8787) and the Hub with the UI (3000).
* Open http://localhost:3000
* Type an idea or life decision, then press Join the call.
* Answer each question by voice or text. End the call to get the summary.
* Press Ctrl+C to stop everything.

## Optional
* `./start.sh --cache` caches the demo voice lines first, so the demo works offline.
* `node tools/design-kit.mjs doctor` checks all three services.

## Tests
* Brain: `cd part-b-brain && python3 -m unittest discover -s tests -t .`
* Hub: `cd part-c-experience && npm test`

## Troubleshooting
* Robotic browser voice: a voice line failed and the browser voice took over. Check `.logs/voice.log` for the error (key, credits, rate limit).
* Generic answers that ignore your idea: no LLM key is set. Run `curl localhost:8001/health`, which reports the provider (anthropic, featherless or offline). Set a key and restart.
* Voice log says mock mode: `ELEVENLABS_API_KEY` was not set in the terminal that ran `./start.sh`.
* Microphone does not work: use Chrome or Edge and allow the mic, or type your answer.
* Port already in use: stop the old process and run `./start.sh` again.
* Other logs: `.logs/brain.log` and `.logs/hub.log`.
