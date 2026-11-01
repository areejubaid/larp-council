# LARP Council: hackathon submission

## Project name
LARP Council

## Team
* Aayan Areejo
* Areej Ubaid
* Shayan Khattak

## One line pitch
A fake video call where AI versions of Steve Jobs, Elon Musk, Sam Altman and Warren Buffett grill your idea out loud, roast it or hype it, and hand you an aura score.

## Short description
* Type an idea: a startup, a project or a life decision. Join the call.
* One persona opens with a question about your idea. You answer by voice or text.
* Each round one persona reacts (agrees, disagrees, roasts or hypes) and a different one asks a new question, so it feels like a real conversation and not an interview script.
* Impressed personas trigger a **+Aura** popup and a sound. Roasts trigger **-Aura** and a different sound.
* The mic is an on/off switch. Talk naturally and go quiet for 5 seconds to send your answer.
* After 5 answers (or Wrap up) you get a final aura score, a take and score from each persona, and three side quests.
* The tone is casual and a bit unhinged, in the spirit of LarpHacks.

## Theme fit
"Create a product to help you LARP as someone you are not." You sit in a boardroom with the way famous builders think, and you practise defending your idea to them.

## Prize track
**Best Use of ElevenLabs.**
* Each persona has its own designed voice (ElevenLabs Voice Design or the voice library). Nothing is cloned.
* Eleven v3 audio tags give natural delivery, such as sighs and laughs.
* Speech is live and the answers are generated per idea, so every call is different.

## How it was built
* Three independent parts joined by one JSON turn contract (see `plan.md`). If one is down, the others still run.
* **Brain** (Python): persona profiles paraphrased from public interviews and writing, a round planner that rotates who reacts and who asks and never repeats a question, and an LLM through Featherless or Anthropic with an offline fallback.
* **Hub and UI** (Node): the Meet style call screen, aura popups, synthesized sound effects, mic with silence auto-send, and the final aura page.
* **Voice Studio** (Node): ElevenLabs voices with caching and a request queue.

## Repo and how to run it
* Repo: https://github.com/areejubaid/larp-council
* Run: `./start.sh`, then open http://localhost:3000 in Chrome. See `RUN.md`. Keys are asked on the first run and kept in a git-ignored `.env`.
* Live URL: runs locally for judging.

## Honesty note
* The personas are AI simulations inspired by public interviews and writing. They are not the real people.
* Nothing the personas say is a real quote.
* Voices are designed or from the voice library, never cloned.
