# Part B: Brain

Takes a `PitchInput` and returns a `DebateScript` plus a stream of events (contract v1, main README section 8).

## Run it

Needs Python 3.10+. Offline mode needs nothing else. For live Claude calls:

```
pip install -r requirements.txt
set ANTHROPIC_API_KEY=your-key     (PowerShell: $env:ANTHROPIC_API_KEY = 'your-key')
```

Standalone test from this folder:

```
python -m brain.cli mocks/bad_idea_pitch.txt --offline
python -m brain.cli mocks/good_idea_pitch.txt --mode larp --mind perfectionist
```

It prints a `DebateScript` that has been checked against the contract. Add `--events-out file.json` to save the event replay, `--out file.json` to save the script.

Unit tests: `python -m unittest discover -s tests -t .`

## How it works

| Step | File | Notes |
| --- | --- | --- |
| Idea scorer | `brain/scorer.py` | Claude returns strict JSON, schema checked. Offline heuristic as fallback. |
| Mood engine | `brain/mood.py` | Deterministic thresholds from README section 5. |
| Debate generator | `brain/debate.py` | Audio tags, interruptions, principle ids. Guarantees an interruption + rage quit on `appalled`, and a slow clap on `slow_clap`. |
| Character scorer | `brain/character.py` | LARP mode only. |
| Verdict | `brain/verdict.py` | Embarrassment Score. |
| Events | `brain/events.py` | Set `EVENT_HUB_URL` to POST events to Part C. |
| Render tasks | `brain/tasks.py` | JSON in, JSON out. Wrap with the Render Workflows SDK. |

Every Claude call falls back to the offline script on error, so the demo never depends on the network.

## Mocks for Parts A and C

`mocks/bad_idea_script.json`, `mocks/good_idea_script.json`, `mocks/larp_script.json`, `mocks/event_replay.json`.

## Things to confirm with Parts A and C

1. **Rage quit and slow clap markers.** The contract has no field for them. The Brain marks those lines with `principleId: "rage_quit"` / `"slow_clap"` and also emits the `rage_quit` / `slow_clap` events. If you want a dedicated field, that is a contract change (needs all three owners).
2. **`mindId`s** are `perfectionist`, `engineer`, `operator`.
3. **`mood` values** are `slow_clap`, `impressed`, `skeptical`, `sarcastic`, `appalled`.
4. **Source notes** in `brain/data/minds/*.json` are placeholders that say which kind of public source applies. Add exact links and verify them before the demo (README guardrail).
5. In LARP mode the chosen mind is the player, so only the other minds speak.
