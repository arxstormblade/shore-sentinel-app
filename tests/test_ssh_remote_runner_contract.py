import os
import re
import shlex
import subprocess
import tempfile
import time
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
RUNNER = ROOT / "infra" / "remote-runner" / "run-scan"
SUPERVISOR = ROOT / "infra" / "remote-runner" / "run-scan-supervisor"
INSTALL_CONTRACT = ROOT / "docs" / "security" / "remote-runner-install.md"


class RemoteRunnerProtocolTests(unittest.TestCase):
    REQUEST_ID = "123e4567-e89b-12d3-a456-426614174000"

    def write_sandboxed_runner(self, temporary_directory):
        request_root = temporary_directory / "requests"
        state_root = temporary_directory / "runner-state"
        implementation = temporary_directory / "run-scan-impl"
        supervisor = temporary_directory / "run-scan-supervisor"
        invocation_log = temporary_directory / "implementation-invocations"
        source = RUNNER.read_text(encoding="utf-8")
        source = source.replace(
            "REQUEST_ROOT=/var/lib/shore-sentinel/requests",
            f"REQUEST_ROOT={shlex.quote(str(request_root))}",
        ).replace(
            "STATE_ROOT=/var/lib/shore-sentinel/runner-state",
            f"STATE_ROOT={shlex.quote(str(state_root))}",
        ).replace(
            "SCAN_IMPLEMENTATION=/usr/local/lib/shore-sentinel/run-scan-impl",
            f"SCAN_IMPLEMENTATION={shlex.quote(str(implementation))}",
        ).replace(
            "SCAN_SUPERVISOR=/usr/local/lib/shore-sentinel/run-scan-supervisor",
            f"SCAN_SUPERVISOR={shlex.quote(str(supervisor))}",
        ).replace(
            'require_root() {\n  [[ "$(id -u)" == "0" ]] || reject\n}',
            "require_root() {\n  :\n}",
        ).replace(
            '  (\n    sleep "$MAX_RUNTIME_SECONDS"',
            '  (\n    exec >/dev/null 2>&1\n    sleep "$MAX_RUNTIME_SECONDS"',
        )
        runner = temporary_directory / "run-scan"
        runner.write_text(source, encoding="utf-8")
        runner.chmod(0o700)
        supervisor.write_text(
            SUPERVISOR.read_text(encoding="utf-8").replace(
                "readonly SCAN_IMPLEMENTATION=/usr/local/lib/shore-sentinel/run-scan-impl",
                f"readonly SCAN_IMPLEMENTATION={shlex.quote(str(implementation))}",
            ).replace(
                "readonly REQUEST_ROOT=/var/lib/shore-sentinel/requests",
                f"readonly REQUEST_ROOT={shlex.quote(str(request_root))}",
            ).replace(
                "readonly STATE_ROOT=/var/lib/shore-sentinel/runner-state",
                f"readonly STATE_ROOT={shlex.quote(str(state_root))}",
            ),
            encoding="utf-8",
        )
        supervisor.chmod(0o700)
        state_root.mkdir()
        implementation.write_text(
            "#!/usr/bin/env bash\nset -euo pipefail\nprintf '%s\\n' \"$1 $2\" >> "
            f"{shlex.quote(str(invocation_log))}\n",
            encoding="utf-8",
        )
        implementation.chmod(0o700)
        return runner, request_root, invocation_log

    def test_runner_bounded_cleanup_reports_fixed_failure_when_kill_does_not_clear_group(self):
        runner_prefix = RUNNER.read_text(encoding="utf-8").split(
            "\n[[ $# -eq 2 ]] || reject\n", 1
        )[0]
        with tempfile.TemporaryDirectory() as temporary_directory:
            temporary_path = Path(temporary_directory)
            state_root = temporary_path / "runner-state"
            harness = temporary_path / "persistent-group-harness"
            harness.write_text(
                f"""{runner_prefix}
STATE_ROOT={shlex.quote(str(state_root))}
MAX_GRACE_SECONDS=0
MAX_KILL_WAIT_SECONDS=2
SECONDS=0
clock=0
process_identity_matches() {{ return 0; }}
process_group_running() {{ return 0; }}
kill() {{ return 0; }}
sleep() {{ clock=$((clock + 1)); SECONDS=$clock; }}
mkdir -p "$STATE_ROOT/{self.REQUEST_ID}"
printf '%s\n' '4242 999 4242 4242 9999999999' > "$STATE_ROOT/{self.REQUEST_ID}/state"
if cancel_request '{self.REQUEST_ID}'; then result=0; else result=$?; fi
printf 'result=%s clock=%s\\n' "$result" "$clock"
""",
                encoding="utf-8",
            )
            completed = subprocess.run(
                ["timeout", "2", "bash", str(harness)],
                check=False,
                capture_output=True,
                text=True,
            )

        self.assertEqual(completed.returncode, 0)
        self.assertEqual(completed.stdout, "CLEANUP_FAILED\nresult=70 clock=2\n")
        self.assertEqual(completed.stderr, "")

    def test_retained_stale_uuid_state_never_signals_a_recycled_process_group(self):
        runner_prefix = RUNNER.read_text(encoding="utf-8").split(
            "\n[[ $# -eq 2 ]] || reject\n", 1
        )[0]
        with tempfile.TemporaryDirectory() as temporary_directory:
            temporary_path = Path(temporary_directory)
            state_root = temporary_path / "runner-state"
            signal_log = temporary_path / "signals"
            harness = temporary_path / "stale-authority-harness"
            harness.write_text(
                f"""{runner_prefix}
STATE_ROOT={shlex.quote(str(state_root))}
MAX_GRACE_SECONDS=0
MAX_KILL_WAIT_SECONDS=0
process_identity_matches() {{ return 1; }}
process_group_running() {{ return 0; }}
kill() {{ printf '%s\\n' \"$*\" >> {shlex.quote(str(signal_log))}; return 0; }}
mkdir -p \"$STATE_ROOT/{self.REQUEST_ID}\"
printf '%s\\n' '4242 4242 9999999999' > \"$STATE_ROOT/{self.REQUEST_ID}/state\"
cancel_request '{self.REQUEST_ID}'
""",
                encoding="utf-8",
            )
            completed = subprocess.run(
                ["bash", str(harness)],
                check=False,
                capture_output=True,
                text=True,
                timeout=2,
            )
            status_path = state_root / self.REQUEST_ID / "status"
            status_output = status_path.read_text(encoding="utf-8") if status_path.exists() else ""
            signal_output = signal_log.read_text(encoding="utf-8") if signal_log.exists() else ""

        self.assertEqual(completed.returncode, 0)
        self.assertEqual(completed.stdout, "NOT_RUNNING\n")
        self.assertEqual(completed.stderr, "")
        self.assertEqual(signal_output, "", "stale UUID state must never signal a recycled numeric group")
        self.assertEqual(status_output, "STALE_AUTHORITY\n")

    def test_deadline_cleanup_failure_keeps_state_after_leader_exits_with_persistent_group(self):
        with tempfile.TemporaryDirectory() as temporary_directory:
            temporary_path = Path(temporary_directory)
            request_root = temporary_path / "requests"
            state_root = temporary_path / "runner-state"
            implementation = temporary_path / "run-scan-impl"
            supervisor = temporary_path / "run-scan-supervisor"
            request_path = request_root / self.REQUEST_ID / "request.json"
            source = RUNNER.read_text(encoding="utf-8")
            source = source.replace(
                "REQUEST_ROOT=/var/lib/shore-sentinel/requests",
                f"REQUEST_ROOT={shlex.quote(str(request_root))}",
            ).replace(
                "STATE_ROOT=/var/lib/shore-sentinel/runner-state",
                f"STATE_ROOT={shlex.quote(str(state_root))}",
            ).replace(
                "SCAN_IMPLEMENTATION=/usr/local/lib/shore-sentinel/run-scan-impl",
                f"SCAN_IMPLEMENTATION={shlex.quote(str(implementation))}",
            ).replace(
                "SCAN_SUPERVISOR=/usr/local/lib/shore-sentinel/run-scan-supervisor",
                f"SCAN_SUPERVISOR={shlex.quote(str(supervisor))}",
            ).replace(
                "MAX_RUNTIME_SECONDS=100",
                "MAX_RUNTIME_SECONDS=0",
            ).replace(
                "MAX_GRACE_SECONDS=8",
                "MAX_GRACE_SECONDS=0",
            ).replace(
                "MAX_KILL_WAIT_SECONDS=2",
                "MAX_KILL_WAIT_SECONDS=1",
            ).replace(
                'require_root() {\n  [[ "$(id -u)" == "0" ]] || reject\n}',
                "require_root() {\n  :\n}",
            ).replace(
                'process_group_running() {\n  local pgid=$1\n  kill -0 -- "-$pgid" 2>/dev/null\n}',
                "process_group_running() {\n  return 0\n}\n\nkill() {\n  if [[ \"$1\" == \"-KILL\" ]]; then /bin/kill \"$@\"; else return 0; fi\n}",
            )
            runner = temporary_path / "run-scan"
            runner.write_text(source, encoding="utf-8")
            runner.chmod(0o700)
            supervisor.write_text(
                "#!/usr/bin/env bash\ntrap ':' TERM\nwhile :; do sleep 1; done\n",
                encoding="utf-8",
            )
            supervisor.chmod(0o700)
            state_root.mkdir()
            request_path.parent.mkdir(parents=True)
            request_path.write_text("{}\n", encoding="utf-8")
            implementation.write_text("#!/usr/bin/env bash\nexit 0\n", encoding="utf-8")
            implementation.chmod(0o700)

            started_at = time.monotonic()
            completed = subprocess.run(
                ["bash", str(runner), "--request", self.REQUEST_ID],
                check=False,
                capture_output=True,
                text=True,
                timeout=3,
            )
            elapsed = time.monotonic() - started_at
            state_directory = state_root / self.REQUEST_ID

            self.assertLess(elapsed, 2.5, "deadline cleanup must stay bounded")
            self.assertEqual(completed.returncode, 70)
            self.assertEqual(completed.stdout, "CLEANUP_FAILED\n")
            self.assertEqual(completed.stderr, "")
            self.assertTrue(state_directory.is_dir(), "failed cleanup must retain durable state")
            self.assertTrue((state_directory / "state").is_file())
            self.assertEqual(
                (state_directory / "status").read_text(encoding="utf-8"),
                "CLEANUP_FAILED\n",
            )
            self.assertEqual(state_directory.stat().st_mode & 0o777, 0o700)
            self.assertEqual((state_directory / "state").stat().st_mode & 0o777, 0o600)
            self.assertEqual((state_directory / "status").stat().st_mode & 0o777, 0o600)
            self.assertEqual(state_directory.stat().st_uid, os.geteuid())

    def test_runner_rejects_symlinked_uuid_request_directory_before_fixed_implementation(self):
        with tempfile.TemporaryDirectory() as temporary_directory:
            temporary_path = Path(temporary_directory)
            runner, request_root, invocation_log = self.write_sandboxed_runner(temporary_path)
            outside_directory = temporary_path / "outside-request"
            outside_directory.mkdir()
            (outside_directory / "request.json").write_text("{}\n", encoding="utf-8")
            request_root.mkdir()
            (request_root / self.REQUEST_ID).symlink_to(outside_directory, target_is_directory=True)

            completed = subprocess.run(
                ["bash", str(runner), "--request", self.REQUEST_ID],
                check=False,
                capture_output=True,
                text=True,
                timeout=2,
            )
            implementation_launched = invocation_log.exists()

        self.assertEqual(completed.returncode, 64)
        self.assertEqual(completed.stdout, "REJECTED\n")
        self.assertEqual(completed.stderr, "")
        self.assertFalse(implementation_launched, "fixed implementation must not launch")

    def test_stage_request_creates_a_root_owned_atomic_uuid_request_without_symlink_escape(self):
        with tempfile.TemporaryDirectory() as temporary_directory:
            temporary_path = Path(temporary_directory)
            runner, request_root, _ = self.write_sandboxed_runner(temporary_path)
            request_root.mkdir()
            payload = b'{"enrolledRoot":"/srv/shore-sentinel","scanTarget":"/srv/shore-sentinel"}'

            completed = subprocess.run(
                ["bash", str(runner), "--stage-request", self.REQUEST_ID],
                input=payload,
                check=False,
                capture_output=True,
                timeout=2,
            )
            request_directory = request_root / self.REQUEST_ID
            request_path = request_directory / "request.json"

            self.assertEqual(completed.returncode, 0)
            self.assertEqual(completed.stdout, b"")
            self.assertEqual(completed.stderr, b"")
            self.assertTrue(request_directory.is_dir())
            self.assertFalse(request_directory.is_symlink())
            self.assertEqual(request_directory.stat().st_mode & 0o777, 0o700)
            self.assertEqual(request_path.read_bytes(), payload)
            self.assertFalse(request_path.is_symlink())
            self.assertEqual(request_path.stat().st_mode & 0o777, 0o600)
            self.assertEqual(request_path.stat().st_uid, os.geteuid())

            outside_directory = temporary_path / "outside-request"
            outside_directory.mkdir()
            escaped_id = "223e4567-e89b-12d3-a456-426614174000"
            (request_root / escaped_id).symlink_to(outside_directory, target_is_directory=True)
            escaped = subprocess.run(
                ["bash", str(runner), "--stage-request", escaped_id],
                input=b"{}",
                check=False,
                capture_output=True,
                timeout=2,
            )
            self.assertEqual(escaped.returncode, 64)
            self.assertEqual(escaped.stdout, b"REJECTED\n")
            self.assertFalse((outside_directory / "request.json").exists())

    def test_stage_request_rejects_oversized_stdin_without_creating_a_request_file(self):
        with tempfile.TemporaryDirectory() as temporary_directory:
            temporary_path = Path(temporary_directory)
            runner, request_root, _ = self.write_sandboxed_runner(temporary_path)
            request_root.mkdir()
            completed = subprocess.run(
                ["bash", str(runner), "--stage-request", self.REQUEST_ID],
                input=b"x" * 8193,
                check=False,
                capture_output=True,
                timeout=2,
            )

            self.assertEqual(completed.returncode, 64)
            self.assertEqual(completed.stdout, b"REJECTED\n")
            self.assertEqual(completed.stderr, b"")
            self.assertFalse((request_root / self.REQUEST_ID / "request.json").exists())

    def test_stage_request_has_fixed_timeout_and_rejects_timed_out_stdin_without_request_state(self):
        source = RUNNER.read_text(encoding="utf-8")
        self.assertIn("MAX_STAGE_STDIN_SECONDS=5", source)
        self.assertIn(
            '"/usr/bin/timeout" --foreground "$MAX_STAGE_STDIN_SECONDS" '
            '"/usr/bin/head" -c "$((MAX_REQUEST_BYTES + 1))" > "$temporary_path"',
            source,
        )

        runner_prefix = source.split("\n[[ $# -eq 2 ]] || reject\n", 1)[0]
        with tempfile.TemporaryDirectory() as temporary_directory:
            temporary_path = Path(temporary_directory)
            request_root = temporary_path / "requests"
            harness = temporary_path / "timed-out-stage-harness"
            harness.write_text(
                runner_prefix.replace(
                    "REQUEST_ROOT=/var/lib/shore-sentinel/requests",
                    f"REQUEST_ROOT={shlex.quote(str(request_root))}",
                ).replace('"/usr/bin/timeout"', "timeout").replace('"/usr/bin/head"', "head")
                + f"""
timeout() {{ return 124; }}
mkdir -p "$REQUEST_ROOT"
stage_request "{self.REQUEST_ID}"
""",
                encoding="utf-8",
            )
            completed = subprocess.run(
                ["bash", str(harness)],
                check=False,
                capture_output=True,
                text=True,
                timeout=2,
            )

            self.assertEqual(completed.returncode, 64)
            self.assertEqual(completed.stdout, "REJECTED\n")
            self.assertEqual(completed.stderr, "")
            self.assertFalse((request_root / self.REQUEST_ID).exists())

    def test_runner_launches_fixed_implementation_for_regular_uuid_request_directory(self):
        with tempfile.TemporaryDirectory() as temporary_directory:
            temporary_path = Path(temporary_directory)
            runner, request_root, invocation_log = self.write_sandboxed_runner(temporary_path)
            request_directory = request_root / self.REQUEST_ID
            request_directory.mkdir(parents=True)
            request_path = request_directory / "request.json"
            request_path.write_text("{}\n", encoding="utf-8")

            completed = subprocess.run(
                ["bash", str(runner), "--request", self.REQUEST_ID],
                check=False,
                capture_output=True,
                text=True,
                timeout=2,
            )
            invocation = invocation_log.read_text(encoding="utf-8")

        self.assertEqual(completed.returncode, 0)
        self.assertEqual(completed.stdout, "")
        self.assertEqual(completed.stderr, "")
        self.assertEqual(
            invocation,
            f"--request {request_path}\n",
        )

    def test_supervisor_requires_runner_startup_release_before_invoking_fixed_implementation(self):
        source = SUPERVISOR.read_text(encoding="utf-8")
        self.assertIn("state_authorizes_self", source)
        self.assertIn("MAX_STARTUP_WAIT_SECONDS=1", source)
        self.assertIn('"$SCAN_IMPLEMENTATION" --request "$2" &', source)
        self.assertNotRegex(source, r"\beval\b|bash -c|sh -c")

        with tempfile.TemporaryDirectory() as temporary_directory:
            temporary_path = Path(temporary_directory)
            request_root = temporary_path / "requests"
            request_path = request_root / self.REQUEST_ID / "request.json"
            implementation = temporary_path / "run-scan-impl"
            invocation_log = temporary_path / "implementation-invocations"
            request_path.parent.mkdir(parents=True)
            request_path.write_text("{}\n", encoding="utf-8")
            implementation.write_text(
                "#!/usr/bin/env bash\nset -euo pipefail\nprintf '%s\\n' \"$*\" >> "
                f"{shlex.quote(str(invocation_log))}\n",
                encoding="utf-8",
            )
            implementation.chmod(0o700)
            supervisor = temporary_path / "run-scan-supervisor"
            supervisor.write_text(
                source.replace(
                    "readonly SCAN_IMPLEMENTATION=/usr/local/lib/shore-sentinel/run-scan-impl",
                    f"readonly SCAN_IMPLEMENTATION={shlex.quote(str(implementation))}",
                ).replace(
                    "readonly REQUEST_ROOT=/var/lib/shore-sentinel/requests",
                    f"readonly REQUEST_ROOT={shlex.quote(str(request_root))}",
                ),
                encoding="utf-8",
            )
            supervisor.chmod(0o700)
            completed = subprocess.run(
                ["bash", str(supervisor), "--request", str(request_path)],
                input="",
                check=False,
                capture_output=True,
                text=True,
                timeout=2,
            )

            self.assertEqual(completed.returncode, 64)
            self.assertEqual(completed.stdout, "")
            self.assertEqual(completed.stderr, "")
            self.assertFalse(invocation_log.exists(), "a supervisor without a runner release must not scan")

    def test_supervisor_rejects_expired_matching_startup_state_before_fixed_implementation(self):
        with tempfile.TemporaryDirectory() as temporary_directory:
            temporary_path = Path(temporary_directory)
            request_root = temporary_path / "requests"
            state_root = temporary_path / "runner-state"
            request_path = request_root / self.REQUEST_ID / "request.json"
            state_path = state_root / self.REQUEST_ID / "state"
            implementation = temporary_path / "run-scan-impl"
            invocation_log = temporary_path / "implementation-invocations"
            request_path.parent.mkdir(parents=True)
            request_path.write_text("{}\n", encoding="utf-8")
            state_path.parent.mkdir(parents=True)
            implementation.write_text(
                "#!/usr/bin/env bash\nset -euo pipefail\nprintf '%s\\n' \"$*\" >> "
                f"{shlex.quote(str(invocation_log))}\n",
                encoding="utf-8",
            )
            implementation.chmod(0o700)
            supervisor = temporary_path / "run-scan-supervisor"
            supervisor.write_text(
                SUPERVISOR.read_text(encoding="utf-8").replace(
                    "readonly SCAN_IMPLEMENTATION=/usr/local/lib/shore-sentinel/run-scan-impl",
                    f"readonly SCAN_IMPLEMENTATION={shlex.quote(str(implementation))}",
                ).replace(
                    "readonly REQUEST_ROOT=/var/lib/shore-sentinel/requests",
                    f"readonly REQUEST_ROOT={shlex.quote(str(request_root))}",
                ).replace(
                    "readonly STATE_ROOT=/var/lib/shore-sentinel/runner-state",
                    f"readonly STATE_ROOT={shlex.quote(str(state_root))}",
                ),
                encoding="utf-8",
            )
            supervisor.chmod(0o700)
            process = subprocess.Popen(
                ["bash", str(supervisor), "--request", str(request_path)],
                preexec_fn=os.setsid,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
            )
            try:
                stat = Path(f"/proc/{process.pid}/stat").read_text(encoding="utf-8")
                identity_fields = stat[stat.rfind(")") + 2 :].split()
                self.assertEqual(identity_fields[2], str(process.pid))
                self.assertEqual(identity_fields[3], str(process.pid))
                state_path.write_text(
                    f"{process.pid} {identity_fields[19]} {process.pid} {process.pid} 1\n",
                    encoding="utf-8",
                )
                stdout, stderr = process.communicate(timeout=2)
            finally:
                if process.poll() is None:
                    process.kill()
                    process.wait()

            self.assertEqual(process.returncode, 64)
            self.assertEqual(stdout, "")
            self.assertEqual(stderr, "")
            self.assertFalse(
                invocation_log.exists(),
                "an expired matching startup state must not invoke the fixed implementation",
            )

    def test_runner_startup_identity_failure_reaps_unreleased_supervisor_without_scanning(self):
        with tempfile.TemporaryDirectory() as temporary_directory:
            temporary_path = Path(temporary_directory)
            request_root = temporary_path / "requests"
            state_root = temporary_path / "runner-state"
            implementation = temporary_path / "run-scan-impl"
            supervisor = temporary_path / "run-scan-supervisor"
            invocation_log = temporary_path / "implementation-invocations"
            source = RUNNER.read_text(encoding="utf-8")
            source = source.replace(
                "REQUEST_ROOT=/var/lib/shore-sentinel/requests",
                f"REQUEST_ROOT={shlex.quote(str(request_root))}",
            ).replace(
                "STATE_ROOT=/var/lib/shore-sentinel/runner-state",
                f"STATE_ROOT={shlex.quote(str(state_root))}",
            ).replace(
                "SCAN_IMPLEMENTATION=/usr/local/lib/shore-sentinel/run-scan-impl",
                f"SCAN_IMPLEMENTATION={shlex.quote(str(implementation))}",
            ).replace(
                "SCAN_SUPERVISOR=/usr/local/lib/shore-sentinel/run-scan-supervisor",
                f"SCAN_SUPERVISOR={shlex.quote(str(supervisor))}",
            ).replace(
                'require_root() {\n  [[ "$(id -u)" == "0" ]] || reject\n}',
                "require_root() {\n  :\n}",
            ).replace(
                "\n[[ $# -eq 2 ]] || reject\n",
                "\nread_process_identity() { sleep 0.001; return 1; }\n\n[[ $# -eq 2 ]] || reject\n",
            )
            runner = temporary_path / "run-scan"
            runner.write_text(source, encoding="utf-8")
            runner.chmod(0o700)
            supervisor.write_text(
                SUPERVISOR.read_text(encoding="utf-8").replace(
                    "readonly SCAN_IMPLEMENTATION=/usr/local/lib/shore-sentinel/run-scan-impl",
                    f"readonly SCAN_IMPLEMENTATION={shlex.quote(str(implementation))}",
                ).replace(
                    "readonly REQUEST_ROOT=/var/lib/shore-sentinel/requests",
                    f"readonly REQUEST_ROOT={shlex.quote(str(request_root))}",
                ).replace(
                    "readonly STATE_ROOT=/var/lib/shore-sentinel/runner-state",
                    f"readonly STATE_ROOT={shlex.quote(str(state_root))}",
                ),
                encoding="utf-8",
            )
            supervisor.chmod(0o700)
            implementation.write_text(
                "#!/usr/bin/env bash\nset -euo pipefail\nprintf 'started\\n' >> "
                f"{shlex.quote(str(invocation_log))}\n",
                encoding="utf-8",
            )
            implementation.chmod(0o700)
            state_root.mkdir()
            request_path = request_root / self.REQUEST_ID / "request.json"
            request_path.parent.mkdir(parents=True)
            request_path.write_text("{}\n", encoding="utf-8")

            completed = subprocess.run(
                ["bash", str(runner), "--request", self.REQUEST_ID],
                check=False,
                capture_output=True,
                text=True,
                timeout=3,
            )
            state_directory = state_root / self.REQUEST_ID

            self.assertEqual(completed.returncode, 70)
            self.assertEqual(completed.stdout, "CLEANUP_FAILED\n")
            self.assertEqual(completed.stderr, "")
            self.assertFalse(invocation_log.exists(), "unobserved startup must never reach implementation")
            self.assertEqual((state_directory / "status").read_text(encoding="utf-8"), "CLEANUP_FAILED\n")
            self.assertFalse((state_directory / "state").exists())

    def test_duplicate_and_unknown_cancellation_remain_idempotent(self):
        runner_prefix = RUNNER.read_text(encoding="utf-8").split(
            "\n[[ $# -eq 2 ]] || reject\n", 1
        )[0]
        with tempfile.TemporaryDirectory() as temporary_directory:
            temporary_path = Path(temporary_directory)
            state_root = temporary_path / "runner-state"
            harness = temporary_path / "idempotent-cancellation-harness"
            harness.write_text(
                f"""{runner_prefix}
STATE_ROOT={shlex.quote(str(state_root))}
running_checks=0
process_identity_matches() {{ return 0; }}
process_group_running() {{
  running_checks=$((running_checks + 1))
  (( running_checks == 1 ))
}}
kill() {{ return 0; }}
mkdir -p "$STATE_ROOT/{self.REQUEST_ID}"
printf '%s\\n' '4242 999 4242 4242 9999999999' > "$STATE_ROOT/{self.REQUEST_ID}/state"
cancel_request '{self.REQUEST_ID}'
cancel_request '{self.REQUEST_ID}'
cancel_request '223e4567-e89b-12d3-a456-426614174000'
""",
                encoding="utf-8",
            )
            completed = subprocess.run(
                ["bash", str(harness)],
                check=False,
                capture_output=True,
                text=True,
                timeout=2,
            )

        self.assertEqual(completed.returncode, 0)
        self.assertEqual(completed.stdout, "CANCELLED\nNOT_RUNNING\nNOT_RUNNING\n")
        self.assertEqual(completed.stderr, "")

    def test_cancel_does_not_signal_mismatched_lifetime_identity_or_expired_state(self):
        runner_prefix = RUNNER.read_text(encoding="utf-8").split(
            "\n[[ $# -eq 2 ]] || reject\n", 1
        )[0]
        cases = (
            ("start-tick", "1000 4242 4242", "9999999999"),
            ("process-group", "999 9999 4242", "9999999999"),
            ("session", "999 4242 9999", "9999999999"),
            ("expired", "999 4242 4242", "999"),
        )
        for label, observed_identity, deadline in cases:
            with self.subTest(label=label), tempfile.TemporaryDirectory() as temporary_directory:
                temporary_path = Path(temporary_directory)
                state_root = temporary_path / "runner-state"
                signal_log = temporary_path / "signals"
                harness = temporary_path / "lifetime-mismatch-harness"
                harness.write_text(
                    f"""{runner_prefix}
STATE_ROOT={shlex.quote(str(state_root))}
MAX_GRACE_SECONDS=0
MAX_KILL_WAIT_SECONDS=0
read_process_identity() {{ printf '%s\\n' '{observed_identity}'; }}
process_group_running() {{ return 0; }}
kill() {{ printf '%s\\n' \"$*\" >> {shlex.quote(str(signal_log))}; return 0; }}
date() {{ printf '%s\\n' 1000; }}
mkdir -p "$STATE_ROOT/{self.REQUEST_ID}"
printf '%s\\n' '4242 999 4242 4242 {deadline}' > "$STATE_ROOT/{self.REQUEST_ID}/state"
cancel_request '{self.REQUEST_ID}'
""",
                    encoding="utf-8",
                )
                completed = subprocess.run(
                    ["bash", str(harness)],
                    check=False,
                    capture_output=True,
                    text=True,
                    timeout=2,
                )
                signal_output = signal_log.read_text(encoding="utf-8") if signal_log.exists() else ""

                self.assertEqual(completed.returncode, 0)
                self.assertEqual(completed.stdout, "NOT_RUNNING\n")
                self.assertEqual(completed.stderr, "")
                self.assertEqual(signal_output, "", "untrusted lifetime state must not issue a numeric signal")
                self.assertEqual(
                    (state_root / self.REQUEST_ID / "status").read_text(encoding="utf-8"),
                    "STALE_AUTHORITY\n",
                )
    def test_runner_rejects_non_uuid_arguments_with_only_a_fixed_status(self):
        self.assertTrue(RUNNER.is_file(), "missing constrained remote runner asset")
        cases = (
            ("--request", "/etc/passwd"),
            ("--request", "/var/lib/shore-sentinel/requests/not-a-uuid/request.json"),
            ("--cancel-request", "not-a-uuid"),
            ("--stage-request", "not-a-uuid"),
            ("--signal", "TERM"),
            ("--request", "123e4567-e89b-12d3-a456-426614174000", "extra"),
        )
        for args in cases:
            with self.subTest(args=args):
                completed = subprocess.run(
                    ["bash", str(RUNNER), *args],
                    check=False,
                    capture_output=True,
                    text=True,
                    timeout=2,
                )
                self.assertEqual(completed.returncode, 64)
                self.assertEqual(completed.stdout, "REJECTED\n")
                self.assertEqual(completed.stderr, "")

    def test_runner_owns_only_uuid_scoped_supervisor_lifetime_state_and_hard_deadline_cleanup(self):
        self.assertTrue(RUNNER.is_file(), "missing constrained remote runner asset")
        source = RUNNER.read_text(encoding="utf-8")

        self.assertIn("STATE_ROOT=/var/lib/shore-sentinel/runner-state", source)
        self.assertIn("umask 077", source)
        self.assertIn("MAX_REQUEST_BYTES=8192", source)
        self.assertIn("--stage-request", source)
        self.assertIn("mktemp", source)
        self.assertIn("mv -T", source)
        self.assertIn("SCAN_SUPERVISOR=/usr/local/lib/shore-sentinel/run-scan-supervisor", source)
        self.assertIn('"/usr/bin/setsid" "$SCAN_SUPERVISOR" --request "$request_path"', source)
        self.assertNotIn('setsid "$SCAN_IMPLEMENTATION" --request "$request_path"', source)
        self.assertIn("read_process_identity", source)
        self.assertIn("process_identity_matches", source)
        self.assertIn("STALE_AUTHORITY", source)
        self.assertIn('wait "$pid" 2>/dev/null || true', source)
        self.assertIn("kill -TERM -- \"-$pgid\"", source)
        self.assertIn("kill -KILL -- \"-$pgid\"", source)
        self.assertIn("MAX_GRACE_SECONDS=8", source)
        self.assertIn("MAX_KILL_WAIT_SECONDS=2", source)
        self.assertIn("deadline_epoch", source)
        self.assertNotRegex(source, r"\beval\b|bash -c|sh -c")
        self.assertNotIn("--pid", source)
        self.assertNotIn("--path", source)
        self.assertNotIn("--signal", source)

    def test_install_contract_requires_root_owned_non_writable_runner_supervisor_and_fixed_scanner_implementation(self):
        self.assertTrue(INSTALL_CONTRACT.is_file(), "missing remote runner install contract")
        contract = INSTALL_CONTRACT.read_text(encoding="utf-8")

        self.assertIn("install -o root -g root -m 0750", contract)
        self.assertIn("/usr/local/lib/shore-sentinel/run-scan", contract)
        self.assertIn("/usr/local/lib/shore-sentinel/force-command-dispatch", contract)
        self.assertIn("ForceCommand /usr/local/lib/shore-sentinel/force-command-dispatch", contract)
        self.assertIn("SSH_ORIGINAL_COMMAND", contract)
        self.assertIn("--stage-request <canonical-uuid>", contract)
        self.assertIn("bounded stdin", contract)
        self.assertIn("root-owned atomic", contract)
        self.assertIn("NOSETENV", contract)
        self.assertIn("env_reset", contract)
        self.assertIn("/usr/local/lib/shore-sentinel/run-scan-impl", contract)
        self.assertIn("/usr/local/lib/shore-sentinel/run-scan-supervisor", contract)
        self.assertIn("/var/lib/shore-sentinel/runner-state", contract)
        self.assertIn("must not be writable by the SSH login account", contract)
        self.assertIn("TERM", contract)
        self.assertIn("KILL", contract)
        self.assertIn("10 seconds", contract)


if __name__ == "__main__":
    unittest.main()
