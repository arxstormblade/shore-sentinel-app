#!/usr/bin/env python3
from __future__ import annotations

import http.client
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse

UPSTREAM = "http://127.0.0.1:3010"
BASE_PATH = "/shore-sentinel"
LISTEN_HOST = "127.0.0.1"
LISTEN_PORT = 8788


def upstream_path(path: str) -> str:
    # Tailscale Serve path routes strip /shore-sentinel before forwarding to this proxy.
    # Next.js now owns basePath, so add the prefix back when Serve sends stripped paths.
    if not path or path == "/":
        return BASE_PATH
    if path == BASE_PATH or path.startswith(f"{BASE_PATH}/") or path.startswith(f"{BASE_PATH}?"):
        return path
    if path.startswith("?"):
        return f"{BASE_PATH}/{path}"
    return f"{BASE_PATH}{path if path.startswith('/') else '/' + path}"


class ProxyHandler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def _proxy(self) -> None:
        target_path = upstream_path(self.path)
        length = int(self.headers.get("Content-Length", "0") or 0)
        body = self.rfile.read(length) if length else None
        upstream = urlparse(UPSTREAM)
        headers = {k: v for k, v in self.headers.items() if k.lower() not in {"host", "accept-encoding", "connection"}}
        headers["Host"] = upstream.netloc
        if body is not None:
            headers["Content-Length"] = str(len(body))

        conn = http.client.HTTPConnection(upstream.hostname or "127.0.0.1", upstream.port or 80, timeout=30)
        try:
            conn.request(self.command, target_path, body=body, headers=headers)
            resp = conn.getresponse()
            payload = resp.read()
            self.send_response(resp.status)
            for key, value in resp.getheaders():
                if key.lower() in {"transfer-encoding", "connection", "content-length", "content-encoding", "keep-alive"}:
                    continue
                self.send_header(key, value)
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            if self.command != "HEAD" and payload:
                self.wfile.write(payload)
        except OSError as exc:
            payload = f"Upstream unavailable: {exc}\n".encode()
            self.send_response(502)
            self.send_header("Content-Type", "text/plain; charset=utf-8")
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)
        finally:
            conn.close()

    def do_GET(self) -> None: self._proxy()  # noqa: N802
    def do_HEAD(self) -> None: self._proxy()  # noqa: N802
    def do_POST(self) -> None: self._proxy()  # noqa: N802
    def do_PUT(self) -> None: self._proxy()  # noqa: N802
    def do_PATCH(self) -> None: self._proxy()  # noqa: N802
    def do_DELETE(self) -> None: self._proxy()  # noqa: N802

    def log_message(self, format: str, *args) -> None:
        return


if __name__ == "__main__":
    server = ThreadingHTTPServer((LISTEN_HOST, LISTEN_PORT), ProxyHandler)
    print(f"tailnet path proxy listening on http://{LISTEN_HOST}:{LISTEN_PORT} -> {UPSTREAM}{BASE_PATH}", flush=True)
    server.serve_forever()
