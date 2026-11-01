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


# ---------------------------------------------------------------------------
# Provider chooser for the conversation engine (/turn).
# ask_json above stays Anthropic only, for the old /run pipeline.
# ---------------------------------------------------------------------------
import time  # noqa: E402
import urllib.error  # noqa: E402
import urllib.request  # noqa: E402

FEATHERLESS_URL = "https://api.featherless.ai/v1/chat/completions"
DEFAULT_FEATHERLESS_MODEL = "meta-llama/Meta-Llama-3.1-70B-Instruct"
TIMEOUT_SECONDS = 25.0


class LLMError(Exception):
    """Any provider failure: network, HTTP error, or output that is not valid JSON."""


def provider() -> str:
    """'anthropic', 'featherless' or 'offline'. BRAIN_OFFLINE forces offline."""
    if os.environ.get("BRAIN_OFFLINE"):
        return "offline"
    if os.environ.get("ANTHROPIC_API_KEY"):
        return "anthropic"
    if os.environ.get("FEATHERLESS_API_KEY"):
        return "featherless"
    return "offline"


def _anthropic_text(system: str, user: str, max_tokens: int, timeout: float) -> str:
    import anthropic  # lazy, so offline mode needs no install

    client = anthropic.Anthropic(timeout=timeout, max_retries=0)
    msg = client.messages.create(
        model=os.environ.get("BRAIN_MODEL", MODEL), max_tokens=max_tokens, system=system,
        messages=[{"role": "user", "content": user}],
    )
    return "".join(b.text for b in msg.content if b.type == "text")


def _featherless_text(system: str, user: str, max_tokens: int, timeout: float) -> str:
    body = json.dumps({
        "model": os.environ.get("FEATHERLESS_MODEL", DEFAULT_FEATHERLESS_MODEL),
        "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
        "max_tokens": max_tokens,
        "temperature": 0.8,
    }).encode()
    req = urllib.request.Request(
        FEATHERLESS_URL, data=body, method="POST",
        headers={
            "Content-Type": "application/json",
            "Authorization": "Bearer " + os.environ["FEATHERLESS_API_KEY"],
            "User-Agent": "larp-council-brain/1.0",
        },
    )
    with urllib.request.urlopen(req, timeout=timeout) as r:
        data = json.loads(r.read())
    return data["choices"][0]["message"]["content"] or ""


def chat_json(system: str, user: str, max_tokens: int = 900, timeout: float = TIMEOUT_SECONDS, retries: int = 1):
    """Strict JSON from the active provider. Retries once on invalid JSON, then raises LLMError."""
    prov = provider()
    if prov == "offline":
        raise LLMError("no LLM provider configured")
    call = _anthropic_text if prov == "anthropic" else _featherless_text
    last = None
    for attempt in range(retries + 1):
        started = time.monotonic()
        try:
            text = call(system, user if attempt == 0 else user + "\n\nReturn ONLY one valid JSON object, nothing else.",
                        max_tokens, timeout)
        except Exception as e:  # network, HTTP, SDK missing, bad payload shape
            raise LLMError(f"{prov} call failed: {e!r}") from e
        try:
            return extract_json(text)
        except ValueError as e:  # includes json.JSONDecodeError
            last = e
        if time.monotonic() - started > timeout:
            break
    raise LLMError(f"{prov} returned invalid JSON: {last}")
