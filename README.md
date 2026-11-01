# Mind Council

LarpHacks 2026 project. Last updated: November 1, 2026. Owner of this file: the team lead. Update the Changelog at the bottom whenever something changes.

## 1. One line pitch

Pitch your idea as a famous founder. A council of sarcastic AI minds judges your idea, and judges how well you can LARP as one of them.

## 2. Theme fit

The main track theme: "Create a product to help you LARP as someone you are not."

Mind Council gives you a way to LARP as the way a famous founder thinks and talks. You borrow their principles, their pace, and their verbal habits, and the other minds tell you out loud whether you pulled it off.

## 3. What the product does

Two modes, one engine.

* LARP Mode (headline mode, best theme fit)
  * You pick a mind (for example the Perfectionist).
  * You pitch your idea in that mind's style, by voice or text.
  * The other minds react, interrupt, and roast you if you break character.
  * You receive a Character Consistency Score and an Embarrassment Score.
* Roast Mode (fast and funny)
  * You pitch as yourself.
  * An idea scorer rates originality, feasibility, and effort.
  * The score sets each mind's mood, and weak ideas make the minds argue with each other.

Funny moments to build in:
* Interruptions: a mind cuts off another mid sentence when the idea is bad.
* Blame game: minds argue about whose fault it is that this idea exists.
* Rivalries: each pair of minds has a standing disagreement.
* Slow clap: for a great idea, all minds go silent, then one grudgingly says fine.
* Rage quit: a mind leaves the call when the idea is bad enough.
* Roast the room: a 15 second roast and a final Embarrassment Score.

## 4. The minds

All minds are AI parodies inspired by public figures. They are not the real people. Each mind is a profile: principles, decision habits, speech habits, rivalries, and sarcasm triggers.

### Mind 1: The Perfectionist (inspired by Steve Jobs style)
* Thinks in: taste, simplicity, saying no, the whole product experience.
* Decision habit: cuts features first, asks what a user would feel in the first 10 seconds.
* Speech habits: slow, deliberate pauses, short verdicts, a dramatic reveal for good ideas ("one more thing" is a widely known public phrase, use it once per session at most).
* Sarcasm trigger: clutter, feature lists, ugly demos.
* Voice Design prompt (descriptors only): adult male, calm and measured, deliberate pacing with long pauses, quietly intense, precise, mildly condescending when unimpressed.

### Mind 2: The First Principles Engineer (inspired by Elon Musk style)
* Thinks in: physics, limiting factors, cost per unit, ambitious timelines.
* Decision habit: breaks the idea down to its fundamentals and asks what the hard constraint is.
* Speech habits: stop and start cadence, thoughtful filler pauses, dry deadpan humor, awkward laughs, speeds up when excited.
* Sarcasm trigger: incremental ideas, ideas that ignore constraints.
* Voice Design prompt (descriptors only): adult male, halting thoughtful cadence, dry deadpan delivery, occasional awkward laugh, speeds up when excited.

### Mind 3: The Scale Operator (inspired by Sam Altman style)
* Thinks in: compounding growth, distribution, timing, talent density, how fast a startup can learn.
* Decision habit: asks what happens if this works ten times bigger, and who the first 100 users are.
* Speech habits: soft spoken, even tone, careful complete sentences, understated but cutting.
* Sarcasm trigger: ideas with no path to users, ideas with no urgency.
* Voice Design prompt (descriptors only): young adult male, soft spoken, even and thoughtful, careful phrasing, gentle tone with a quiet edge.

### Mind 4 (stretch): The Agent Builder (inspired by builders of AI coding agents)
* Thinks in: ship it, tight feedback loops, tools and agents, what can be automated today.
* Speech habits: fast, practical, loves a working demo.
* Voice Design prompt (descriptors only): adult male, quick and practical, upbeat, slightly sarcastic about slow plans.

### Rules for phrases and voices
* Do not use real names or real audio in any Voice Design prompt. Describe pace, energy, tone, and speaking style only.
* Do not clone any real voice. ElevenLabs prohibits impersonating real people including public figures without consent, and has a no go voices safeguard.
* Verbal habits come from patterns, not invented quotes. If the team wants a real catchphrase, keep it very short, source it from a public interview with a link, and use it as flavor inside original lines.
* Never present generated lines as things the real person said.
* Roast the idea and the public style only. Never private life, health, or family.

## 5. The Disappointment Engine

Input: pitch text (and in LARP Mode, the chosen mind).
* Step 1: idea scorer rates originality, feasibility, effort, each 1 to 5.
* Step 2: average sets the mood for each mind.
  * Average 4.5 or above: slow clap.
  * Average 4.0 to 4.4: impressed.
  * Average 3.0 to 3.9: skeptical.
  * Average 2.0 to 2.9: sarcastic, minds start arguing with each other.
  * Average below 2.0: what have you done to the world, a rage quit becomes likely.
* Step 3: debate engine writes the lines, each tied to a principle from the mind's profile.
* Step 4 (LARP Mode only): character scorer compares the player's pitch with the chosen mind's principles, vocabulary patterns, and decision style, and returns a Character Consistency Score.
* Step 5: verdict, Embarrassment Score, and a roast.

## 6. Voice and sarcasm delivery

* Voices are created with ElevenLabs Voice Design (text prompt in, voice previews out, pick one, save its voice id).
* Delivery uses Eleven v3 audio tags inside the script, for example emotion tags and turn taking tags such as interrupting, overlapping, and cuts in. Check the model in use supports them and test early.
* Dialogue mode handles multi speaker conversations with natural pacing and interruptions.
* Check whether Eleven v4 is available on the team plan before switching models. Do not switch late.
* Cache audio for the 10 most important demo lines so the demo never depends on network speed.

## 7. Architecture

Parts and data flow:
* Player browser (mic, UI) sends a pitch to the Event Hub.
* Event Hub (Part C) forwards the pitch to the Brain.
* Brain (Part B, plain Python or TypeScript service, Render Workflows optional) scores the idea, sets moods, writes the debate script, and scores character consistency. It sends events back to the Event Hub.
* Voice Studio (Part A) turns each debate line into audio with ElevenLabs and plays it with interruptions.
* Event Hub streams every event over WebSocket to the live dashboard.
* Cut: Agentboxd email. We enter one sponsor track only (ElevenLabs).

Everything is connected only through the shared contract in section 8. No part imports code from another part.

## 8. Shared contract (agree on this in the first 15 minutes, then freeze)

Version: 1. Any change needs a yes from all three part owners and a new entry in the Changelog.

PitchInput
```json
{
  "sessionId": "s1",
  "mode": "larp",
  "pitchText": "An app that ...",
  "chosenMindId": "perfectionist"
}
```

IdeaScore
```json
{
  "originality": 2,
  "feasibility": 4,
  "effort": 1,
  "average": 2.3,
  "mood": "sarcastic"
}
```

DebateLine
```json
{
  "lineId": "l1",
  "mindId": "engineer",
  "text": "[annoyed] Really? This is what you came up with after all this time?",
  "mood": "sarcastic",
  "interruptsLineId": null,
  "principleId": "first_principles_constraint",
  "sourceNote": "short note about the public source for this principle"
}
```

DebateScript
```json
{
  "version": 1,
  "sessionId": "s1",
  "mode": "larp",
  "ideaScore": {},
  "lines": [],
  "characterScore": 61,
  "verdict": {
    "embarrassmentScore": 74,
    "summary": "One sentence verdict.",
    "roast": "A 15 second roast."
  }
}
```

Event (streamed over WebSocket)
```json
{
  "version": 1,
  "sessionId": "s1",
  "ts": 1760000000,
  "type": "mood_changed",
  "payload": {}
}
```

Event types: pitch_received, idea_scored, mood_changed, line_ready, audio_started, interruption, rage_quit, slow_clap, character_scored, verdict_ready, email_sent.

Mock data rule: every part ships its own mock files in a `mocks` folder (one bad idea script, one good idea script, and one event replay) so it can run and demo alone.

## 9. The three independent parts

Each part has one owner, a mock input, a standalone test, and a done checklist. No part waits for another. Integration happens once, at the integration window in section 10.

### Part A: Voice Studio (ElevenLabs)
Owner: Aayan. Code lives in the `part_a_voice` folder, see its README.

Goal: turn any DebateScript into a convincing, funny spoken debate, and turn the player's speech into text.

Tasks
* Create ElevenLabs account access (see section 12) and store the API key in an environment variable.
* Design 3 voices (4 if time allows) with Voice Design using the descriptor prompts in section 4. Save the chosen voice ids in a `voices` config file.
* Build a renderer: DebateLine in, audio out, using audio tags for sarcasm.
* Build the playback queue with interruptions and overlap (cut one line short when the next line has interruptsLineId).
* Add speech to text for the player's pitch (browser microphone).
* Cache audio for the key demo lines and add a fallback to cached clips if the API fails.
* Expose a small module with `playDebate(script)` and `transcribePitch()`.

Standalone test: load `mocks/bad_idea_script` and hear the full debate with interruptions and a rage quit.

Done when
* Each mind is clearly distinguishable by ear.
* Sarcasm is audible on at least 3 lines.
* An interruption sounds natural.
* The cached fallback works with the network off.

Judging criteria served: Demo, Creativity, ElevenLabs track.

### Part B: Brain (idea scoring, minds, debate)
Owner: Areej

Goal: take a PitchInput and return a DebateScript plus a stream of events.

Tasks
* Write the mind profiles (principles, habits, rivalries, sarcasm triggers) as data files, with a source note per principle.
* Build the idea scorer with a strict JSON output and a schema check.
* Build the deterministic mood engine from section 5.
* Build the debate generator: writes lines with audio tags, interruption markers, rivalries, and principle ids.
* Build the character scorer for LARP Mode.
* Build the verdict and roast writer.
* Expose the steps as plain functions: score_idea, generate_debate, score_character. Render Workflows is optional now (we are not entering the Render track), so only use it if it is quick.
* Optional: use Featherless AI inference (every participant has one month of access) as the language model backend to save credits.

Standalone test: a command line script that takes a pitch from a text file and prints a valid DebateScript, checked against the contract.

Done when
* Output always validates against the contract (retry on invalid JSON).
* Bad idea produces at least one interruption and one rage quit.
* A great idea produces a slow clap.
* Total response time is short enough for a 2 minute demo.

Judging criteria served: Working Product, Usefulness, Theme Alignment.

Live Brain API (Render free Web Service, code in `part-b-brain`, details in its README):
* Base URL: https://larp-council-brain.onrender.com
* `GET /health` returns `{"ok": true, "llm": <bool>}`.
* `POST /run` takes a PitchInput and returns `{"script": <DebateScript>, "events": [<Event>, ...]}`. Bad input returns HTTP 400. CORS is open, so the browser can call it directly.
* Example body: `{"sessionId": "s1", "mode": "roast", "pitchText": "An app that ..."}`. For LARP Mode use `"mode": "larp"` and add `"chosenMindId": "perfectionist"`.
* Mind ids: `perfectionist`, `engineer`, `operator`.
* The free tier sleeps when idle. Open `/health` a few minutes before any demo to wake it.
* Until an Anthropic key is set on the service, it uses built-in offline scripts (`llm` is false in `/health`).

### Part C: Experience (frontend, event hub, dashboard, deployment, demo)
Owner: Shayan

Goal: make the product easy to use and make the system design visible on screen.

Tasks
* Build the main screen: mode toggle (LARP or Roast), mind picker, pitch box and mic button, and a clear label that minds are AI parodies.
* Build mind cards with animated waveforms and a mood face for each mind.
* Build the live dashboard: disappointment meters per mind, interruption log, principle trace panel (shows which principle fired and its source note), event feed, and Character Consistency meter.
* Build the effects: slow clap, rage quit (a mind visibly disconnects), final Embarrassment Score screen.
* Build the Event Hub: a small service with a WebSocket that accepts events from the Brain and streams them to the browser. It also supports replaying a mock event file (demo mode) so the UI works with no other part.
* Deploy the web app and Event Hub on Render and keep the live URL working.
* Prepare the submission pack: project name, team members, short description, access instructions, prize tracks, and the demo script and backup recording.
* Optional: PostHog analytics to show usage during the demo.

Standalone test: open the app in demo mode and watch a full mock session play with meters, interruptions, and the verdict.

Done when
* Someone who has never seen the app can use it in 10 seconds.
* The dashboard updates live from the event stream.
* The Render URL loads on a phone.

Judging criteria served: Ease of Use, Demo, Working Product.

## 10. Timeline (Toronto time, adjust to the actual clock)

Hacking window: 11:00 AM to 6:00 PM. Submission hard cutoff: 6:00 PM. Judging: 6:30 PM to 8:00 PM. Demo: 2 minutes plus 2 minutes of questions.

* 11:00 to 11:30 AM: everyone reads this README, freezes the contract, sets up accounts and keys, creates the repo and three part folders.
* 11:30 AM to 2:30 PM: Parts A, B, and C built independently against mocks.
* 2:30 to 3:30 PM: integration window. One person stays on integration, the others can visit the sponsor workshop. Swap mocks for real services one at a time.
* 3:30 to 4:30 PM: polish, sarcasm tuning, bug fixes, deploy on Render.
* 4:30 to 5:00 PM: meal, while someone tests the live link on a phone.
* 5:00 to 5:40 PM: demo rehearsal twice, record a backup video, finalize the submission pack.
* By 5:45 PM: submit. Do not wait for 6:00 PM.

Feature freeze: 4:30 PM. After that, only fixes.

## 11. How we win: checklist against the judging rubric

Scale per criterion is 1 (weak), 3 (good), 5 (excellent). Aim for 5 on each by showing proof in the demo.

* Working Product (5 points)
  * One full loop works from pitch to voice debate to verdict, live, on the Render URL.
  * Cached fallbacks exist for every external call.
* Usefulness (5 points)
  * LARP Mode teaches how a founder thinks, and Roast Mode gives real feedback on a real idea.
  * Each line shows its principle and source note, so feedback is traceable, not random.
* Theme Alignment (5 points)
  * The headline mode is LARP as a famous mind, with a Character Consistency Score.
  * Say the theme sentence in the first 10 seconds of the demo.
* Creativity (5 points)
  * Sarcastic minds that interrupt, blame each other, slow clap, and rage quit.
* Ease of Use (5 points)
  * One button to pitch, one toggle for mode, a clear label, and nothing to configure.
* Demo (5 points)
  * A scripted 2 minute flow with a bad idea, a good idea, and a LARP round, plus a backup recording.

Sponsor tracks (scored out of 5 each, separate from the main total)
* ElevenLabs: show the voice feature working live and explain why audio makes the experience better.
* Chosen track: ElevenLabs only (one sponsor track allowed).
* Render: hosting only, not entered as a track.
* Agentboxd: cut.
* Sportiner: not targeted.

### What similar winning projects did, and what we copy
* Mock AI Interviewer (3rd place, ElevenLabs x BlackBird Foundry): the AI controlled the UI through tool calls, lowering a confidence bar and changing its tone, and the submission explicitly addressed the judging criteria. Copy: our minds drive the dashboard meters live, and our submission text is written under the six rubric headings.
* Aura and InterviewLabs AI (ElevenLabs hackathons): persona details injected through dynamic variables, a clear create then speak then review demo flow. Copy: inject each mind's profile at session start and keep the demo flow obvious.
* Turing Hunt (multiplayer social deduction with an AI disguised as a human) and AI Impostor (multi model arena with a leaderboard): the LARP and impostor hook is popular and fits our theme. Copy: the LARP round and an optional leaderboard of Character Consistency Scores.
* Triage (events streamed over WebSocket to a live dashboard with a request flow visual and leaderboard): Copy: our event stream and dashboard are the system design showpiece.
* ElevenLabs Worldwide Hackathon: over 300 projects, judged by senior founders and investors, and visual voice agents placed well. Copy: animated mind characters so the voice demo is also a visual demo.
* Grok Interviewer notes: voice audio handling was the hardest part and an in memory store was fine for a hackathon. Copy: test audio in the first hour and skip databases.

### Risks and mitigations
* Voice latency or API failure: cached audio for key lines, and a recorded backup video.
* Render Workflows is in public beta and no longer required, so a hosting problem cannot sink the Brain.
* Policy risk on voices: designed voices only, parody labels on screen, no real names in voice prompts.
* Venue network: test on phone hotspot, use cached assets.
* Scope creep: one core loop first, stretch goals only after integration works.
* Demo timing: rehearse with a timer, the limit is 2 minutes.

## 12. Setup checklist

* ElevenLabs free access for participants: join the ElevenLabs Discord, open the coupon codes channel, click Start Redemption, choose the event, use the email used for registration, and the bot sends the code.
* Agentboxd: skipped, not needed.
* Featherless AI: one month of inference access for participants, setup guide is in the hackathon participant materials.
* Render: create an account to host the web app and Event Hub (event credit code is in the participant group chat).
* Repo with folders: part_a_voice, part_b_brain, part_c_experience, contracts, mocks.

## 13. Demo script (2 minutes)

* 0:00 to 0:15: say the theme sentence and show the AI parody label.
* 0:15 to 0:50: Roast Mode with a deliberately bad idea. Meters spike, minds interrupt each other, one rage quits.
* 0:50 to 1:20: a good idea. Slow clap, principle trace panel on screen.
* 1:20 to 1:45: LARP Mode. A teammate (or a judge) pitches as the Perfectionist, and the Character Consistency Score appears.
* 1:45 to 2:00: show the live Render URL, the event stream, and the sponsor integrations. Close with the one line pitch.

## 14. Submission checklist (due 6:00 PM, aim for 5:45 PM)

* Project name and team members.
* Short description (use the one line pitch plus the two modes).
* Working demo link and access instructions.
* Chosen prize track: ElevenLabs only.
* Backup demo video.
* Confirm the submission link and required uploads at the help desk, since they were still to be confirmed.

## 15. Changelog

* November 1, 2026: first full README created. Contract version 1 drafted. Three independent parts defined. Voice policy and Render Workflows notes added from research.
* November 1, 2026: one sponsor track only, so ElevenLabs is the track. Agentboxd cut, Render Workflows optional. Owners set: Part A Aayan, Part B Areej, Part C Shayan. Part A code added in `part_a_voice` (rage_quit and slow_clap moods, interruption via interruptsLineId).
* November 1, 2026: Part B Brain deployed as a free Render Web Service (`/health`, `/run`). Contract unchanged. API summary added under Part B.

## 16. Sources

* ElevenLabs Voice Design: https://elevenlabs.io/docs/eleven-api/guides/how-to/voices/voice-design.mdx
* ElevenLabs Voice Design overview: https://elevenlabs.io/docs/help-center/product/voices/voice-design/what-is-voice-design
* Eleven v3 audio tags: https://elevenlabs.io/blog/v3-audiotags
* Eleven v3 multi character dialogue: https://elevenlabs.io/hi/blog/eleven-v3-audio-tags-bringing-multi-character-dialogue-to-life
* ElevenLabs no go voices: https://elevenlabs.io/docs/help-center/legal/what-are-no-go-voices
* ElevenLabs Prohibited Use Policy: https://elevenlabs.io/use-policy
* Render Workflows: https://render.com/docs/workflows
* Mock AI Interviewer: https://sydney.aitinkerers.org/hackathons/h_wbUH8g89uD0/entries/ht_E83UVClgwww
* Aura: https://medellin.aitinkerers.org/hackathons/h_TlyBEKtR-yw/entries/ht_UXks0AK-KL4
* InterviewLabs AI: https://la.aitinkerers.org/hackathons/h_5JdYgPp2uXc/entries/ht_dzTQ82uj2pM
* Turing Hunt: https://awesome.ecosyste.ms/projects/github.com%2Fenvoy-vc%2Fturing-hunt-mode-agent-hackathon
* AI Impostor: https://llm-impostor-game.vercel.app
* Triage: https://github.com/ioannisCC/triage-hackathon
* ElevenLabs Worldwide Hackathon winners: https://elevenlabs.io/blog/announcing-the-winners-of-the-elevenlabs-worldwide-hackathon
* Grok Interviewer notes: https://ashikshafi08.github.io/blog/2025/xai-hackathon-exp
