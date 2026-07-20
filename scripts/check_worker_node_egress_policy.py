#!/usr/bin/env python3
"""Validate and optionally render a worker egress intent plan; never applies rules."""

import argparse
import ipaddress
import json
import sys
import uuid
from pathlib import Path
from typing import Any


EXPECTED_IDENTITY = {
    "compose_project": "shore-sentinel",
    "compose_service": "worker-node",
    "egress_network": "worker-egress",
}
TOP_LEVEL_KEYS = {
    "version",
    "source",
    "worker_identity",
    "target_authorizations",
    "optional_resolvers",
    "optional_https",
}
UNVERIFIED_INPUT_SOURCE = "unverified-local-schema-input"


def reject(message: str) -> None:
    print(f"REJECTED: {message}")
    raise SystemExit(64)


def require_exact_keys(value: Any, expected: set[str], label: str) -> dict[str, Any]:
    if not isinstance(value, dict) or set(value) != expected:
        reject(f"invalid {label} shape")
    return value


def require_uuid(value: Any, label: str) -> str:
    if not isinstance(value, str):
        reject(f"invalid {label}")
    try:
        parsed = uuid.UUID(value)
    except ValueError:
        reject(f"invalid {label}")
    if str(parsed) != value.lower():
        reject(f"invalid {label}")
    return value


def require_network(value: Any, label: str, host_only: bool = False) -> str:
    if not isinstance(value, str):
        reject(f"invalid {label}")
    try:
        network = ipaddress.ip_network(value, strict=True)
    except ValueError:
        reject(f"invalid {label}")
    if network.version != 4:
        reject(f"IPv6 {label} is not permitted")
    if network.prefixlen < 24:
        reject(f"broad {label}")
    if host_only and network.prefixlen != 32:
        reject(f"non-host {label}")
    return str(network)


def require_port(value: Any, allowed: set[int] | None = None) -> int:
    if not isinstance(value, int) or isinstance(value, bool) or not 1 <= value <= 65535:
        reject("invalid port")
    if allowed is not None and value not in allowed:
        reject("unapproved port")
    return value


def validate_targets(value: Any) -> list[dict[str, Any]]:
    if not isinstance(value, list):
        reject("invalid target_authorizations")
    normalized: list[dict[str, Any]] = []
    seen: set[tuple[str, str, int]] = set()
    for item in value:
        record = require_exact_keys(item, {"enrollment_id", "cidr", "protocol", "port"}, "target authorization")
        enrollment_id = require_uuid(record["enrollment_id"], "enrollment_id")
        cidr = require_network(record["cidr"], "target cidr")
        if record["protocol"] != "tcp":
            reject("target protocol must be tcp")
        port = require_port(record["port"])
        key = (enrollment_id, cidr, port)
        if key in seen:
            reject("duplicate target authorization")
        seen.add(key)
        normalized.append({"enrollment_id": enrollment_id, "cidr": cidr, "protocol": "tcp", "port": port})
    return sorted(normalized, key=lambda item: (item["cidr"], item["port"], item["enrollment_id"]))


def validate_optional_hosts(
    value: Any, label: str, port: int, protocols: set[str], reason: str | None = None
) -> list[dict[str, Any]]:
    if not isinstance(value, list):
        reject(f"invalid {label}")
    expected = {"source_record_id", "cidr", "protocol", "port"}
    if reason is not None:
        expected.add("reason")
    normalized: list[dict[str, Any]] = []
    seen: set[str] = set()
    for item in value:
        record = require_exact_keys(item, expected, label)
        record_id = require_uuid(record["source_record_id"], f"{label} source_record_id")
        cidr = require_network(record["cidr"], f"{label} cidr", host_only=True)
        if record["protocol"] not in protocols or require_port(record["port"], {port}) != port:
            reject(f"invalid {label} transport")
        if reason is not None and record["reason"] != reason:
            reject(f"invalid {label} reason")
        key = f"{record_id}:{cidr}"
        if key in seen:
            reject(f"duplicate {label} entry")
        seen.add(key)
        normalized.append(
            {
                "source_record_id": record_id,
                "cidr": cidr,
                "protocol": record["protocol"],
                "port": port,
                **({"reason": reason} if reason is not None else {}),
            }
        )
    return sorted(normalized, key=lambda item: (item["cidr"], item["source_record_id"]))


def load_and_validate(policy_path: Path) -> dict[str, Any]:
    try:
        raw = json.loads(policy_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        reject("unable to read policy JSON")
    policy = require_exact_keys(raw, TOP_LEVEL_KEYS, "policy")
    if policy["version"] != 1:
        reject("unsupported policy version")
    if policy["source"] != UNVERIFIED_INPUT_SOURCE:
        reject("policy source must be unverified-local-schema-input")
    if policy["worker_identity"] != EXPECTED_IDENTITY:
        reject("worker identity is not the exact worker-node identity")
    return {
        "worker_identity": EXPECTED_IDENTITY,
        "default": "deny",
        "target_authorizations": validate_targets(policy["target_authorizations"]),
        "optional_resolvers": validate_optional_hosts(
            policy["optional_resolvers"], "optional_resolvers", 53, {"tcp", "udp"}
        ),
        "optional_https": validate_optional_hosts(
            policy["optional_https"], "optional_https", 443, {"tcp"}, "server-authoritative-artifact-fetch"
        ),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="check-only worker egress policy validator")
    parser.add_argument("--policy", required=True, type=Path, help="local JSON policy to validate")
    parser.add_argument("--render", action="store_true", help="print intent JSON; never apply firewall rules")
    args = parser.parse_args()
    plan = load_and_validate(args.policy)
    print("CHECK OK: UNVERIFIED LOCAL SCHEMA INPUT; check-only; no firewall rules were applied")
    if args.render:
        print(json.dumps(plan, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
