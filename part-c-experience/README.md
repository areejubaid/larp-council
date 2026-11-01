# Part C: Experience

Frontend, Event Hub and dashboard for Mind Council (main README section 9, Part C). One Node service serves the UI and the hub, asks the Brain for a debate, and plays it out to the browser. It talks to the other parts only through the JSON contract v1 (main README section 8) and the two HTTP/JS interfaces below. It imports no Part A or Part B code.

All three minds are AI parodies. The UI shows that label at all times.

## The three services

```
                         POST /api/pitch {PitchInput, voice}
 browser  ------------------------------------------------->  Hub (this folder, Render web service)
    |                                                           |  POST BRAIN_URL (/run)
    |                                                           v
    |                                                         Brain (part-b-brain/server.py)
    |                                                           |  reply {script, events}
    |   WebSocket /ws?sessionId=X  (events, history first)      |
    | <---------------------------------------------------------+  hub publishes the events
    |
    |   import ${VOICE_URL}/player.js, then playDebate(script)
    +--------------------------------------------------------->  Voice Studio (part_a_voice/server.mjs)
```

| Service | Folder | Run | Port |
| --- | --- | --- | --- |
| Hub + UI (this) | `part-c-experience/` | `npm start` | `PORT`, default 3000 |
| Brain | `part-b-brain/` | `python server.py` | `PORT`, default 8000 |
| Voice Studio | `part_a_voice/` | `node server.mjs` | `PORT`, default 8787 |

How a pitch flows:

1. The browser opens `/ws?sessionId=X`, then `POST /api/pitch` with the `PitchInput` plus `voice: true` if the voice module loaded.
2. The hub POSTs the contract fields to `BRAIN_URL`. The Brain answers synchronously with `{script, events}`.
3. The hub validates the events and publishes them to the session. The hub replays them with human pacing, or all at once when `voice` is true.
4. The hub answers `{sessionId, source: "brain", script}`. The browser hands `script` to Part A's `playDebate`.
5. With voice on, the presenter shows each line when Part A reports `audio_started` for it, and shows the verdict when `playDebate` resolves. With voice off it paces lines by text length.

If the Brain is unreachable, times out, answers 5xx or sends an unusable reply, the hub starts a labelled demo replay (`source: "demo"`, plus a `reason`) and the UI shows a "Demo replay" badge. If the Brain answers 400 (bad input), the hub returns that 400 and its error to the user and does not fall back.

## Important: leave the Brain's `EVENT_HUB_URL` unset

**Do not set `EVENT_HUB_URL` on the Brain.** The hub already publishes every event from the Brain's `/run` reply. If the Brain also POSTed each event to `/events`, every event would appear twice. `POST /events` still exists (it validates and stores any contract event) for tools and tests, but the Brain does not need it.

## Run the full stack locally

Three terminals. No API keys are needed: the Brain runs offline and Part A uses mock tones.

```
# 1. Brain (offline: leave ANTHROPIC_API_KEY unset)
cd part-b-brain
PORT=8001 python server.py

# 2. Voice Studio with mock tones (never put a real ElevenLabs key in a test run)
cd part_a_voice
MOCK_TTS=1 PORT=8787 node server.mjs

# 3. Hub and UI
cd part-c-experience
npm install
BRAIN_URL=http://localhost:8001/run VOICE_URL=http://localhost:8787 npm start
# open http://localhost:3000
```

PowerShell: set variables first, for example `$env:PORT='8001'; python server.py`.

With only the hub running (`npm start`), the demo buttons and the typed-pitch fallback still work, as silent text-only demos.

## Environment variables (hub)

| Variable | Default | Meaning |
| --- | --- | --- |
| `PORT` | `3000` | Port to listen on. Binds `0.0.0.0`. |
| `BRAIN_URL` | unset | Full URL ending in `/run`, for example `https://larp-council-brain.onrender.com/run`. Unset means demo replay. |
| `BRAIN_TIMEOUT_MS` | `75000` | How long to wait for the Brain. Long on purpose: a free Render instance can take about a minute to wake up. |
| `VOICE_URL` | unset | Origin of Part A's server, for example `https://mind-council-voice.onrender.com`. Unset means text only. |
| `REPLAY_SPEED` | `1` | Speed multiplier for paced (non-voice) replays. The UI reads it from `/api/config` so its own pacing matches. |

The Content Security Policy adds the `VOICE_URL` origin to `script-src`, `connect-src` and `media-src` only when `VOICE_URL` is set. Everything else stays `'self'`. There are no CDNs.

## Endpoints

| Route | Purpose |
| --- | --- |
| `POST /api/pitch` | Body is a `PitchInput` plus optional `voice: true`. Returns `{sessionId, source: "brain" or "demo", script, ...}`. 400 with the Brain's error if the Brain rejects the input. |
| `POST /api/demo` | Body `{scenario: "bad" or "good" or "larp", sessionId, chosenMindId?, voice?}`. Starts a replay and returns `{..., script}`. For `larp`, the mock for `chosenMindId` is used (default perfectionist). |
| `GET /ws?sessionId=X` | WebSocket. Sends that session's stored history first, then live events. Envelope is `{seq, event}`; `seq` is a per-session counter so a reconnect never shows an event twice. |
| `POST /events` | One contract event. 400 if invalid, 413 above 256 KB. No auth (see limitations). |
| `GET /api/config` | `{replaySpeed, brainConfigured, voiceUrl}`. |
| `GET /healthz` | `ok`. |
| anything else (GET) | Static files from `public/`. Path traversal is rejected. |

Limits: 500 events per session and 200 sessions in memory, oldest session evicted first (sessions with a live viewer last). A restart clears everything.

## Voice

* `public/js/voice.js` dynamically imports `${voiceUrl}/player.js`. If `VOICE_URL` is unset or the import fails, the app stays text-only and says so ("Text only" badge, "Voice is not connected" under the mic).
* The mic button calls Part A's `transcribePitch({onInterim})` and writes interim text into the pitch box. No speech recognition (Firefox, Safari) or a blocked mic gives a clear message, and typing keeps working.
* **Part A's `onEvent` payloads are not contract events.** Its `line_ready` is partial, its `interruption` uses `interruptedLineId`, and its `verdict_ready` nests `{verdict, characterScore}`. The UI never forwards them to the hub or the dashboard. `public/js/signals.js` turns only `audio_started`, `rage_quit` and `slow_clap` into tiny timing signals `{kind, lineId}`, which the presenter uses to pace the display. The dashboard is fed only by the hub's contract events.
* Audio-driven presenter (`public/js/presenter.js`): each line, and the beats that belong to it, wait for `audio_started` for that `lineId`. Scores and moods show immediately. Waveforms follow `audio_started`. The verdict waits for `playDebate` to resolve. Rage quit lands on the player's `rage_quit` signal, after the line's audio. In audio mode the slow clap silence plays with the player's clap sound, after the grudging line.
* The debate never hangs on audio. If `playDebate` rejects, or no signal arrives for 60 s (first line, prefetch can be slow) or 30 s (later lines), the presenter drops to the timed mode for the rest of the debate and the UI says "Voice stopped".
* "Start over" aborts playback with the `AbortSignal` and pauses any audio element the player created. The player's own slow clap and door sound effects (Web Audio) cannot be cancelled and finish on their own.
* Browser caveats: audio needs a user gesture. The click on "Judge my idea" or a demo button unlocks audio (the app also resumes a throwaway `AudioContext` inside that click), and playback starts after the Brain answers, so Safari and iOS, which are stricter than Chrome and Edge, may still block it. If they do, the player's browser-voice fallback or the watchdog takes over. Speech recognition works in Chrome and Edge only. Part A's `transcribePitch` cannot be stopped early, so it listens until you pause or about 45 seconds pass.

## Replay pacing (non-voice)

The mock files give every event the same `ts`, so replay paces by event type and text length, and rewrites `sessionId` and `ts` on every event it sends.

* Scoring events: short fixed gaps. `line_ready`: about 1 s plus 48 ms per character (tags stripped), min 2.4 s, max 6.2 s.
* A line with `interruptsLineId` starts after about 30% of the previous line, at most 1.2 s.
* `rage_quit` fires when its line ends. A 4.6 s pause comes before `verdict_ready`. The bad-idea replay takes about 31 seconds.
* With `voice: true` nothing is paced: all events are published at once and the audio sets the pace.

## Mocks

`mocks/bad.json` (copy of `part-b-brain/mocks/event_replay.json`, 15 events), `good.json` (10), and one LARP mock per mind: `larp-perfectionist.json` (12), `larp-engineer.json` (12), `larp-operator.json` (14). The LARP mocks were generated with the Part B CLI offline and the API key unset, output to a temp path:

```
python -m brain.cli mocks/bad_idea_pitch.txt --offline --mode larp --mind <mind> --out <tmp> --events-out part-c-experience/mocks/larp-<mind>.json
```

In each, the chosen mind has `character_scored` and speaks no lines. `server/script.js` builds a valid `DebateScript` from any event list, so demo replays can be spoken too.

## Files

```
server/index.js     HTTP routes, WebSocket upgrade, static files, CSP, triggerBrain()
server/hub.js       in-memory sessions, sequence numbers, broadcast
server/replay.js    mock loading, pacing, replay of any event array, per-session cancel
server/script.js    buildScript(events) -> DebateScript
server/validate.js  contract validators (event, PitchInput, DebateScript)
public/             index.html, styles.css, js/*.js (ES modules, no build step)
public/js/voice.js     loads Part A's player.js, mic and playback adapter
public/js/signals.js   player events -> timing signals (never contract events)
public/js/presenter.js timed and audio-driven presentation queue
mocks/              bad, good, larp-perfectionist, larp-engineer, larp-operator
test/               hub, integration, client and audio tests (node:test)
```

To restyle: every color, font, space and radius is a CSS custom property in the marked block at the top of `public/styles.css`. Fonts are system stacks.

## Deploy on Render

Render hosts three web services from the one repo. This is hosting only, not a sponsor track.

For the hub:

1. Push the repo to GitHub (the team does this).
2. Render: New, then Blueprint, pick the repo. Open the Blueprint settings and set **Blueprint File Path** to `part-c-experience/render.yaml` (it is not in the repo root).
3. The blueprint creates one web service with `rootDir: part-c-experience`, build `npm install`, start `npm start`, health check `/healthz`, Node 22.
4. In the service's environment set `BRAIN_URL` (the Brain's public URL plus `/run`) and `VOICE_URL` (Part A's public origin, no path). `BRAIN_TIMEOUT_MS` is already 75 s.
5. Do **not** set `EVENT_HUB_URL` on the Brain.
6. Open the hub URL on a phone. WebSocket uses the same port, so `wss://` needs no setup.

No Blueprint? Create a Web Service by hand: root directory `part-c-experience`, build `npm install`, start `npm start`, same environment variables.

The Brain and Part A deploy from their own folders (see their READMEs). Free instances sleep when idle, and the first request after sleep can take about a minute, so open the app a few minutes before the demo and run one pitch. The hub shows "The council is deliberating..." while it waits, with an extra note after 8 seconds. Part A's server must answer from `https` if the hub is `https` (browsers block mixed content), and its CORS is already open.

## Known limitations

* **No auth on `POST /events`.** Anyone who knows the URL can post events into a session. Fine for a hackathon. The Brain does not use this route, so it can be locked down later without touching Part B.
* Anyone who knows a `sessionId` can watch it. The UI uses random UUIDs.
* A hub restart resets sequence numbers, so a page left open across a restart would ignore the new events. Reload the page.
* The Brain's reply is trusted for shape only: each event is validated, but text is untrusted and always rendered with `textContent`.
* If the Brain returns `script` and `events` that disagree, the audio follows `script` and the screen follows `events`.

## Open questions

1. **Real ElevenLabs voices.** All testing used mock tones. Real TTS prefetch for every line can take longer than mock mode, which is what the 60 s first-line watchdog is for.
2. **Safari and iOS autoplay.** Not tested.
3. **Slow clap order.** In audio mode the clap sound plays after the line (Part A's order), so the silence banner follows the line instead of leading into it, as it does in timed mode.
