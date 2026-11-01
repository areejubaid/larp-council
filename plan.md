# LARP Council: pivot plan (3:50 PM)

Submit by 5:45 PM. Feature freeze 5:00 PM.

## The product
LARP Council is a Google Meet style call with AI personas of famous builders and thinkers (Steve Jobs, Elon Musk, Sam Altman, Warren Buffett). You pitch anything: a startup, a project, or a life decision. The council talks to you like a real meeting. One persona opens with a question specific to your idea ("Similar job boards already exist. What is different about yours?"). You answer by voice or text. Another persona follows up, agrees, or pushes back, each in their own way of thinking. After a few rounds you end the call and get a summary: each persona's take, a score, and next steps.

Every persona is an AI simulation built from their public interviews, talks and writing. The UI says so at all times, and nothing is presented as a real quote. Voices are designed or library voices, never clones.

## Architecture (3 parts, joined by the turn contract below)
* Brain (part-b-brain, Python): new `POST /turn` and `GET /personas`. Persona profiles from public material. LLM: Anthropic if `ANTHROPIC_API_KEY`, else Featherless (OpenAI compatible) if `FEATHERLESS_API_KEY`, else an offline fallback that still uses words from the idea.
* Hub and UI (part-c-experience, Node): Meet style call screen, proxies `/api/turn` and `/api/personas` to the Brain, same origin.
* Voice Studio (part_a_voice): personas mapped to voices in `voices.json`. The UI plays each turn with `playDebate({lines:[turn]})` and listens with `transcribePitch()`.

## Turn contract (version 2)
`POST /turn` (Brain) and `POST /api/turn` (hub, forwards to the Brain base URL + `/turn`)

Request:
```json
{
  "sessionId": "s1",
  "idea": "Google Maps for jobs: see open jobs near you on a map",
  "personas": ["jobs", "musk", "altman", "buffett"],
  "history": [
    {"speaker": "musk", "text": "Similar things exist. What is different about yours?"},
    {"speaker": "user", "text": "Ours shows walk-in jobs posted in the last hour."}
  ],
  "endCall": false
}
```
`history` is empty on the first call. The newest user answer is the last history item.

Response:
```json
{
  "turns": [
    {"speaker": "jobs", "text": "[leans in] Okay. The last hour part is interesting. But who is this for?", "mood": "curious", "stance": "question", "replyTo": "user"}
  ],
  "awaitingUser": true,
  "done": false,
  "summary": null
}
```
* `turns`: 1 or 2 turns. Each `speaker` is a persona id. `text` may hold ElevenLabs audio tags like [sighs] or [laughs]. `mood` is one of curious, skeptical, impressed, annoyed, supportive. `stance` is one of question, agree, disagree, challenge, advice. `replyTo` is "user" or a persona id.
* When `awaitingUser` is true, the last turn asks the user something.
* `endCall: true` (or after about 5 user answers) returns `done: true` and a `summary`:
```json
{"verdict": "One sentence overall.", "perPersona": [{"speaker": "jobs", "take": "Two sentences.", "score": 7}], "nextSteps": ["Short action", "Short action", "Short action"]}
```

`GET /personas` returns `[{"id": "jobs", "name": "Steve Jobs", "role": "Apple co-founder", "lens": "Taste, focus, saying no", "color": "#hex"}]`.

## Work split
* Agent 1 (Sonnet): Brain conversation engine, persona research and profiles, LLM providers, offline fallback, tests.
* Agent 2 (Sonnet): Meet style UI, rename to LARP Council, hub proxy routes, conversation loop with voice and text, end of call summary. Design: GSAP, Taste Skill, polish checklist, modern Meet look.
* Lead (Opus): voices mapping, rename in docs, integration test, recording, submission.

## Voices
* jobs uses the Council Perfectionist voice, musk uses Council Engineer, altman uses Council Operator, buffett uses an ElevenLabs library voice.

## What the team needs
* An LLM key on the demo laptop for real, idea specific answers: `ANTHROPIC_API_KEY` or `FEATHERLESS_API_KEY` (participant credits). Without one the offline fallback runs.
