import unittest

from src.parser import CONTRACT_VERSION, normalize_severity, parse_scanner_output


class ParserTests(unittest.TestCase):
    def test_normalize_severity_aliases(self):
        self.assertEqual(normalize_severity("crit"), "critical")
        self.assertEqual(normalize_severity("MED"), "moderate")
        self.assertEqual(normalize_severity("unknown"), "informational")

    def test_parse_scanner_output_normalizes_findings_and_summary(self):
        result = parse_scanner_output("run-1", {
            "contractVersion": CONTRACT_VERSION,
            "scanner": {"name": "shore-baseline", "version": "0.1.0"},
            "target": {"assetId": "asset-1", "hostname": "host1", "ip": "10.0.0.5"},
            "findings": [
                {"id": "f1", "name": "Missing patch", "severity": "high", "category": "patching"},
                {"findingId": "f2", "title": "Weak cipher", "severity": "crit", "evidence": ["TLS_RSA"]},
            ],
        }).to_dict()

        self.assertEqual(result["runId"], "run-1")
        self.assertEqual(len(result["normalizedFindings"]), 2)
        self.assertEqual(result["normalizedFindings"][1]["severity"], "critical")
        self.assertEqual(result["enrichmentSummary"]["severityCounts"], {"high": 1, "critical": 1})

    def test_parse_rejects_wrong_contract_version(self):
        with self.assertRaisesRegex(ValueError, "contractVersion"):
            parse_scanner_output("run-1", {"contractVersion": "v0", "findings": []})


if __name__ == "__main__":
    unittest.main()
