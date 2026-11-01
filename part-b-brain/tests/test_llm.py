import json
import os
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from unittest import mock

from brain import llm


class FakeFeatherless(BaseHTTPRequestHandler):
    seen = {}

    def do_POST(self):
        FakeFeatherless.seen = {"path": self.path, "auth": self.headers.get("Authorization"),
                                "body": json.loads(self.rfile.read(int(self.headers["Content-Length"])))}
        reply = {"choices": [{"message": {"content": 'Sure! {"originality": 2, "feasibility": 3, "effort": 4} Done.'}}]}
        data = json.dumps(reply).encode()
        self.send_response(200)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def log_message(self, *a):
        pass


class Provider(unittest.TestCase):
    def env(self, **kw):
        base = {k: v for k, v in os.environ.items()
                if k not in ("ANTHROPIC_API_KEY", "FEATHERLESS_API_KEY", "BRAIN_PROVIDER", "BRAIN_OFFLINE")}
        base.update(kw)
        return mock.patch.dict(os.environ, base, clear=True)

    def test_no_keys_means_offline(self):
        with self.env():
            self.assertIsNone(llm.provider())
            self.assertFalse(llm.available())

    def test_featherless_only(self):
        with self.env(FEATHERLESS_API_KEY="k"):
            self.assertEqual(llm.provider(), "featherless")

    def test_anthropic_wins_unless_forced(self):
        with self.env(ANTHROPIC_API_KEY="a", FEATHERLESS_API_KEY="f"):
            self.assertEqual(llm.provider(), "anthropic")
        with self.env(ANTHROPIC_API_KEY="a", FEATHERLESS_API_KEY="f", BRAIN_PROVIDER="featherless"):
            self.assertEqual(llm.provider(), "featherless")

    def test_offline_flag_overrides_keys(self):
        with self.env(ANTHROPIC_API_KEY="a", BRAIN_OFFLINE="1"):
            self.assertIsNone(llm.provider())

    def test_forced_provider_without_key_is_offline(self):
        with self.env(FEATHERLESS_API_KEY="f", BRAIN_PROVIDER="anthropic"):
            self.assertIsNone(llm.provider())


class FeatherlessCall(unittest.TestCase):
    def test_request_shape_and_json_extraction(self):
        httpd = ThreadingHTTPServer(("127.0.0.1", 0), FakeFeatherless)
        threading.Thread(target=httpd.serve_forever, daemon=True).start()
        try:
            env = {"FEATHERLESS_API_KEY": "test-key", "FEATHERLESS_MODEL": "some/model",
                   "FEATHERLESS_BASE_URL": f"http://127.0.0.1:{httpd.server_address[1]}/v1"}
            with mock.patch.dict(os.environ, env):
                os.environ.pop("BRAIN_OFFLINE", None)
                os.environ.pop("ANTHROPIC_API_KEY", None)
                out = llm.ask_json("system text", "user text")
            self.assertEqual(out, {"originality": 2, "feasibility": 3, "effort": 4})
            seen = FakeFeatherless.seen
            self.assertEqual(seen["path"], "/v1/chat/completions")
            self.assertEqual(seen["auth"], "Bearer test-key")
            self.assertEqual(seen["body"]["model"], "some/model")
            self.assertEqual([m["role"] for m in seen["body"]["messages"]], ["system", "user"])
        finally:
            httpd.shutdown()


if __name__ == "__main__":
    unittest.main()
