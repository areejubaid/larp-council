# Run LARP Council locally

## Setup
* Python 3.10 or newer, Node 22 and Chrome (Edge also works). Chrome is needed for the voice mic.
* `git pull` to get the latest version.
* Keys are optional. `./start.sh` asks for them on the first run (hidden input) and saves them to `.env`, which is git-ignored.
  * `ELEVENLABS_API_KEY` for real voices. Without it the voices are mock tones.
  * `FEATHERLESS_API_KEY` or `ANTHROPIC_API_KEY` for idea-specific answers. Without one the Brain uses canned offline answers.
* To enter the keys again, delete `.env` and run `./start.sh`.

## Start
* From the repo root run `./start.sh`.
* It starts the Brain (8001), Voice Studio (8787) and the Hub with the UI (3000), and stops any old copies first.
* Open http://localhost:3000 in Chrome.
* Type an idea or life decision, then press **Join the call**.
* Answer out loud (mic on, goes out after 5 quiet seconds) or type. Press **Wrap up** to end and get the final page.
* Press Ctrl+C to stop everything.

## Check it is healthy
* `curl localhost:8001/health` should show `"provider": "featherless"` (or `anthropic`). `"offline"` means no LLM key.
* `node tools/design-kit.mjs doctor` checks all three services.

## Tests
* Brain: `cd part-b-brain && python3 -m unittest discover -s tests -t .`
* Hub and UI: `cd part-c-experience && npm test`

## Troubleshooting
* **Robotic voice:** a voice line failed and the browser voice took over. Check `.logs/voice.log` (key, credits, rate limit).
* **Voice log says mock:** `ELEVENLABS_API_KEY` was not set when `./start.sh` ran. Delete `.env` and run it again.
* **Generic or template answers:** no LLM key, or the provider rate limited the call. Check `.logs/brain.log` for "fallback".
* **Mic does nothing:** use Chrome or Edge, allow the mic when asked, or turn the mic off and type.
* **No aura sounds:** click anywhere on the page once so the browser unlocks audio, then hard refresh with Cmd+Shift+R.
* **"The council is offline":** an old process is holding a port. Run `./start.sh` again, it stops old copies.
* Logs: `.logs/brain.log`, `.logs/voice.log`, `.logs/hub.log`.
