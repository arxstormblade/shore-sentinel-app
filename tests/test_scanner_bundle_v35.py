from __future__ import annotations

import importlib.util
import json
import re
import subprocess
import sys
import textwrap
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCANNER = ROOT / "scanner-bundle" / "bin" / "Agent_Security_Selfcheck_v3.5.0.py"


def load_scanner():
    spec = importlib.util.spec_from_file_location("scanner_v35", SCANNER)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    sys.path.insert(0, str(SCANNER.parent))
    try:
        spec.loader.exec_module(module)
    finally:
        sys.path.pop(0)
        sys.modules.pop(spec.name, None)
    return module


def test_sanitize_hardware_preserves_summary_values_and_adapter_names_without_identity():
    scanner = load_scanner()
    raw = {
        "cpu_logical_cores": 8,
        "memory_used": "1.2 GB",
        "memory_total": "3.8 GB",
        "memory_percent": 31.6,
        "disk_used": "12.4 GB",
        "disk_total": "76.4 GB",
        "disk_percent": 16.2,
        "network_adapters": [
            {"name": "eth0", "ip": "192.0.2.10", "mac": "00:11:22:33:44:55"},
            {"name": "wlan0", "ip": "198.51.100.7", "mac": "aa:bb:cc:dd:ee:ff"},
        ],
        "errors": [],
    }

    sanitized = scanner.sanitize_hardware(raw)

    assert sanitized["memory_used"] == "1.2 GB"
    assert sanitized["memory_total"] == "3.8 GB"
    assert sanitized["memory_percent"] == 31.6
    assert sanitized["disk_used"] == "12.4 GB"
    assert sanitized["disk_total"] == "76.4 GB"
    assert sanitized["disk_percent"] == 16.2
    assert sanitized["network_adapter_count"] == 2
    assert sanitized["network_adapters"] == [{"name": "eth0"}, {"name": "wlan0"}]
    assert "192.0.2.10" not in json.dumps(sanitized)
    assert "00:11:22:33:44:55" not in json.dumps(sanitized)
    assert all(set(adapter) == {"name"} for adapter in sanitized["network_adapters"])


def test_generated_pdf_wraps_long_hardware_error_without_horizontal_overflow(tmp_path):
    scanner = load_scanner()
    pdf_path = tmp_path / "hardware-summary.pdf"
    long_error = "hardware collection failed " + " ".join(f"detail-{index}" for index in range(80)) + " " + ("unbroken-evidence-token" * 12)
    meta = {
        "target_root": "/tmp/target",
        "generated_utc": "2026-07-23T00:00:00+00:00",
        "script_sha256": "0" * 64,
        "environment_label": "bare-metal",
        "hardware_summary": {
            "cpu_logical_cores": 8,
            "memory_used": "1.2 GB",
            "memory_total": "3.8 GB",
            "disk_used": "12.4 GB",
            "disk_total": "76.4 GB",
            "network_adapters": [{"name": "eth0"}],
            "errors": [long_error],
        },
        "methodology_tools_used": [],
        "frameworks_used": [],
        "runtime_security_best_practices": [],
    }
    result = {
        "score": {"overall_score": 100, "grade": "A", "categories": {}},
        "findings": [],
        "executive_summary": [],
    }

    scanner.write_simple_pdf(pdf_path, meta, result)
    pdf = pdf_path.read_bytes().decode("latin-1")

    assert pdf.startswith("%PDF-1.4")
    value_ops = re.findall(r"BT /F1 8 Tf 170\.0 ([0-9.-]+) Td \((.*?)\) Tj ET", pdf)
    error_value_ops = [
        (float(y), text)
        for y, text in value_ops
        if "hardware" in text or "detail-" in text or "unbroken" in text
    ]
    assert len(error_value_ops) > 2
    assert max(len(text) for _, text in error_value_ops) <= 52
    assert "detail-79" in pdf
    assert "unbroken-evidence-token" in pdf

    category_line = next(line for line in pdf.splitlines() if "(Category Scorecards)" in line)
    category_y = float(category_line.split()[5])
    assert category_y == min(y for y, _ in error_value_ops) - 26


def test_generated_pdf_accounts_for_unbroken_finding_wrapping_in_card_height(tmp_path):
    scanner = load_scanner()
    pdf_path = tmp_path / "finding-wrap.pdf"
    evidence = "unbroken-evidence-token" * 12
    meta = {
        "target_root": "/tmp/target",
        "generated_utc": "2026-07-23T00:00:00+00:00",
        "script_sha256": "0" * 64,
        "environment_label": "bare-metal",
        "hardware_summary": {},
        "methodology_tools_used": [],
        "frameworks_used": [],
        "runtime_security_best_practices": [],
    }
    finding = {
        "category": "Secrets",
        "check": "Evidence review",
        "status": "WARN",
        "risk": "High",
        "evidence": evidence,
        "recommendation": "Review the evidence and rotate affected material.",
        "remediation_task": {"file_path": "config.toml", "instruction": "Remove the exposed value."},
    }
    result = {
        "score": {"overall_score": 80, "grade": "B", "categories": {}},
        "findings": [finding],
        "executive_summary": [],
    }

    scanner.write_simple_pdf(pdf_path, meta, result)
    pdf = pdf_path.read_bytes().decode("latin-1")
    evidence_lines = min(4, max(1, len(textwrap.wrap(evidence, width=86, break_long_words=True, replace_whitespace=True))))
    expected_card_height = 86 + 12 + evidence_lines * 10 + 10 + 10
    assert f"528.0 {expected_card_height:.1f} re B" in pdf
    assert pdf.count("unbroken-evidence-token") >= 8


def run_report(target: Path, output: Path, scope_mode: str = "exact", compose_files: list[str] | None = None, expect_clean: bool = True) -> dict:
    compose_args = [arg for compose_file in (compose_files or []) for arg in ("--compose-file", compose_file)]
    result = subprocess.run(
        ["python3", str(SCANNER), "--target", str(target), "--scope-mode", scope_mode, *compose_args, "--out-dir", str(output), "--exit-zero"],
        cwd=ROOT,
        text=True,
        capture_output=True,
        check=False,
    )
    if expect_clean:
        assert result.returncode == 0, result.stderr
    report = next(output.glob("*.json"))
    return json.loads(report.read_text(encoding="utf-8"))


def test_v35_entrypoint_exists_and_emits_contract_valid_output(tmp_path):
    target = tmp_path / "target"
    target.mkdir()
    (target / "README.md").write_text("terminal is a business POS term\n", encoding="utf-8")
    data = run_report(target, tmp_path / "reports")
    assert data["contractVersion"] == "shore-sentinel.scanner-output/v1"
    assert data["scanner"]["version"] == "3.5.0"
    assert data["target"]["assetId"]
    assert data["target"]["hostname"] == "unknown"
    assert "coverage" in data
    assert "decision" in data
    assert all(isinstance(item["id"], str) and item["id"] for item in data["findings"])


def test_host_collectors_are_not_labeled_as_target_source(tmp_path):
    target = tmp_path / "target"
    target.mkdir()
    exact = run_report(target, tmp_path / "exact-reports")
    assert not any(item["category"] in {"Runtime Environment", "System Resources"} for item in exact["findings"])
    data = run_report(target, tmp_path / "runtime-reports", scope_mode="runtime")
    host_findings = [item for item in data["findings"] if item["category"] in {"Runtime Environment", "System Resources"}]
    assert host_findings
    assert all(item["scope"] == "host_runtime" for item in host_findings)
    assert all(item["reachability"] == "host_observed" for item in host_findings)


def test_target_scope_does_not_expand_to_parent_git_root(tmp_path):
    scanner = load_scanner()
    parent = tmp_path / "parent"
    target = parent / "nested"
    target.mkdir(parents=True)
    (parent / ".git").mkdir()
    assert scanner.find_repo_root(target) == target


def test_secret_references_are_not_classified_as_literals():
    scanner = load_scanner()
    assert scanner.classify_secret_matches("OPENAI_API_KEY = env(OPENAI_API_KEY)\n", "config.toml") == []
    assert scanner.classify_secret_matches('api_key = "sk-abcdefghijklmnopqrstuvwxyz"\n', "config.toml")[0]["kind"] == "confirmed_literal"


def test_finding_ids_are_deterministic_and_scope_bound():
    scanner = load_scanner()
    first = scanner.stable_finding_id("secret-check", "target", "config.toml", 4, "confirmed_literal")
    second = scanner.stable_finding_id("secret-check", "target", "config.toml", 4, "confirmed_literal")
    other_scope = scanner.stable_finding_id("secret-check", "host", "config.toml", 4, "confirmed_literal")
    assert first == second
    assert first != other_scope


def test_incomplete_coverage_cannot_be_clean():
    scanner = load_scanner()
    decision = scanner.coverage_decision({"scan_complete": False, "security_relevant_incomplete": True})
    assert decision["status"] in {"ERROR", "FAIL"}
    assert decision["exit_code"] != 0
    assert load_scanner().coverage_decision({"scope_mode": "runtime", "scan_complete": True, "host_runtime_incomplete": True})["exit_code"] != 0


def test_security_relevant_large_file_is_read_full_and_recorded(tmp_path):
    target = tmp_path / "target"
    target.mkdir()
    (target / "application.py").write_text("# production source\n" + ("x" * 100_000), encoding="utf-8")
    output = tmp_path / "reports"
    result = subprocess.run(
        ["python3", str(SCANNER), "--target", str(target), "--scope-mode", "exact", "--out-dir", str(output), "--exit-zero"],
        cwd=ROOT,
        text=True,
        capture_output=True,
        check=False,
    )
    assert result.returncode == 0, result.stderr
    report = next(output.glob("*.json"))
    data = json.loads(report.read_text(encoding="utf-8"))
    assert data["coverage"]["security_relevant_incomplete"] is False
    assert any(item["path"].endswith("application.py") and item["read_full"] for item in data["coverage"]["limit_overrides"])
    assert data["decision"]["exit_code"] == 0


def test_example_socket_mount_is_not_active_target_exposure(tmp_path):
    target = tmp_path / "target"
    target.mkdir()
    (target / "docker-compose.update.example.yml").write_text("services:\n  app:\n    volumes:\n      - /var/run/docker.sock:/var/run/docker.sock\n", encoding="utf-8")
    data = run_report(target, tmp_path / "reports")
    finding = next(item for item in data["findings"] if item["check"] == "Docker socket exposure reviewed")
    assert finding["status"] == "PASS"
    assert finding["scope"] == "target_source"
    assert finding["reachability"] == "unknown"
    assert "state': 'example'" in finding["evidence"][0]["text"]


def test_active_compose_socket_mount_is_high_confidence_target_finding(tmp_path):
    target = tmp_path / "target"
    target.mkdir()
    (target / "docker-compose.yml").write_text("services:\n  app:\n    volumes:\n      - /var/run/docker.sock:/var/run/docker.sock\n", encoding="utf-8")
    data = run_report(target, tmp_path / "reports")
    finding = next(item for item in data["findings"] if item["check"] == "Docker socket exposure reviewed")
    assert finding["status"] == "WARN"
    assert finding["risk"] == "High"
    assert finding["scope"] == "target_source"
    assert finding["confidence"] == "high"


def test_explicitly_selected_development_compose_is_treated_as_active(tmp_path):
    target = tmp_path / "target"
    target.mkdir()
    compose = target / "docker-compose.dev.yml"
    compose.write_text("services:\n  app:\n    profiles: [dev]\n    volumes:\n      - /var/run/docker.sock:/var/run/docker.sock\n", encoding="utf-8")
    data = run_report(target, tmp_path / "reports", compose_files=[compose.name])
    finding = next(item for item in data["findings"] if item["check"] == "Docker socket exposure reviewed")
    assert finding["risk"] == "High"
    assert finding["scope"] == "target_source"
    assert "active_selected" in finding["evidence"][0]["text"]


def test_pos_terminal_wording_does_not_activate_framework_tool_detection(tmp_path):
    target = tmp_path / "target"
    target.mkdir()
    (target / "proxy.ts").write_text("const terminal = request.cookies.get('pos_terminal');\n", encoding="utf-8")
    data = run_report(target, tmp_path / "reports")
    assert not any(item["check"] == "Framework tool exposure reviewed" for item in data["findings"])
    assert not any(item["check"] == "Framework deployment posture reviewed" for item in data["findings"])


def test_real_secret_literal_is_actionable_but_environment_reference_is_not(tmp_path):
    target = tmp_path / "target"
    target.mkdir()
    (target / "config.toml").write_text(
        'openai_api_key = "env(OPENAI_API_KEY)"\nbackup_token = "sk-abcdefghijklmnopqrstuvwxyz"\n',
        encoding="utf-8",
    )
    data = run_report(target, tmp_path / "reports")
    finding = next(item for item in data["findings"] if item["check"] == "No obvious plaintext secrets in non-secret configs")
    assert finding["status"] == "WARN"
    assert finding["risk"] == "High"
    assert "sk-abcdefghijklmnopqrstuvwxyz" not in json.dumps(data)
    assert "env(OPENAI_API_KEY)" in finding["evidence"][0]["text"] or "literal_matches" in finding["evidence"][0]["text"]


def test_shell_secret_and_mixed_reference_line_are_scanned_without_reference_skip(tmp_path):
    target = tmp_path / "target"
    target.mkdir()
    (target / "deploy.sh").write_text('export API_KEY="env(API_KEY)"; BACKUP_TOKEN="literal-secret-value"\n', encoding="utf-8")
    scanner = load_scanner()
    matches = scanner.classify_secret_matches((target / "deploy.sh").read_text(), "deploy.sh")
    assert any(match["kind"] == "confirmed_literal" for match in matches)


def test_decode_and_config_parse_loss_make_coverage_incomplete(tmp_path):
    target = tmp_path / "target"
    target.mkdir()
    (target / "broken.py").write_bytes(b"print('ok')\xff\n")
    (target / "config.yaml").write_text("broken: [\n", encoding="utf-8")
    data = run_report(target, tmp_path / "reports", expect_clean=False)
    assert data["coverage"]["scan_complete"] is False
    assert data["decision"]["exit_code"] != 0
    assert data["coverage"]["decode_errors"]
    assert data["coverage"]["config_parse_errors"]


def test_low_confidence_findings_cannot_create_critical_correlation():
    scanner = load_scanner()
    findings = []
    scanner.add(findings, "Secrets & Privacy", "No obvious plaintext secrets in non-secret configs", "WARN", "High", 5, "lexical candidate", "review", confidence="low")
    scanner.add(findings, "Persistence & Deployment", "Deployment scripts reviewed", "WARN", "Medium", 3, "filename candidate", "review", confidence="low")
    scanner.correlate(findings)
    correlation = next(item for item in findings if item.check == "Compound mesh risk correlated")
    assert correlation.risk != "Critical"
    assert correlation.derived is True
    assert correlation.confidence == "low"


def test_external_symlink_is_reported_and_not_scanned(tmp_path):
    scanner = load_scanner()
    target = tmp_path / "target"
    target.mkdir()
    outside = tmp_path / "outside.txt"
    outside.write_text("api_key = \\\"sk-abcdefghijklmnopqrstuvwxyz\\\"\n", encoding="utf-8")
    link = target / "linked.txt"
    link.symlink_to(outside)
    coverage = {}
    files = scanner.list_files(target, None, coverage)
    assert link not in files
    assert str(link) in coverage["symlink_skips"]


def test_symlink_directory_skip_is_reported_as_incomplete(tmp_path):
    scanner = load_scanner()
    target = tmp_path / "target"
    target.mkdir()
    outside = tmp_path / "outside"
    outside.mkdir()
    (outside / "secret.py").write_text("API_KEY = \\\"literal-secret-value\\\"\n", encoding="utf-8")
    link = target / "linked-dir"
    link.symlink_to(outside, target_is_directory=True)
    coverage = {}
    files = scanner.list_files(target, None, coverage)
    assert link not in files
    assert str(link) in coverage["symlink_directory_skips"]
    assert coverage["security_relevant_incomplete"] is True
