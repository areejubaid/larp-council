# LARP Council

Pitch your idea to AI versions of Steve Jobs, Elon Musk, Sam Altman and Warren Buffett on a fake video call.
They grill you out loud, roast bad ideas, hype good ones, hand out aura points, then give you scores and side quests.

Built at **LarpHacks 2026** (Toronto) for the **ElevenLabs** track.
Team: Aayan Areejo, Areej Ubaid, Shayan Khattak.

> The personas are AI simulations inspired by public interviews and writing. They are not the real people and nothing they say is a real quote. Voices are designed or from the voice library, never cloned.

## Try it

You need Python 3.10+, Node 22 and Chrome.

```bash
git clone https://github.com/areejubaid/larp-council.git
cd larp-council
./start.sh
```

Open http://localhost:3000, type an idea (a startup, a project or a life decision) and press **Join the call**.

The first run asks for two keys at a hidden prompt and saves them to `.env` (git-ignored, never committed):

| Key | What it does | Without it |
| --- | --- | --- |
| `ELEVENLABS_API_KEY` | real persona voices | mock beep tones |
| `FEATHERLESS_API_KEY` (or `ANTHROPIC_API_KEY`) | idea-specific answers | canned offline answers |

## How a call works

1. One persona opens with a question about your idea. Answer by voice or by typing.
2. The mic is an on/off switch. When it is on, you just talk. Go quiet for 5 seconds and your answer is sent.
3. Each round, one persona reacts (agrees, disagrees, roasts or hypes) and a different persona asks one new question.
4. When someone is impressed you get a **+Aura** popup. When they roast you get **-Aura**. Both come with a short sound.
5. After 5 answers, or when you press **Wrap up**, you get a final aura score, a take and score from each persona, and three side quests.

## How it is built

Three small services that talk through one JSON contract ([plan.md](plan.md)). If one is down the others still run.

| Part | Folder | Port | What it does |
| --- | --- | --- | --- |
| Brain (Python) | `part-b-brain` | 8001 | persona profiles, the conversation engine, LLM calls, offline fallback |
| Voice Studio (Node) | `part_a_voice` | 8787 | ElevenLabs voices, caching, request queue |
| Hub + UI (Node) | `part-c-experience` | 3000 | the call screen, popups, sounds, proxies turns to the Brain |

More detail, tests and troubleshooting are in [RUN.md](RUN.md). The hackathon write-up is in [SUBMISSION.md](SUBMISSION.md).
