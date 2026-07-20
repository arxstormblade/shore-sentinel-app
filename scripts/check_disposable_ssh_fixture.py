#!/usr/bin/env python3
"""Check-only validator for the disposable SSH fixture declaration; never runs a fixture."""

import argparse
import json
from pathlib import Path
from typing import Any


REPOSITORY_ROOT = Path(__file__).resolve().parents[1]
FORCE_COMMAND_ADAPTER = REPOSITORY_ROOT / "infra" / "ssh-fixture" / "force-command-dispatch"
SUDOERS_ASSET = REPOSITORY_ROOT / "infra" / "ssh-fixture" / "shore-sentinel-scanner-runner.sudoers"
RUNNER_ASSET = REPOSITORY_ROOT / "infra" / "remote-runner" / "run-scan"
SUPERVISOR_ASSET = REPOSITORY_ROOT / "infra" / "remote-runner" / "run-scan-supervisor"
FORCE_COMMAND_PATH = "/usr/local/lib/shore-sentinel/force-command-dispatch"
RUNNER_PATH = "/usr/local/lib/shore-sentinel/run-scan"
SUDOERS_ARGUMENTS = (
    "^(--request|--cancel-request|--stage-request) "
    "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-"
    "[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$"
)


REQUIRED_TESTS = {
    "allowed-scope",
    "disallowed-scope",
    "symlink-rejection",
    "cancel-term-kill-deadline",
    "duplicate-cancel",
    "client-disconnect",
    "host-key-mismatch",
    "cleanup",
}
EXPECTED_OWNERSHIP = {
    "force_command_adapter": "root:root:0755",
    "runner": "root:root:0750",
    "supervisor": "root:root:0750",
    "implementation": "root:root:0750",
    "runner_state": "root:root:0700",
    "request_root": "root:root:0700",
}
EXPECTED_STAGE_INPUT = {
    "maximum_bytes": 8192,
    "maximum_seconds": 5,
    "timeout_status": "REJECTED",
    "timeout_cleanup": "remove-partial-request-state",
}
EXPECTED_PRIVILEGE_ADAPTER = {
    "sudoers_file": "/etc/sudoers.d/shore-sentinel-scanner-runner",
    "sudoers_ownership": "root:root:0440",
    "environment_reset": "required",
    "setenv": "forbidden",
    "adapter": FORCE_COMMAND_PATH,
    "adapter_ownership": "root:root:0755",
    "sudo_binary": "/usr/bin/sudo",
    "exact_command": RUNNER_PATH,
    "sudoers_asset": "infra/ssh-fixture/shore-sentinel-scanner-runner.sudoers",
    "sudoers_arguments": SUDOERS_ARGUMENTS,
}
EXPECTED_PROTECTED_PARENTS = {
    "/etc": "root:root:0755:directory:not-symlink:non-scanner-writable",
    "/etc/sudoers.d": "root:root:0750:directory:not-symlink:non-scanner-writable",
    "/usr": "root:root:0755:directory:not-symlink:non-scanner-writable",
    "/usr/local": "root:root:0755:directory:not-symlink:non-scanner-writable",
    "/usr/local/lib": "root:root:0755:directory:not-symlink:non-scanner-writable",
    "/usr/local/lib/shore-sentinel": "root:root:0755:directory:not-symlink:non-scanner-writable",
    "/var": "root:root:0755:directory:not-symlink:non-scanner-writable",
    "/var/lib": "root:root:0755:directory:not-symlink:non-scanner-writable",
    "/var/lib/shore-sentinel": "root:root:0755:directory:not-symlink:non-scanner-writable",
}


def reject(message: str) -> None:
    print(f"REJECTED: {message}")
    raise SystemExit(64)


def require_object(value: Any, keys: set[str], label: str) -> dict[str, Any]:
    if not isinstance(value, dict) or set(value) != keys:
        reject(f"invalid {label} shape")
    return value


def require_string_list(value: Any, label: str) -> set[str]:
    if not isinstance(value, list) or not all(isinstance(item, str) for item in value):
        reject(f"invalid {label}")
    return set(value)


def validate_force_command_assets() -> None:
    try:
        adapter = FORCE_COMMAND_ADAPTER.read_text(encoding="utf-8")
        sudoers = SUDOERS_ASSET.read_text(encoding="utf-8")
        runner = RUNNER_ASSET.read_text(encoding="utf-8")
        supervisor = SUPERVISOR_ASSET.read_text(encoding="utf-8")
    except OSError:
        reject("missing ForceCommand adapter asset")
    required_adapter_fragments = (
        "SSH_ORIGINAL_COMMAND",
        "[[ $# -eq 0 ]] || reject",
        f"readonly RUNNER={RUNNER_PATH}",
        'exec /usr/bin/sudo -n "$RUNNER" --request "$request_id"',
        'exec /usr/bin/sudo -n "$RUNNER" --cancel-request "$request_id"',
        'exec /usr/bin/sudo -n "$RUNNER" --stage-request "$request_id"',
    )
    if any(fragment not in adapter for fragment in required_adapter_fragments):
        reject("unsafe ForceCommand adapter")
    if any(token in adapter for token in ("eval", "sh -c", "bash -c", "$@")):
        reject("unsafe ForceCommand adapter primitive")
    required_sudoers_fragments = (
        "Defaults:scanner env_reset",
        "NOSETENV: NOPASSWD:",
        RUNNER_PATH,
        SUDOERS_ARGUMENTS,
    )
    if any(fragment not in sudoers for fragment in required_sudoers_fragments):
        reject("unsafe scanner sudoers rule")
    if "*" in sudoers or " SETENV:" in sudoers:
        reject("unsafe scanner sudoers rule")
    required_runner_fragments = (
        "MAX_REQUEST_BYTES=8192",
        "MAX_STAGE_STDIN_SECONDS=5",
        '"/usr/bin/timeout" --foreground "$MAX_STAGE_STDIN_SECONDS" '
        '"/usr/bin/head" -c "$((MAX_REQUEST_BYTES + 1))" > "$temporary_path" '
        '|| { rm -f -- "$temporary_path"; rmdir -- "$request_directory" 2>/dev/null || true; reject; }',
    )
    if any(fragment not in runner for fragment in required_runner_fragments):
        reject("unsafe root runner stdin boundary")
    required_supervisor_fragments = (
        "readonly SCAN_IMPLEMENTATION=/usr/local/lib/shore-sentinel/run-scan-impl",
        "readonly STATE_ROOT=/var/lib/shore-sentinel/runner-state",
        "MAX_STARTUP_WAIT_SECONDS=1",
        "state_authorizes_self",
        '"$SCAN_IMPLEMENTATION" --request "$2" &',
    )
    if any(fragment not in supervisor for fragment in required_supervisor_fragments):
        reject("unsafe root supervisor boundary")
    if any(token in supervisor for token in ("eval", "sh -c", "bash -c", "$@")):
        reject("unsafe root supervisor primitive")


def load_and_validate(spec_path: Path) -> None:
    try:
        raw = json.loads(spec_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        reject("unable to read fixture JSON")
    expected_top = {
        "version",
        "execution",
        "host_key",
        "account",
        "privilege_adapter",
        "ownership",
        "stage_input",
        "protected_parent_directories",
        "scan_implementations",
        "test_cases",
        "cleanup",
    }
    spec = require_object(raw, expected_top, "fixture")
    if spec["version"] != 1 or spec["execution"] != "external-approved-only":
        reject("fixture execution must be external-approved-only")

    host_key = require_object(
        spec["host_key"],
        {"verification", "required_fingerprint_pattern", "known_hosts", "forbidden_modes"},
        "host_key",
    )
    if host_key["verification"] != "fixed-sha256-fingerprint-no-tofu":
        reject("host key must use a fixed fingerprint without TOFU")
    if host_key["required_fingerprint_pattern"] != "SHA256:<43-unpadded-base64-characters>":
        reject("invalid host key fingerprint contract")
    if host_key["known_hosts"] != "dedicated-ephemeral-file":
        reject("known_hosts must be dedicated and ephemeral")
    if require_string_list(host_key["forbidden_modes"], "forbidden_modes") != {"accept-new", "off", "ask"}:
        reject("unsafe host key modes")

    account = require_object(
        spec["account"],
        {"name", "root_group_membership", "force_command", "interactive_shell", "port_forwarding", "agent_forwarding", "x11_forwarding"},
        "account",
    )
    expected_account = {
        "name": "scanner",
        "root_group_membership": "forbidden",
        "force_command": FORCE_COMMAND_PATH,
        "interactive_shell": "disabled",
        "port_forwarding": "disabled",
        "agent_forwarding": "disabled",
        "x11_forwarding": "disabled",
    }
    if account != expected_account:
        reject("unsafe account restriction")
    if require_object(spec["privilege_adapter"], set(EXPECTED_PRIVILEGE_ADAPTER), "privilege_adapter") != EXPECTED_PRIVILEGE_ADAPTER:
        reject("unsafe privilege adapter")
    if require_object(spec["ownership"], set(EXPECTED_OWNERSHIP), "ownership") != EXPECTED_OWNERSHIP:
        reject("unsafe runner or request ownership")
    if require_object(spec["stage_input"], set(EXPECTED_STAGE_INPUT), "stage_input") != EXPECTED_STAGE_INPUT:
        reject("unsafe staged stdin boundary")
    if (
        require_object(
            spec["protected_parent_directories"], set(EXPECTED_PROTECTED_PARENTS), "protected_parent_directories"
        )
        != EXPECTED_PROTECTED_PARENTS
    ):
        reject("unsafe protected parent directory")
    if require_string_list(spec["scan_implementations"], "scan_implementations") != {"allowed-scope", "term-resistant-child"}:
        reject("invalid controlled scan implementations")
    if require_string_list(spec["test_cases"], "test_cases") != REQUIRED_TESTS:
        reject("incomplete fixture test matrix")
    required_cleanup = {
        "remove-disposable-fixture",
        "revoke-fixture-key",
        "erase-ephemeral-known-hosts",
        "record-terminal-statuses",
    }
    if require_string_list(spec["cleanup"], "cleanup") != required_cleanup:
        reject("incomplete fixture cleanup")
    validate_force_command_assets()


def main() -> None:
    parser = argparse.ArgumentParser(description="check-only disposable SSH fixture contract validator")
    parser.add_argument("--spec", required=True, type=Path, help="local fixture contract JSON")
    args = parser.parse_args()
    load_and_validate(args.spec)
    print("CHECK OK: check-only; no SSH fixture was started or contacted")


if __name__ == "__main__":
    main()
