#!/usr/bin/env python3
"""Mock OpenAI-compatible ASR + chat server for Tier-1 / manual testing.

Stdlib only (no venv). Implements the three endpoints the app uses:

  GET  /v1/models                 -> {"data": [{"id": "mock-asr"}, {"id": "mock-llm"}]}
  POST /v1/audio/transcriptions   -> {"text": <JT_MOCK_TEXT>, "language": <JT_MOCK_LANG>}
  POST /v1/chat/completions       -> {"choices": [{"message": {"content": <translation>}}]}

The transcript is deterministic (env-overridable) so an inject-WAV E2E can assert it
exactly. The chat endpoint returns a marker translation that echoes the requested
target language, so dual-translation wiring is observable.

Usage:
  python3 mock_server.py --host 0.0.0.0 --port 8000
  JT_MOCK_TEXT="xin chao" python3 mock_server.py     # custom transcript

Point the app's ASR base URL and LLM base URL at http://<this-host>:8000
(use the Mac LAN IP from a phone on the same wifi: `ipconfig getifaddr en0`).
"""
from __future__ import annotations

import argparse
import json
import os
import re
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

MOCK_TEXT = os.environ.get("JT_MOCK_TEXT", "hello world")
MOCK_LANG = os.environ.get("JT_MOCK_LANG", "en")


class Handler(BaseHTTPRequestHandler):
    def _send_json(self, obj: dict, status: int = 200) -> None:
        body = json.dumps(obj).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _read_body(self) -> bytes:
        length = int(self.headers.get("Content-Length", "0") or "0")
        return self.rfile.read(length) if length else b""

    def do_GET(self) -> None:  # noqa: N802
        if self.path.rstrip("/").endswith("/v1/models"):
            self._send_json({"data": [{"id": "mock-asr"}, {"id": "mock-llm"}]})
        else:
            self._send_json({"error": "not found"}, 404)

    def do_POST(self) -> None:  # noqa: N802
        path = self.path.rstrip("/")
        body = self._read_body()
        if path.endswith("/v1/audio/transcriptions"):
            # Multipart WAV is ignored; the transcript is deterministic.
            self._send_json({"text": MOCK_TEXT, "language": MOCK_LANG})
        elif path.endswith("/v1/chat/completions"):
            target = self._infer_target(body)
            content = f"[{target}] {MOCK_TEXT}" if target else f"[translated] {MOCK_TEXT}"
            self._send_json({"choices": [{"message": {"role": "assistant", "content": content}}]})
        else:
            self._send_json({"error": "not found"}, 404)

    @staticmethod
    def _infer_target(body: bytes) -> str:
        # Best-effort: pull the target language name out of the system prompt.
        try:
            text = body.decode("utf-8", "ignore")
            m = re.search(r"Translate the following to ([A-Za-z]+)", text)
            return m.group(1) if m else ""
        except Exception:
            return ""

    def log_message(self, fmt: str, *args) -> None:  # quieter logs
        print("[mock]", self.address_string(), fmt % args)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--host", default="0.0.0.0")
    ap.add_argument("--port", type=int, default=8000)
    args = ap.parse_args()
    srv = ThreadingHTTPServer((args.host, args.port), Handler)
    print(f"mock server on http://{args.host}:{args.port}  (transcript={MOCK_TEXT!r}, lang={MOCK_LANG!r})")
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        srv.shutdown()


if __name__ == "__main__":
    main()
