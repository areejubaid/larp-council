# Part A: Voice Studio

Owner: Aayan. Track: ElevenLabs. Minds are AI parodies, not the real people.

## What this part does
* Turns any DebateScript (contract version 1) into a spoken debate with interruptions, a rage quit sound and a slow clap.
* Turns the player's speech into text (browser Web Speech API, Chrome or Edge).
* Keeps the ElevenLabs key on the server, caches every line as audio so the demo works offline.

## Files
* `voices.json`: the four minds with Voice Design descriptors and their voiceId (filled in by the script below).
* `design_voices.mjs`: creates the voices with ElevenLabs Voice Design and saves the ids.
* `server.mjs`: TTS server with disk cache and a MOCK mode (fake tones, no key needed).
* `player.js`: browser module with `playDebate(script, options)` and `transcribePitch()`.
* `prerender.mjs`: warms the cache for all mock scripts.
* `demo.html`: standalone test page.
* `mocks/bad_idea_script.json` and `mocks/good_idea_script.json`: sample DebateScripts.

## Run it
* Test with no key: `MOCK_TTS=1 node server.mjs`, then open http://localhost:8787
* Create the voices once: `ELEVENLABS_API_KEY=xxx node design_voices.mjs`, listen to `previews/`, and re-run with a mind name and preview number to pick another take.
* Live voices: `ELEVENLABS_API_KEY=xxx node server.mjs`
* Before the demo: `node prerender.mjs` with the server running, so every mock line is cached.

## How Part C uses it
```js
import { playDebate, transcribePitch } from "./player.js";
const pitchText = await transcribePitch();
await playDebate(script, { baseUrl: "https://our-voice-server", onEvent: (e) => hub.send(e) });
```
Events emitted (contract Event shape): line_ready, audio_started, interruption, rage_quit, slow_clap, verdict_ready.

## Contract notes for Part B
* An interruption is a DebateLine whose `interruptsLineId` is the previous line.
* A line with `mood` set to `rage_quit` triggers the door slam and rage_quit event after it plays.
* A line with `mood` set to `slow_clap` triggers the slow clap and slow_clap event after it plays.
* Audio tags such as [sighs], [pause], [laughs] and [interrupting] go inside `text`.

## Done checklist
* [x] Renderer, cache and offline fallback (server cache, then browser voice)
* [x] Interruptions, rage quit and slow clap tested in mock mode
* [ ] Voices designed with a real API key
* [ ] Each mind distinguishable by ear
* [ ] Sarcasm audible on at least 3 lines (tune audio tags)
* [ ] Cache warmed for demo lines
