import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(relative: str) -> str:
    return (ROOT / relative).read_text(encoding="utf-8")


class CompactEvidenceWorkflowPageTests(unittest.TestCase):
    def test_reports_use_compact_client_filters_and_expandable_findings(self):
        page = read("web/app/scans-reports/page.jsx")
        client = read("web/components/reports-ledger-client.jsx")
        self.assertIn("ReportsLedger", page)
        for contract in [
            "'use client'",
            "useMemo",
            "severityFilter",
            "environmentFilter",
            "statusFilter",
            "visibleReports",
            "OperationsDisclosure",
            "No reports match the selected filters",
        ]:
            self.assertIn(contract, client)

    def test_report_dossier_preserves_artifacts_and_discloses_finding_evidence(self):
        page = read("web/app/scans-reports/reports/[id]/page.jsx")
        for contract in [
            "CompactPageHeader",
            "OperationsSummaryStrip",
            "OperationalSection",
            "OperationsDisclosure",
            "Open artifact",
            "Generated scanner artifacts",
            "Finding evidence",
        ]:
            self.assertIn(contract, page)

    def test_remediation_queue_has_functional_compact_filters_and_evidence_links(self):
        page = read("web/app/remediation/page.jsx")
        client = read("web/components/remediation-queue-client.jsx")
        self.assertIn("RemediationQueue", page)
        for contract in [
            "'use client'",
            "useMemo",
            "severityFilter",
            "statusFilter",
            "environmentFilter",
            "visibleGroups",
            "OperationsDisclosure",
            "View evidence",
            "No remediation items match the selected filters",
        ]:
            self.assertIn(contract, client)

    def test_remediation_dossier_preserves_status_mutation_and_activity(self):
        page = read("web/app/remediation/[id]/page.jsx")
        for contract in [
            "CompactPageHeader",
            "OperationsSummaryStrip",
            "OperationalSection",
            "OperationsDisclosure",
            "apiGet('/remediations/' + id + '/activity')",
            "appPath(`/api/remediations/${item.id}/status`)",
            'name="status"',
            "Activity",
        ]:
            self.assertIn(contract, page)

    def test_saved_views_and_reference_use_compact_sections_and_responsive_rows(self):
        saved_views = read("web/app/saved-views/page.jsx") + read("web/app/saved-views/[slug]/page.jsx")
        content = read("web/components/saved-views.jsx")
        knowledgebase = read("web/app/knowledgebase/page.jsx")
        css = read("web/app/globals.css")
        self.assertIn("CompactPageHeader", saved_views)
        self.assertIn("OperationalSection", content)
        self.assertIn("OperationsLedger", content)
        self.assertIn("CompactPageHeader", knowledgebase)
        self.assertIn("OperationsDisclosure", knowledgebase)
        self.assertIn(".compact-filter-bar", css)
        self.assertIn(".compact-table-row", css)


if __name__ == "__main__":
    unittest.main()
