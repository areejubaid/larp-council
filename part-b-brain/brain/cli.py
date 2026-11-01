"""Standalone test: python -m brain.cli pitch.txt [--mode larp --mind perfectionist] [--offline]"""
import argparse
import json
import sys
from pathlib import Path

from . import llm
from .events import Emitter
from .pipeline import run


def main(argv=None):
    ap = argparse.ArgumentParser(description="Run the Brain on a pitch and print a validated DebateScript.")
    ap.add_argument("pitch_file", help="text file containing the pitch")
    ap.add_argument("--mode", choices=["roast", "larp"], default="roast")
    ap.add_argument("--mind", default=None, help="chosenMindId, required for --mode larp")
    ap.add_argument("--session", default="s1")
    ap.add_argument("--offline", action="store_true", help="skip the language model, use built-in scripts")
    ap.add_argument("--out", help="write the DebateScript JSON here")
    ap.add_argument("--events-out", help="write the event replay JSON here")
    args = ap.parse_args(argv)

    pitch = Path(args.pitch_file).read_text(encoding="utf-8").strip()
    pitch_input = {"sessionId": args.session, "mode": args.mode, "pitchText": pitch}
    if args.mind:
        pitch_input["chosenMindId"] = args.mind

    em = Emitter(args.session)
    script = run(pitch_input, em, use_llm=not args.offline)

    text = json.dumps(script, indent=2)
    if args.out:
        Path(args.out).write_text(text + "\n", encoding="utf-8")
    else:
        print(text)
    if args.events_out:
        Path(args.events_out).write_text(json.dumps(em.events, indent=2) + "\n", encoding="utf-8")
    used = "offline" if args.offline else (llm.provider() or "offline")
    print(f"OK: valid DebateScript, model provider={used}, mood={script['ideaScore']['mood']}, {len(script['lines'])} lines, "
          f"{len(em.events)} events", file=sys.stderr)


if __name__ == "__main__":
    main()
