"""HTTP server for the Brain, for a free Render Web Service (standard library only).

Start command:  python server.py          (reads PORT, which Render sets)

GET  /health  ->  {"ok": true, "llm": bool}
POST /run     ->  body: PitchInput JSON
                  reply: {"script": DebateScript, "events": [Event, ...]}
"""
import json
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from brain import llm
from brain.events import Emitter
from brain.pipeline import run

MAX_BODY = 20_000  # bytes; a pitch is a few paragraphs


class Handler(BaseHTTPRequestHandler):
    def _send(self, code: int, body: dict):
        data = json.dumps(body).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        # Open CORS so the browser frontend (Part C) can call the Brain directly.
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()
        self.wfile.write(data)

    def do_OPTIONS(self):
        self._send(204, {})

    def do_GET(self):
        if self.path == "/health":
            self._send(200, {"ok": True, "llm": llm.available(), "provider": llm.provider() or "offline"})
        else:
            self._send(404, {"error": "not found; try GET /health or POST /run"})

    def do_POST(self):
        if self.path != "/run":
            return self._send(404, {"error": "not found; try POST /run"})
        try:
            length = int(self.headers.get("Content-Length", 0))
            if length <= 0 or length > MAX_BODY:
                return self._send(400, {"error": f"body must be 1-{MAX_BODY} bytes"})
            pitch_input = json.loads(self.rfile.read(length))
            emitter = Emitter(str(pitch_input.get("sessionId", "s1")) if isinstance(pitch_input, dict) else "s1")
            script = run(pitch_input, emitter)
            self._send(200, {"script": script, "events": emitter.events})
        except (ValueError, json.JSONDecodeError) as e:  # bad input, including contract violations
            self._send(400, {"error": str(e)})
        except Exception as e:  # never leak a stack trace to the browser
            print(f"/run failed: {e!r}", flush=True)
            self._send(500, {"error": "internal error"})

    def log_message(self, fmt, *args):
        print(f"{self.address_string()} {fmt % args}", flush=True)


def make_server(port: int) -> ThreadingHTTPServer:
    return ThreadingHTTPServer(("0.0.0.0", port), Handler)


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "8000"))
    print(f"Brain listening on :{port} (model provider: {llm.provider() or 'offline'})", flush=True)
    make_server(port).serve_forever()
