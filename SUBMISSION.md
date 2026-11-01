# LARP Council: hackathon submission

## Project name
* LARP Council

## Team
* Aayan Areejo
* Areej Ubaid
* Shayan Khattak

## One line pitch
* A Meet style call where AI versions of Steve Jobs, Elon Musk, Sam Altman and Warren Buffett question your idea or life decision out loud and tell you what to do next.

## Short description
* You type an idea, join the call, and the council talks to you like a real meeting.
* One persona opens with a question specific to your idea. You answer by voice or text.
* Other personas follow up, agree or disagree, each in their own documented way of thinking.
* After a few rounds you end the call. Each persona gives a take and a score out of 10, and you get three next steps.
* It works for startups, projects and life decisions.

## Theme fit
* Theme: "Create a product to help you LARP as someone you are not."
* You get to sit in a room with how famous builders think and practise defending your idea to them.
* It is LARPing a boardroom with legends.

## Prize track
* Best Use of ElevenLabs only.
* Each persona has its own voice, made with ElevenLabs Voice Design or the ElevenLabs voice library.
* Voices are designed, never cloned.
* Eleven v3 audio tags give natural delivery, such as sighs, laughs and pauses.
* Speech is live, so it feels like a real call and not a text chat.

## How it was built
* Three independent parts joined by one JSON turn contract (version 2).
* Brain (Python): persona profiles built from public material, and an LLM through Anthropic or Featherless. An offline fallback keeps it working with no key.
* Hub and UI (Node): a Meet style call screen animated with GSAP, plus a hub that proxies turns to the Brain.
* Voice Studio (Node): ElevenLabs voices with caching and a request queue.
* If one part is down, the others still run.

## Repo and access
* Repo: https://github.com/areejubaid/larp-council
* Access: run `./start.sh` (see RUN.md).
* Live URL: runs locally for judging, see RUN.md

## Judging criteria
* Working Product: three services start with one command, with an offline fallback so the demo never depends on one API.
* Usefulness: you rehearse defending an idea or decision and leave with a score and concrete next steps.
* Theme: you LARP a boardroom of legends and answer to how they think.
* Creativity: a live back and forth call where personas follow up, agree and disagree with each other, not a single answer.
* Ease of Use: type one idea, press Join the call, then talk or type.
* Demo: a short call that shows distinct voices, a real follow up, then the closing scores and next steps.

## Honesty note
* The personas are AI simulations inspired by public interviews and writing. They are not the real people.
* Nothing the personas say is a real quote.
* Voices are designed or from the voice library, never cloned.
