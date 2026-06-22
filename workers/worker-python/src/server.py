from __future__ import annotations

import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import os

from parser import parse_scanner_output


class Handler(BaseHTTPRequestHandler):
    server_version = "ShoreSentinelPythonWorker/0.1"

    def _send_json(self, status: int, payload: dict):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path == "/health":
            self._send_json(200, {"ok": True, "service": "shore-sentinel-worker-python"})
            return
        self._send_json(404, {"error": "not found"})

    def do_POST(self):
        if self.path != "/parse":
            self._send_json(404, {"error": "not found"})
            return
        try:
            length = int(self.headers.get("content-length", "0"))
            payload = json.loads(self.rfile.read(length) or b"{}")
            result = parse_scanner_output(payload.get("runId"), payload.get("scannerOutput"))
            self._send_json(200, result.to_dict())
        except Exception as exc:
            self._send_json(400, {"error": str(exc)})

    def log_message(self, format, *args):
        print(json.dumps({"component": "worker-python", "message": format % args}))


def main():
    port = int(os.environ.get("PYTHON_WORKER_PORT", "4100"))
    server = ThreadingHTTPServer(("0.0.0.0", port), Handler)
    print(json.dumps({"component": "worker-python", "status": "started", "port": port}))
    server.serve_forever()


if __name__ == "__main__":
    main()
