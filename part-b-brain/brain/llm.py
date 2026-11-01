"""Thin Claude wrapper. Returns parsed JSON, retrying on invalid output."""
import json
import os

MODEL = os.environ.get("BRAIN_MODEL", "claude-sonnet-5-5")


def available() -> bool:
    return bool(os.environ.get("ANTHROPIC_API_KEY")) and not os.environ.get("BRAIN_OFFLINE")


def extract_json(text: str):
    start, end = text.find("{"), text.rfind("}")
    if start == -1 or end <= start:
        raise ValueError("no JSON object in model output")
    return json.loads(text[start:end + 1])


def ask_json(system: str, user: str, max_tokens: int = 2500, retries: int = 2):
    import anthropic  # imported lazily so offline mode needs no install

    client = anthropic.Anthropic()
    last = None
    for _ in range(retries + 1):
        msg = client.messages.create(
            model=MODEL, max_tokens=max_tokens, system=system,
            messages=[{"role": "user", "content": user}],
        )
        text = "".join(b.text for b in msg.content if b.type == "text")
        try:
            return extract_json(text)
        except ValueError as e:  # includes json.JSONDecodeError
            last = e
    raise last
