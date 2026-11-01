# Mind Council

> LARP as the way the world's sharpest founders think, and survive their disappointment.

Built at **LarpHacks** (Nov 1, 2026). Theme: *create a product to help you LARP as someone you are not.*

Mind Council is a voice app. You pitch an idea, and a council of AI parody minds reacts out loud. The minds are modeled on how famous tech founders publicly think. Good ideas earn respect. Bad ideas get roasted, and the minds start arguing with each other about whose fault it is. You can also LARP as one of the minds and defend your idea in its style.

> ⚠️ Every mind is an **AI parody** inspired by public figures. None of them is the real person, and no line is a real quote.

## How it works

1. **Pitch.** Speak or type an idea, such as a startup or a hackathon project.
2. **Score.** The idea scorer rates it on originality, feasibility, and effort.
3. **Mood.** The score sets each mind's mood: impressed, skeptical, sarcastic, or "what have you done to the world."
4. **Debate.** Three minds with different thinking styles debate the idea by voice. On a weak idea they interrupt and blame each other, and one may rage quit the call.
5. **Slow clap.** On a great idea every mind goes quiet, then one grudgingly says "fine."
6. **LARP round (optional).** Pick a mind and defend your idea in its style. The system scores how consistently you think like it.
7. **Verdict.** The final screen shows the verdict, an Embarrassment Score, and a roast of the pitch.

## Sponsor tracks

| Sponsor | Use |
| --- | --- |
| [ElevenLabs](https://elevenlabs.io) | A distinct, designed voice for each mind, with expressive delivery |
| [Render](https://render.com) | Live deployment, plus background jobs for scoring |
| Agentboxd *(stretch)* | Each mind emails the player an action plan from its own inbox |

## System design

Each stage (pitch → score → mood → debate → verdict) writes to an event stream. The dashboard reads that stream, so judges see scores, moods, and interruptions live. All services deploy on Render.

## Team

Two-person team. Roles are merged in the order the plan lists them:

| Person | Owns |
| --- | --- |
| **Voice + Brain** | ElevenLabs voices, turn taking, interruptions, mind profiles, idea scorer, mood system |
| **Frontend + Infra/Demo** | Dashboard, meters, UI polish, Render deploy, event stream, demo script (Agentboxd if time allows) |

## Timeline (Toronto time)

| Time | Milestone |
| --- | --- |
| 11:00 AM – 12:00 PM | Lock the theme angle, pick 3 minds, set up the repo, Render, and ElevenLabs keys |
| 12:00 – 2:00 PM | One mind talking by voice end to end, idea scorer working |
| 2:00 – 4:00 PM | Three minds, mood system, interruptions, live dashboard |
| 4:00 – 4:30 PM | Deploy on Render and fix bugs |
| 4:30 – 5:00 PM | Meal break while testing the live link |
| 5:00 – 5:45 PM | Polish, demo script, backup recording |
| **By 5:45 PM** | **Submit** (hard cutoff 6:00 PM, judging at 6:30 PM) |

## Demo script (2 minutes)

1. **0:00–0:15:** Give the one-line pitch. Show the on-screen "AI parody" label.
2. **0:15–0:50:** Pitch a deliberately bad idea. The disappointment meters spike, the minds interrupt each other, and one rage quits.
3. **0:50–1:25:** Pitch a good idea. Show the slow clap and the "which principle fired" panel.
4. **1:25–1:45:** LARP round: a judge defends an idea as one of the minds.
5. **1:45–2:00:** Show the Render live URL, the architecture view, and the sponsor integrations.

Keep a backup recording in case the venue network fails.

## Guardrails

- Label every mind on screen as an AI parody inspired by public figures, not the real person.
- Don't clone real voices. Use ElevenLabs Voice Design to make original voices with the right energy.
- Write original lines. Never present invented quotes as things a real person said.
- Roast the idea and the public persona's style only. Never private life, health, or family.
- Ground each mind's principles in public interviews and essays, and show the source in the dashboard.

## Setup

Copy `.env.example` to `.env` and fill in your keys. Never commit `.env`.
