# Mind Council: hackathon submission

## Project name
* Mind Council

## Team
* Aayan Areejo
* Areej Ubaid
* Shayan Khattak

## One line pitch
* Pitch your idea as a famous founder, and a council of sarcastic AI minds judges your idea and how well you can LARP as one of them.

## Short description
* Mind Council has two modes on one engine.
* Roast mode: you pitch as yourself. An idea scorer rates originality, feasibility and effort. The score sets each mind's mood. Weak ideas make the minds interrupt each other, blame each other, and sometimes rage quit. Great ideas get a slow clap.
* LARP mode: you pick a mind, such as the Perfectionist, and pitch in that mind's style by voice or text. The other minds react out loud and roast you if you break character. You get a Character Consistency Score and an Embarrassment Score.
* The minds are AI parodies inspired by public figures. They are not the real people. Their voices are designed from text descriptions with ElevenLabs Voice Design. They are not cloned from anyone.

## Theme fit
* Theme: "Create a product to help you LARP as someone you are not."
* LARP mode lets you borrow how a famous founder thinks and talks: their principles, pace and verbal habits.
* The other minds tell you out loud whether you pulled it off, so you practise being someone else and get instant feedback.
* The Principle trace panel shows which principle each line came from.

## How it was built
* Three independent parts joined by one JSON contract (version 1).
* Part A, Voice Studio (Node): ElevenLabs Voice Design voices, one per mind. Lines are spoken with audio tags such as [sighs] and [pause], interruptions, a door slam rage quit and a slow clap. Audio is cached on disk so the demo works offline.
* Part B, Brain (Python): idea scorer, mood engine, debate generator, character scorer and verdict. It uses Claude when a key is set and falls back to offline scripts when not.
* Part C, Hub and UI (Node): serves the UI, asks the Brain for a debate, and pushes events over WebSocket to a live dashboard with moods, scores and the principle trace.
* If one part is down, the others still run (demo replay, text only, or offline scripts).

## Prize track
* Best Use of ElevenLabs only.
* Why voice makes it better:
  * The product is about sounding like someone else, so hearing a distinct voice per mind is the point, not decoration.
  * Interruptions, overlapping reactions, a rage quit and a slow clap only work as sound.
  * Audio tags give sarcasm and timing that text cannot show.
  * You pitch by voice and the council answers by voice, so it feels like a real room.

## Access instructions
* Run it locally: see RUN.md. No keys are needed for a mock run.
* Live URL: TO FILL (hub URL after deploy)
* Voice Studio URL: TO FILL (needed for live voices)
* Repo URL: TO FILL

## Judging criteria
* Working Product: all three services run locally and on Render, with offline fallbacks so the demo does not depend on the network. Tests pass for the Brain and the Hub.
* Usefulness: it is a safe, funny way to practise pitching and to learn how successful founders reason, with feedback on both the idea and the style.
* Theme: LARP mode is the core. You play a founder's mind and get scored on how consistent you are.
* Creativity: sarcastic AI minds that interrupt, blame, rage quit and slow clap, plus a Character Consistency Score and an Embarrassment Score.
* Ease of Use: open the page, press a demo button or speak a pitch, and listen. Typing works if the mic does not.
* Demo: a two minute flow, bad idea for the rage quit, a great idea for the slow clap, then a live LARP round with a judge.

## Honesty note
* The minds are AI parodies inspired by public figures, not the real people.
* Voices are designed from text descriptions, not cloned.
* Principle source notes describe the kind of public source only. They contain no quotes or links.
