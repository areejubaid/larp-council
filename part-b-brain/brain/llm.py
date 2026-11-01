"""Language model wrapper. Returns parsed JSON, retrying on invalid output.

Providers (first one with a key wins, or force one with BRAIN_PROVIDER):
  anthropic    needs ANTHROPIC_API_KEY, model from BRAIN_MODEL
  featherless  needs FEATHERLESS_API_KEY, model from FEATHERLESS_MODEL
Set BRAIN_OFFLINE=1 to skip the model entirely.

A local part-b-brain/.env file (git-ignored) is read at import, so keys never
need to be typed into a terminal or pasted anywhere.
"""
import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path


def _load_env():
    path = Path(__file__).resolve().parent.parent / ".env"
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key, value = key.strip(), value.strip().strip('"').strip("'")
        if value and key not in os.environ:
            os.environ[key] = value


_load_env()

FEATHERLESS_URL = "https://api.featherless.ai/v1"
DEFAULT_FEATHERLESS_MODEL = "meta-llama/Meta-Llama-3.1-8B-Instruct"


def provider():
    """Name of the model provider in use, or None for offline mode."""
    if os.environ.get("BRAIN_OFFLINE"):
        return None
    forced = os.environ.get("BRAIN_PROVIDER", "").lower()
    has = {"anthropic": bool(os.environ.get("ANTHROPIC_API_KEY")),
           "featherless": bool(os.environ.get("FEATHERLESS_API_KEY"))}
    if forced in has:
        return forced if has[forced] else None
    for name in ("anthropic", "featherless"):
        if has[name]:
            return name
    return None


def available() -> bool:
    return provider() is not None


def note_failure(err: Exception):
    """Log (to stderr, never the key) why a model call fell back to offline scripts."""
    print(f"llm call failed, using offline script: {err!r}", file=sys.stderr, flush=True)


def extract_json(text: str):
    start, end = text.find("{"), text.rfind("}")
    if start == -1 or end <= start:
        raise ValueError("no JSON object in model output")
    return json.loads(text[start:end + 1])


def _ask_anthropic(system: str, user: str, max_tokens: int) -> str:
    import anthropic  # imported lazily so offline mode needs no install

    client = anthropic.Anthropic()
    msg = client.messages.create(
        model=os.environ.get("BRAIN_MODEL", "claude-sonnet-5-5"), max_tokens=max_tokens, system=system,
        messages=[{"role": "user", "content": user}],
    )
    return "".join(b.text for b in msg.content if b.type == "text")


def _ask_featherless(system: str, user: str, max_tokens: int) -> str:
    base = os.environ.get("FEATHERLESS_BASE_URL", FEATHERLESS_URL).rstrip("/")
    body = {
        "model": os.environ.get("FEATHERLESS_MODEL", DEFAULT_FEATHERLESS_MODEL),
        "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
        "max_tokens": max_tokens,
        "temperature": 0.8,
    }
    req = urllib.request.Request(
        base + "/chat/completions", data=json.dumps(body).encode(), method="POST",
        headers={"Content-Type": "application/json",
                 "Authorization": f"Bearer {os.environ['FEATHERLESS_API_KEY']}",
                 "HTTP-Referer": "https://larp-council-brain.onrender.com", "X-Title": "Mind Council"})
    try:
        with urllib.request.urlopen(req, timeout=45) as r:
            data = json.loads(r.read())
    except urllib.error.HTTPError as e:  # keep the status and message, drop request details
        raise RuntimeError(f"featherless HTTP {e.code}: {e.read()[:200]!r}") from None
    return data["choices"][0]["message"]["content"]


def ask_json(system: str, user: str, max_tokens: int = 2500, retries: int = 2):
    name = provider()
    if name is None:
        raise RuntimeError("no model provider configured")
    ask = _ask_anthropic if name == "anthropic" else _ask_featherless
    last = None
    for _ in range(retries + 1):
        try:
            return extract_json(ask(system, user, max_tokens))
        except ValueError as e:  # invalid JSON from the model (includes JSONDecodeError): retry
            last = e
    raise last
