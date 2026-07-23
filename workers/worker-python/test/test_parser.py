import unittest

from src.parser import CONTRACT_VERSION, normalize_severity, parse_scanner_output


def evidence(kind="observation", scope="target_source", confidence="high"):
    return [{"text": "verified evidence", "kind": kind, "scope": scope, "confidence": confidence}]


def finding(**overrides):
    value = {
        "id": "f1",
        "title": "Finding",
        "severity": "high",
        "severityScore": 3,
        "category": "security",
        "description": "detail",
        "evidence": evidence(),
        "scope": "target_source",
        "confidence": "high",
        "reachability": "declared",
        "evidenceKind": "observation",
        "status": "WARN",
        "risk": "High",
        "derived": False,
        "derivedFrom": [],
    }
    value.update(overrides)
    return value


def output(**overrides):
    value = {
        "contractVersion": CONTRACT_VERSION,
        "collectedAt": "2026-07-22T00:00:00Z",
        "scanner": {"name": "Agent Security Selfcheck", "version": "3.5.1", "scriptSha256": "a" * 64},
        "target": {"assetId": "asset-1", "hostname": "host1", "ip": "10.0.0.5"},
        "coverage": {"scan_complete": True},
        "decision": {"status": "PASS", "exit_code": 0},
        "metadata": {
            "generated_utc": "2026-07-22T00:00:00Z",
            "script_version": "3.5.1",
            "script_sha256": "a" * 64,
            "target_asset_id": "asset-1",
            "coverage": {"scan_complete": True},
        },
        "findings": [finding()],
        "score": {"overall_score": 100, "grade": "Low Risk", "categories": {}},
        "executive_summary": ["summary"],
    }
    value.update(overrides)
    return value


class ParserTests(unittest.TestCase):
    def test_normalize_severity_aliases(self):
        self.assertEqual(normalize_severity("crit"), "critical")
        self.assertEqual(normalize_severity("MED"), "moderate")
        self.assertEqual(normalize_severity("unknown"), "informational")

    def test_parse_scanner_output_normalizes_findings_and_summary(self):
        result = parse_scanner_output("run-1", output(findings=[finding(id="f1", severity="high"), finding(id="f2", title="Weak cipher", severity="critical", risk="Critical")])).to_dict()
        self.assertEqual(result["runId"], "run-1")
        self.assertEqual(len(result["normalizedFindings"]), 2)
        self.assertEqual(result["normalizedFindings"][1]["severity"], "critical")
        self.assertEqual(result["enrichmentSummary"]["severityCounts"], {"high": 1, "critical": 1})
        self.assertEqual(result["enrichmentSummary"]["findingsWithCve"], 0)
        self.assertEqual(result["enrichmentSummary"]["coverage"]["scan_complete"], True)
        self.assertEqual(result["enrichmentSummary"]["decision"]["exit_code"], 0)

    def test_parse_scanner_output_extracts_cve_reference(self):
        result = parse_scanner_output("run-1", output(findings=[finding(title="Framework vulnerability", category="framework", references=["https://nvd.nist.gov/vuln/detail/CVE-2024-12345"])])).to_dict()
        finding_result = result["normalizedFindings"][0]
        self.assertEqual(finding_result["cve"], "CVE-2024-12345")
        self.assertEqual(finding_result["cveUrl"], "https://nvd.nist.gov/vuln/detail/CVE-2024-12345")
        self.assertEqual(result["enrichmentSummary"]["findingsWithCve"], 1)
        self.assertEqual(result["enrichmentSummary"]["cves"], ["CVE-2024-12345"])

    def test_parse_rejects_wrong_contract_version(self):
        with self.assertRaisesRegex(ValueError, "contractVersion"):
            parse_scanner_output("run-1", {"contractVersion": "v0", "findings": []})

    def test_parse_preserves_v35_evidence_provenance_fields(self):
        result = parse_scanner_output("run-v35", output(findings=[finding(scope="host_runtime", reachability="host_only", evidenceKind="compose_socket_mount", evidence=evidence("compose_socket_mount", "host_runtime"))])).to_dict()
        parsed = result["normalizedFindings"][0]
        self.assertEqual(parsed["scope"], "host_runtime")
        self.assertEqual(parsed["reachability"], "host_only")
        self.assertEqual(parsed["evidenceKind"], "compose_socket_mount")
        self.assertEqual(parsed["derivedFrom"], [])

    def test_parse_rejects_finding_without_stable_id(self):
        with self.assertRaisesRegex(ValueError, "stable finding id"):
            parse_scanner_output("run-v35", output(findings=[{"title": "Missing stable identifier"}]))

    def test_parse_rejects_missing_coverage_or_decision_contract(self):
        invalid = output()
        invalid.pop("coverage")
        invalid.pop("decision")
        with self.assertRaisesRegex(ValueError, "coverage"):
            parse_scanner_output("run-v35", invalid)

    def test_parse_rejects_missing_finding_provenance(self):
        with self.assertRaisesRegex(ValueError, "required provenance"):
            parse_scanner_output("run-v35", output(findings=[{"id": "finding-1", "title": "Missing provenance"}]))

    def test_rejects_non_rfc3339_timestamp(self):
        with self.assertRaisesRegex(ValueError, "RFC3339"):
            parse_scanner_output("run-v35", output(collectedAt="2026-07-22 00:00:00+00:00"))

    def test_rejects_negative_exit_code(self):
        with self.assertRaisesRegex(ValueError, "decision"):
            parse_scanner_output("run-v35", output(decision={"status": "ERROR", "exit_code": -1}))

    def test_rejects_boolean_exit_code(self):
        with self.assertRaisesRegex(ValueError, "decision"):
            parse_scanner_output("run-v35", output(decision={"status": "PASS", "exit_code": False}))

    def test_rejects_invalid_provenance_enum(self):
        with self.assertRaisesRegex(ValueError, "provenance enum"):
            parse_scanner_output("run-v35", output(findings=[finding(scope="made_up_scope")]))

    def test_rejects_invalid_finding_status_and_risk(self):
        with self.assertRaisesRegex(ValueError, "status or risk"):
            parse_scanner_output("run-v35", output(findings=[finding(status="UNKNOWN")]))

    def test_rejects_scalar_evidence(self):
        with self.assertRaisesRegex(ValueError, "evidence"):
            parse_scanner_output("run-v35", output(findings=[finding(evidence="not-an-array")]))

    def test_rejects_target_identity_mismatch_when_expected(self):
        with self.assertRaisesRegex(ValueError, "asset identity mismatch"):
            parse_scanner_output("run-v35", output(), expected_target_asset_id="different-asset")

    def test_rejects_scanner_identity_mismatch_when_expected(self):
        with self.assertRaisesRegex(ValueError, "producer identity mismatch"):
            parse_scanner_output("run-v35", output(), expected_scanner={"name": "Other Scanner", "version": "3.5.1"})

    def test_rejects_invalid_scope_mode(self):
        invalid_coverage = {"scan_complete": True, "scope_mode": "invalid"}
        with self.assertRaisesRegex(ValueError, "scope_mode"):
            parse_scanner_output("run-v35", output(coverage=invalid_coverage, metadata={**output()["metadata"], "coverage": invalid_coverage}))

    def test_rejects_object_valued_references(self):
        with self.assertRaisesRegex(ValueError, "array of strings"):
            parse_scanner_output("run-v35", output(findings=[finding(references=[{"url": "https://example.test"}])]))

    def test_rejects_expected_subject_type_mismatch(self):
        with self.assertRaisesRegex(ValueError, "subject type mismatch"):
            parse_scanner_output("run-v35", output(target={"assetId": "asset-1", "subjectType": "other"}), expected_subject_type="managed_target")

    def test_rejects_null_optional_target_fields(self):
        with self.assertRaisesRegex(ValueError, "target hostname must be a string"):
            parse_scanner_output("run-v35", output(target={"assetId": "asset-1", "hostname": None}))

    def test_rejects_missing_score_contract(self):
        value = output()
        value.pop("score")
        with self.assertRaisesRegex(ValueError, "score contract"):
            parse_scanner_output("run-v35", value)

    def test_rejects_missing_executive_summary_contract(self):
        value = output()
        value.pop("executive_summary")
        with self.assertRaisesRegex(ValueError, "executive_summary"):
            parse_scanner_output("run-v35", value)

    def test_rejects_unexpected_scanner_name_without_expected_metadata(self):
        with self.assertRaisesRegex(ValueError, "producer name mismatch"):
            parse_scanner_output("run-v35", output(scanner={"name": "Other Scanner", "version": "3.5.1", "scriptSha256": "a" * 64}))


if __name__ == "__main__":
    unittest.main()
