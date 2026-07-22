import http.client
import json
import os
import socket
import sys
import threading
import unittest
import re
from pathlib import Path
from unittest import mock

SRC = Path(__file__).resolve().parents[1] / "src"
sys.path.insert(0, str(SRC))
import server  # noqa: E402


class ParserServerTests(unittest.TestCase):
    TOKEN = "test-internal-token"

    @classmethod
    def setUpClass(cls):
        cls._old_token = os.environ.get("INTERNAL_WORKER_TOKEN")
        os.environ["INTERNAL_WORKER_TOKEN"] = cls.TOKEN
        cls.httpd = server.ThreadingHTTPServer(("127.0.0.1", 0), server.Handler)
        cls.thread = threading.Thread(target=cls.httpd.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.httpd.shutdown()
        cls.httpd.server_close()
        cls.thread.join()
        if cls._old_token is None:
            os.environ.pop("INTERNAL_WORKER_TOKEN", None)
        else:
            os.environ["INTERNAL_WORKER_TOKEN"] = cls._old_token

    def post_parse(self, body, headers=None):
        connection = http.client.HTTPConnection(*self.httpd.server_address)
        connection.request("POST", "/parse", body=body, headers=headers or {})
        response = connection.getresponse()
        payload = json.loads(response.read())
        connection.close()
        return response, payload

    def post_parse_raw(self, body, headers, *, close_write=False):
        connection = http.client.HTTPConnection(*self.httpd.server_address)
        early_write_close = False
        try:
            connection.putrequest("POST", "/parse")
            for name, value in headers.items():
                connection.putheader(name, value)
            connection.endheaders()
            if body:
                try:
                    connection.send(body)
                except (BrokenPipeError, ConnectionResetError):
                    # The server can reject solely from Content-Length and close
                    # before a client finishes writing the declared body.
                    early_write_close = True
            if close_write:
                connection.sock.shutdown(socket.SHUT_WR)
            try:
                response = connection.getresponse()
            except (ConnectionResetError, http.client.RemoteDisconnected):
                if early_write_close:
                    return None, None
                raise
            payload = json.loads(response.read())
            return response, payload
        finally:
            connection.close()

    def authorized_headers(self, content_length=None):
        headers = {"Authorization": f"Bearer {self.TOKEN}", "Content-Type": "application/json"}
        if content_length is not None:
            headers["Content-Length"] = str(content_length)
        return headers

    def test_parse_rejects_missing_worker_bearer_token(self):
        body = b'{"runId":"run-1","scannerOutput":{}}'
        response, payload = self.post_parse(
            body,
            {"Content-Type": "application/json", "Content-Length": str(len(body))},
        )

        self.assertEqual(response.status, 401)
        self.assertEqual(payload, {"error": "unauthorized"})

    def test_parse_rejects_absent_content_length_before_parsing(self):
        response, payload = self.post_parse_raw(b"", self.authorized_headers())

        self.assertEqual(response.status, 411)
        self.assertEqual(payload, {"error": "content length required"})

    def test_parse_rejects_malformed_or_negative_content_length_before_parsing(self):
        for length in ("not-a-number", "-1"):
            with self.subTest(length=length):
                response, payload = self.post_parse_raw(
                    b"",
                    self.authorized_headers(length),
                    close_write=length == "-1",
                )
                self.assertEqual(response.status, 400)
                self.assertEqual(payload, {"error": "invalid content length"})

    def test_post_parse_raw_collects_early_rejection_response_after_write_close(self):
        for write_error in (BrokenPipeError, ConnectionResetError):
            with self.subTest(write_error=write_error.__name__):
                connection = mock.Mock()
                response = mock.Mock(status=413)
                response.read.return_value = b'{"error":"request body too large"}'
                connection.send.side_effect = write_error()
                connection.getresponse.return_value = response

                with mock.patch("http.client.HTTPConnection", return_value=connection):
                    actual_response, payload = self.post_parse_raw(
                        b"body",
                        self.authorized_headers(server.MAX_PARSE_BODY_BYTES + 1),
                    )

                self.assertIs(actual_response, response)
                self.assertEqual(payload, {"error": "request body too large"})
                connection.getresponse.assert_called_once_with()
                connection.close.assert_called_once_with()

    def test_post_parse_raw_reports_unavailable_response_after_early_write_close(self):
        for read_error in (ConnectionResetError, http.client.RemoteDisconnected):
            with self.subTest(read_error=read_error.__name__):
                connection = mock.Mock()
                connection.send.side_effect = BrokenPipeError()
                connection.getresponse.side_effect = read_error()

                with mock.patch("http.client.HTTPConnection", return_value=connection):
                    response, payload = self.post_parse_raw(
                        b"body",
                        self.authorized_headers(server.MAX_PARSE_BODY_BYTES + 1),
                    )

                self.assertIsNone(response)
                self.assertIsNone(payload)
                connection.close.assert_called_once_with()

    def test_parse_rejects_content_length_one_byte_larger_than_documented_payload_ceiling_before_reading(self):
        response, payload = self.post_parse_raw(
            b"",
            self.authorized_headers(server.MAX_PARSE_BODY_BYTES + 1),
        )

        self.assertEqual(response.status, 413)
        self.assertEqual(payload, {"error": "request body too large"})

    def test_parse_accepts_a_valid_body_at_exactly_documented_payload_ceiling(self):
        prefix = b'{"runId":"run-1","scannerOutput":"'
        suffix = b'"}'
        body = prefix + (b"x" * ((1024 * 1024) - len(prefix) - len(suffix))) + suffix
        result = mock.Mock(to_dict=mock.Mock(return_value={"ok": True}))
        with mock.patch.object(server, "parse_scanner_output", return_value=result) as parse:
            response, payload = self.post_parse_raw(body, self.authorized_headers(len(body)))

        self.assertEqual(len(body), 1024 * 1024)
        self.assertEqual(response.status, 200)
        self.assertEqual(payload, {"ok": True})
        parse.assert_called_once_with("run-1", mock.ANY, expected_target_asset_id=None, expected_scanner=None, expected_subject_type=None)

    def test_parse_payload_ceiling_matches_node_payload_contract(self):
        node_limits = (SRC.parents[1] / "worker-node" / "src" / "payloadLimits.js").read_text()
        match = re.search(r"PARSER_REQUEST_MAX_BYTES = (\d+) \* (\d+)", node_limits)

        self.assertIsNotNone(match)
        self.assertEqual(server.MAX_PARSE_BODY_BYTES, int(match.group(1)) * int(match.group(2)))

    def test_parse_does_not_leak_parser_exception_details(self):
        body = b'{"runId":"run-1","scannerOutput":{}}'
        with mock.patch.object(server, "parse_scanner_output", side_effect=ValueError("secret parser detail")):
            response, payload = self.post_parse_raw(body, self.authorized_headers(len(body)))

        self.assertEqual(response.status, 400)
        self.assertEqual(payload, {"error": "invalid parse request"})
        self.assertNotIn("secret parser detail", json.dumps(payload))


if __name__ == "__main__":
    unittest.main()
