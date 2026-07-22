#!/usr/bin/env python3
from __future__ import annotations

import json
import subprocess
import tempfile
from pathlib import Path

from jsonschema import Draft202012Validator, FormatChecker

root = Path(__file__).resolve().parents[1]
bundle = root / "scanner-bundle"
scanner = bundle / "bin" / "Agent_Security_Selfcheck_v3.5.0.py"
output_schema_path = bundle / "schemas" / "scanner-output.schema.json"
manifest_schema_path = bundle / "schemas" / "scanner-manifest.schema.json"
manifest_path = bundle / "scanner-manifest.json"
sample_path = bundle / "examples" / "sample-output.json"
required = [
    scanner,
    bundle / "bin" / "Agent_Security_Selfcheck_v3.4.0.py",
    bundle / "bin" / "envdetect.py",
    bundle / "bin" / "hardware_collection.py",
    bundle / "tools" / "ARX_Agent_Security_Remediation.py",
    output_schema_path,
    manifest_schema_path,
    manifest_path,
    sample_path,
    bundle / "docs" / "agent-security-selfcheck.md",
    bundle / "docs" / "AGENT_SECURITY_SELFCHECK_VERSION_HISTORY.md",
]
missing = [str(p.relative_to(root)) for p in required if not p.exists()]
if missing:
    print("Scanner bundle validation failed: missing " + ", ".join(missing))
    raise SystemExit(1)


def load_json(path: Path) -> dict:
    with path.open(encoding="utf-8") as handle:
        value = json.load(handle)
    if not isinstance(value, dict):
        raise ValueError(f"{path} must contain an object")
    return value


try:
    output_schema = load_json(output_schema_path)
    manifest_schema = load_json(manifest_schema_path)
    manifest = load_json(manifest_path)
    sample = load_json(sample_path)
    Draft202012Validator(output_schema, format_checker=FormatChecker()).validate(sample)
    Draft202012Validator(manifest_schema).validate(manifest)
except Exception as exc:
    print(f"Scanner bundle validation failed: schema/sample validation: {exc}")
    raise SystemExit(1)


def assert_schema_rejects(candidate: dict, label: str) -> None:
    try:
        Draft202012Validator(output_schema, format_checker=FormatChecker()).validate(candidate)
    except Exception:
        return
    print(f"Scanner bundle validation failed: schema accepted invalid {label}")
    raise SystemExit(1)


missing_coverage = json.loads(json.dumps(sample))
missing_coverage.pop("coverage", None)
assert_schema_rejects(missing_coverage, "output without coverage")
missing_decision = json.loads(json.dumps(sample))
missing_decision.pop("decision", None)
assert_schema_rejects(missing_decision, "output without decision")
missing_id = json.loads(json.dumps(sample))
missing_id["findings"][0].pop("id", None)
assert_schema_rejects(missing_id, "finding without stable ID")
invalid_timestamp = json.loads(json.dumps(sample))
invalid_timestamp["collectedAt"] = "2026-06-19 00:00:00+00:00"
assert_schema_rejects(invalid_timestamp, "non-RFC3339 timestamp")
negative_exit = json.loads(json.dumps(sample))
negative_exit["decision"]["exit_code"] = -1
assert_schema_rejects(negative_exit, "negative decision exit code")
invalid_scope = json.loads(json.dumps(sample))
invalid_scope["findings"][0]["scope"] = "made_up_scope"
assert_schema_rejects(invalid_scope, "invalid finding scope")
invalid_evidence = json.loads(json.dumps(sample))
invalid_evidence["findings"][0]["evidence"] = ["scalar evidence"]
assert_schema_rejects(invalid_evidence, "scalar evidence")

if manifest.get("entrypoint") != "bin/Agent_Security_Selfcheck_v3.5.0.py":
    print("Scanner bundle validation failed: manifest entrypoint is not v3.5.0")
    raise SystemExit(1)
if manifest.get("outputSchema") != "shore-sentinel.scanner-output/v1":
    print("Scanner bundle validation failed: manifest output schema mismatch")
    raise SystemExit(1)

help_run = subprocess.run(
    ["python3", str(scanner), "--help"],
    cwd=bundle,
    text=True,
    stdout=subprocess.PIPE,
    stderr=subprocess.PIPE,
    timeout=30,
)
if help_run.returncode != 0 or "--target" not in help_run.stdout or "--scope-mode" not in help_run.stdout:
    print("Scanner bundle validation failed: scanner help output is invalid")
    print(help_run.stdout)
    print(help_run.stderr)
    raise SystemExit(1)

with tempfile.TemporaryDirectory(prefix="shore-scanner-validate-") as tmp:
    out_dir = Path(tmp) / "reports"
    run = subprocess.run(
        [
            "python3",
            str(scanner),
            "--target",
            str(root),
            "--scope-mode",
            "exact",
            "--out-dir",
            str(out_dir),
            "--exit-zero",
        ],
        cwd=bundle,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        timeout=180,
    )
    if run.returncode != 0:
        print("Scanner bundle validation failed: scanner execution failed")
        print(run.stdout)
        print(run.stderr)
        raise SystemExit(1)
    raw_report = next((p for p in out_dir.glob("*.json") if p.name != "sample-output.json"), None)
    if raw_report is None:
        print("Scanner bundle validation failed: missing JSON report")
        raise SystemExit(1)
    raw = load_json(raw_report)
    try:
        Draft202012Validator(output_schema, format_checker=FormatChecker()).validate(raw)
    except Exception as exc:
        print(f"Scanner bundle validation failed: generated JSON does not match schema: {exc}")
        raise SystemExit(1)
    if raw.get("scanner", {}).get("version") != "3.5.0":
        print("Scanner bundle validation failed: generated report version mismatch")
        raise SystemExit(1)
    if raw.get("coverage", {}).get("scan_complete") is not True:
        print("Scanner bundle validation failed: self-scan coverage incomplete")
        raise SystemExit(1)
    if not raw.get("decision", {}).get("status"):
        print("Scanner bundle validation failed: missing decision status")
        raise SystemExit(1)
    for finding in raw.get("findings", []):
        if not finding.get("id") or finding.get("id", "").startswith("finding-") is False:
            print("Scanner bundle validation failed: finding missing deterministic ID")
            raise SystemExit(1)
    serialized_findings = json.dumps(raw.get("findings", []), sort_keys=True)
    if "Agent_Security_Selfcheck_v3.5.0.py" in serialized_findings:
        print("Scanner bundle validation failed: scanner self-reference found in findings")
        raise SystemExit(1)
    reports = sorted(out_dir.glob("*"))
    suffixes = {p.suffix for p in reports}
    expected = {".json", ".md", ".sarif", ".pdf"}
    if not expected.issubset(suffixes):
        print("Scanner bundle validation failed: missing report formats; saw " + ", ".join(sorted(suffixes)))
        raise SystemExit(1)
    sarif_path = next(p for p in reports if p.suffix == ".sarif")
    sarif = load_json(sarif_path)
    if sarif.get("version") != "2.1.0" or not sarif.get("runs"):
        print("Scanner bundle validation failed: invalid SARIF structure")
        raise SystemExit(1)
    for artifact in reports:
        if artifact.suffix in {".json", ".md", ".sarif"}:
            body = artifact.read_text(encoding="utf-8", errors="ignore")
            if "sk-abcdefghijklmnopqrstuvwxyz" in body:
                print("Scanner bundle validation failed: test secret value leaked")
                raise SystemExit(1)

print("Scanner bundle validation passed")
