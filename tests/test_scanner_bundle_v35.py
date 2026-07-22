from __future__ import annotations

import importlib.util
import json
import subprocess
import sys
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
