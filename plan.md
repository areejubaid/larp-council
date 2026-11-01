# Mind Council: finish plan (LarpHacks 2026)

Working branch: `ready` (main plus Shayan's `part-c-experience`). Hard submit cutoff 6:00 PM, aim for 5:45 PM. Judging 6:30 PM, 2 minute demo plus 2 minutes of questions. One sponsor track: ElevenLabs.

## Where we are (3:00 PM)

| Part | Owner | Status |
| --- | --- | --- |
| A Voice Studio | Aayan | Done. 3 ElevenLabs voices designed and linked, request queue for the free plan limit, sentence aware interruptions. |
| B Brain | Areej | Done on main. Offline scripts plus optional Claude, HTTP server for Render. |
| C Experience | Shayan | Done on branch `part-c-experience` (64 tests pass). Not merged to main yet. |
| Together | All | Brain to Hub to Voice tested locally in mock mode, works. |

## Design sources

| Source | Status | How |
| --- | --- | --- |
| GSAP (gsap.com) | Used | npm `gsap`, vendored to `part-c-experience/public/vendor` by `tools/design-kit.mjs vendor` (CSP allows only 'self'). |
| Taste Skill (tasteskill.dev) | Used | `design/taste-skill.md` (MIT). Design rules the UI follows. |
| 21st.dev | Not used | MCP needs an API key, free tier is 2 installs a day, host not reachable from the build sandbox. |
| ThreeUI (threeui.com) | Not used | MCP is Pro only. |
| CreatorFlow (creatorflow.so) | Not relevant | Instagram DM automation, not a design tool. |

`tools/design-kit.mjs` is the small CLI that stands in for the missing MCPs: `vendor`, `taste`, `doctor`, `sources`.

## Work now (3:00 to 4:30 PM)

1. Design pass on Part C UI (agent): a council room look, GSAP motion for the moments judges remember (minds joining the call, speaking pulse, interruption jolt, rage quit disconnect, slow clap, verdict reveal). Taste Skill rules. No new runtime dependencies besides vendored GSAP. Keep all 64 tests passing. Respect reduced motion.
2. Demo readiness (agent): remove placeholder source notes ("team: add exact link") from what the UI shows, write `SUBMISSION.md`, a one page `RUN.md` for all three services, check the Render configs.
3. Integration check (lead): run all three services, click every demo path in a headless browser on desktop and phone width, fix anything broken.

Feature freeze 4:30 PM. After that, fixes only.

## Before the demo (4:30 to 5:45 PM)

* Aayan: `git pull`, run the Voice Studio with the key, then `node prerender.mjs` so demo lines are cached (works offline, no credits during the demo).
* Deploy, if time allows: Brain and Hub on Render free web services (`part-b-brain`, `part-c-experience/render.yaml`). The Voice Studio can run on a laptop during judging, since the key must stay private.
* Rehearse the 2 minute script in README section 13 twice, record a backup video.
* Submit by 5:45 PM with `SUBMISSION.md`.

## Demo script (2 minutes)

* 0:00 Theme line: "Pitch your idea as a famous founder style. A council of sarcastic AI minds judges it." Show the AI parody label.
* 0:15 Bad idea: interruptions, blame game, "Okay. I am out." rage quit with the door slam.
* 0:50 Good idea: grudging slow clap, principle trace on screen.
* 1:20 LARP round: pitch as the Perfectionist, Character Consistency Score.
* 1:45 Live event feed and ElevenLabs voices, close with the one line pitch.
