from __future__ import annotations

import hmac
import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import os

from parser import parse_scanner_output


# Must match worker-node/src/payloadLimits.js PARSER_REQUEST_MAX_BYTES.
# This cap applies to the complete UTF-8 JSON request envelope, not raw stdout.
MAX_PARSE_BODY_BYTES = 1024 * 1024


class Handler(BaseHTTPRequestHandler):
    server_version = "ShoreSentinelPythonWorker/0.1"

    def _send_json(self, status: int, payload: dict):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _is_authorized(self) -> bool:
        expected_token = os.environ.get("INTERNAL_WORKER_TOKEN", "")
        authorization = self.headers.get("authorization", "")
        if not expected_token:
            return False
        expected_authorization = f"Bearer {expected_token}"
        return hmac.compare_digest(
            authorization.encode("utf-8"),
            expected_authorization.encode("utf-8"),
        )

    def do_GET(self):
        if self.path == "/health":
            self._send_json(200, {"ok": True, "service": "shore-sentinel-worker-python"})
            return
        self._send_json(404, {"error": "not found"})

    def do_POST(self):
        if self.path != "/parse":
            self._send_json(404, {"error": "not found"})
            return
        if not self._is_authorized():
            self._send_json(401, {"error": "unauthorized"})
            return
        content_length = self.headers.get("content-length")
        if content_length is None:
            self._send_json(411, {"error": "content length required"})
            return
        if not content_length.isascii() or not content_length.isdecimal():
            self._send_json(400, {"error": "invalid content length"})
            return
        length = int(content_length)
        if length > MAX_PARSE_BODY_BYTES:
            self._send_json(413, {"error": "request body too large"})
            return
        try:
            payload = json.loads(self.rfile.read(length) or b"{}")
            result = parse_scanner_output(payload.get("runId"), payload.get("scannerOutput"))
            self._send_json(200, result.to_dict())
        except Exception:
            self._send_json(400, {"error": "invalid parse request"})

    def log_message(self, format, *args):
        print(json.dumps({"component": "worker-python", "message": format % args}))


def main():
    port = int(os.environ.get("PYTHON_WORKER_PORT", "4100"))
    server = ThreadingHTTPServer(("0.0.0.0", port), Handler)
    print(json.dumps({"component": "worker-python", "status": "started", "port": port}))
    server.serve_forever()


if __name__ == "__main__":
    main()
