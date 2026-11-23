"""Resumable-download fault injection: no GPU or public network required."""
import hashlib
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import importlib.util
from pathlib import Path
import re
import tempfile
import threading
import time
import unittest
import urllib.error

SCRIPT = Path(__file__).resolve().parents[1] / "src-tauri/src/vosr_runner.py"
spec = importlib.util.spec_from_file_location("vosr_download_runner", SCRIPT)
runner = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runner)

PAYLOAD = bytes(range(256)) * 1024
CHECKSUM = hashlib.sha256(PAYLOAD).hexdigest()


class Response:
    def __init__(self, start, end, *, status=206, data=PAYLOAD, stall_after=None, wrong_range=False):
        self.status = status
        self.data = data[start:end + 1] if status == 206 else data
        self.cursor, self.stall_after = 0, stall_after
        self.headers = {"Content-Length": str(len(self.data)),
                        "Content-Range": f"bytes {start + int(wrong_range)}-{end}/{len(PAYLOAD)}"}

    def read1(self, count):
        if self.stall_after is not None:
            if self.cursor >= self.stall_after:
                raise TimeoutError("server stopped sending bytes")
            count = min(count, self.stall_after - self.cursor)
        result = self.data[self.cursor:self.cursor + count]
        self.cursor += len(result)
        return result

    def __enter__(self):
        return self

    def __exit__(self, *_):
        pass


class DownloadTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.destination = Path(self.temporary.name) / "weights.bin"
        self.partial = self.destination.with_name(f"weights.bin.{CHECKSUM}.part")
        self.requests, self.messages, self.delays = [], [], []

    def fetch(self, handler=None, **kwargs):
        def opener(request, timeout):
            self.assertGreater(timeout, 0)
            match = re.fullmatch(r"bytes=(\d+)-(\d+)", request.get_header("Range"))
            start, end = map(int, match.groups())
            self.requests.append((start, end, request.full_url))
            return handler(start, end, len(self.requests)) if handler else Response(start, end)
        return runner.download_verified(
            "https://models.invalid/immutable/weights", self.destination, len(PAYLOAD), CHECKSUM,
            opener=opener, sleep=self.delays.append, report=lambda line, **_: self.messages.append(line),
            range_size=65536, **kwargs)

    def test_dropped_stream_resumes_from_bytes_saved_without_app_restart(self):
        def handler(start, end, attempt):
            return Response(start, end, stall_after=20000 if attempt == 1 else None)
        self.fetch(handler)
        self.assertEqual(self.requests[1][0], 20000)
        self.assertNotEqual(self.requests[0][2], self.requests[1][2])
        self.assertEqual(self.destination.read_bytes(), PAYLOAD)
        self.assertFalse(self.partial.exists())
        self.assertEqual(self.delays, [1])

    def test_later_invocation_resumes_saved_partial(self):
        self.partial.write_bytes(PAYLOAD[:12345])
        self.fetch()
        self.assertEqual(self.requests[0][0], 12345)
        self.assertEqual(self.destination.read_bytes(), PAYLOAD)

    def test_previous_xet_partial_is_adopted_without_copying_or_discarding(self):
        legacy = Path(self.temporary.name) / "legacy.incomplete"
        legacy.write_bytes(PAYLOAD[:45000])
        self.fetch(legacy_partial=legacy)
        self.assertEqual(self.requests[0][0], 45000)
        self.assertFalse(legacy.exists())
        self.assertEqual(self.destination.read_bytes(), PAYLOAD)

    def test_noncontiguous_legacy_partial_is_detected_and_recovered(self):
        legacy = Path(self.temporary.name) / "legacy.incomplete"
        legacy.write_bytes(b"\0" * 45000)
        self.fetch(legacy_partial=legacy)
        self.assertEqual(self.requests[0][0], 45000)
        self.assertIn(0, [start for start, _, _ in self.requests[1:]])
        self.assertTrue(any("checksum failed" in message for message in self.messages))
        self.assertEqual(self.destination.read_bytes(), PAYLOAD)

    def test_range_ignoring_server_never_appends_a_whole_file_to_a_prefix(self):
        self.partial.write_bytes(PAYLOAD[:12345])
        self.fetch(lambda start, end, attempt: Response(0, len(PAYLOAD)-1, status=200))
        self.assertEqual(self.destination.read_bytes(), PAYLOAD)

    def test_wrong_content_range_is_rejected_and_partial_preserved(self):
        self.partial.write_bytes(PAYLOAD[:12345])
        with self.assertRaisesRegex(RuntimeError, "downloaded bytes are saved"):
            self.fetch(lambda start, end, attempt: Response(start, end, wrong_range=True), max_failures=2)
        self.assertEqual(self.partial.read_bytes(), PAYLOAD[:12345])
        self.assertFalse(self.destination.exists())

    def test_expired_signature_or_service_error_retries_a_fresh_url(self):
        def handler(start, end, attempt):
            if attempt <= 2:
                raise urllib.error.HTTPError("https://signed.invalid/private", 403 if attempt == 1 else 503,
                                             "temporary server error", {}, None)
            return Response(start, end)
        self.fetch(handler)
        self.assertEqual(self.delays, [1, 2])
        self.assertEqual(self.destination.read_bytes(), PAYLOAD)
        self.assertFalse(any("signed.invalid" in message for message in self.messages))

    def test_exhausted_retries_save_bytes_for_another_click_in_same_app(self):
        self.partial.write_bytes(PAYLOAD[:12345])
        def fail(*_):
            raise TimeoutError("server stopped sending bytes")
        with self.assertRaisesRegex(RuntimeError, "without restarting the app"):
            self.fetch(fail, max_failures=3)
        self.assertEqual(self.partial.read_bytes(), PAYLOAD[:12345])
        self.assertFalse(self.destination.exists())
        self.requests.clear()
        self.fetch()
        self.assertEqual(self.requests[0][0], 12345)

    def test_corrupt_download_is_never_published(self):
        def corrupt(start, end, attempt):
            return Response(start, end, data=b"X" * len(PAYLOAD))
        with self.assertRaisesRegex(RuntimeError, "checksum failed twice"):
            self.fetch(corrupt)
        self.assertFalse(self.destination.exists())

    def test_completed_file_is_verified_and_reused_without_network(self):
        self.destination.write_bytes(PAYLOAD)
        self.fetch(lambda *_: self.fail("completed download must be reused"))
        self.assertEqual(self.requests, [])

    def test_disk_failure_does_not_loop_network_retries(self):
        with self.assertRaises(OSError):
            self.fetch(lambda *_: (_ for _ in ()).throw(OSError("disk is full")))
        self.assertEqual(self.delays, [])


class SocketDownloadTests(unittest.TestCase):
    def exercise_fault(self, stall):
        requests = []
        payload = PAYLOAD[:65536]
        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *_):
                pass

            def do_GET(self):
                match = re.fullmatch(r"bytes=(\d+)-(\d+)", self.headers["Range"])
                start, end = map(int, match.groups())
                requests.append(start)
                self.send_response(206)
                self.send_header("Content-Range", f"bytes {start}-{end}/{len(payload)}")
                self.send_header("Content-Length", str(end - start + 1))
                self.end_headers()
                if len(requests) == 1:
                    self.wfile.write(payload[start:start + 8192])
                    self.wfile.flush()
                    if stall:
                        time.sleep(0.4)
                    self.close_connection = True
                else:
                    self.wfile.write(payload[start:end + 1])

        try:
            server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        except PermissionError:
            self.skipTest("Local sockets are unavailable in this test environment")
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            with tempfile.TemporaryDirectory() as temporary:
                destination = Path(temporary) / "weights.bin"
                runner.download_verified(
                    f"http://127.0.0.1:{server.server_port}/model", destination,
                    len(payload), hashlib.sha256(payload).hexdigest(),
                    timeout=0.1, sleep=lambda _: None, report=lambda *a, **kw: None)
                self.assertEqual(destination.read_bytes(), payload)
                self.assertEqual(requests[:2], [0, 8192])
        finally:
            server.shutdown()
            server.server_close()
            thread.join()

    def test_real_socket_drop_resumes_saved_prefix(self):
        self.exercise_fault(stall=False)

    def test_real_socket_read_timeout_reconnects_and_resumes(self):
        self.exercise_fault(stall=True)


if __name__ == "__main__":
    unittest.main()
