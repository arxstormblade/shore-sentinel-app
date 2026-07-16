import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(relative: str) -> str:
    return (ROOT / relative).read_text(encoding="utf-8")


class ManagedMachineDossierTests(unittest.TestCase):
    def test_route_mounts_authenticated_machine_detail_client(self):
        page = read("web/app/inventory/machines/[id]/page.jsx")
        self.assertNotIn("<<<<<<<", page)
        self.assertNotIn(">>>>>>>", page)
        self.assertIn("getAuthenticatedUser", page)
        self.assertIn("MachineDetailClient", page)
        self.assertIn("apiGet('/targets/' + id)", page)
        self.assertIn("apiGet('/targets/' + id + '/scan-runs')", page)
        self.assertIn("remediations,", page)

    def test_scan_machine_is_primary_and_uses_managed_scan_job_endpoint(self):
        component = read("web/components/machine-detail-client.jsx")
        self.assertIn("Scan machine", component)
        self.assertIn("/targets/${machine.id}/scan-jobs", component)
        self.assertIn('className="btn machine-scan-action"', component)
        self.assertIn("hasActiveRun", component)
        self.assertIn("scanBusy || scanBlocked", component)
        self.assertIn('aria-live="polite"', component)

    def test_remediation_items_expand_inline(self):
        component = read("web/components/machine-detail-client.jsx")
        self.assertIn("machine.remediations", component)
        self.assertIn('<details className="machine-remediation-item"', component)
        self.assertIn("Expand details", component)
        self.assertIn("Open full record", component)
        self.assertNotIn("machine.remediations.map((r) => (\n          <Link", component)

    def test_dossier_avoids_space_heavy_grid_and_report_cards(self):
        component = read("web/components/machine-detail-client.jsx")
        self.assertIn('className="machine-dossier"', component)
        self.assertIn('className="machine-summary-strip"', component)
        self.assertIn('className="machine-report-list"', component)
        self.assertNotIn('className="grid"', component)
        self.assertNotIn("report-cards", component)
        self.assertNotIn("report-card", component)

    def test_admin_sections_are_collapsed_disclosures(self):
        component = read("web/components/machine-detail-client.jsx")
        css = read("web/app/globals.css")
        self.assertIn('<details className="machine-admin-disclosure">', component)
        self.assertIn("Machine settings", component)
        self.assertIn('<details className="machine-admin-disclosure danger-zone">', component)
        self.assertIn("Danger zone", component)
        self.assertIn("machine-admin-expand-label", component)
        self.assertIn("Hide settings", component)
        self.assertIn("Hide controls", component)
        self.assertIn(".machine-admin-disclosure[open] .machine-admin-expand-label", css)

    def test_machine_actions_use_same_origin_proxy_routes(self):
        component = read("web/components/machine-detail-client.jsx")
        targets_proxy = ROOT / "web/app/api/targets/[...path]/route.js"
        runs_proxy = ROOT / "web/app/api/scan-runs/[...path]/route.js"
        self.assertIn("appPath(`/api/targets/", component)
        self.assertIn("appPath(`/api/scan-runs/", component)
        self.assertNotIn("`${apiBase}/targets/", component)
        self.assertTrue(targets_proxy.exists())
        self.assertTrue(runs_proxy.exists())
        self.assertIn("serverApiBase()", targets_proxy.read_text(encoding="utf-8"))
        self.assertIn("serverApiBase()", runs_proxy.read_text(encoding="utf-8"))

    def test_polling_is_abortable_and_does_not_overlap(self):
        component = read("web/components/machine-detail-client.jsx")
        self.assertIn("AbortController", component)
        self.assertIn("setTimeout", component)
        self.assertNotIn("setInterval(refresh", component)
        self.assertIn("Live scan updates are temporarily unavailable", component)

    def test_server_page_fails_closed_and_hydrates_remediation_details(self):
        page = read("web/app/inventory/machines/[id]/page.jsx")
        self.assertIn("runHistoryUnavailable = true", page)
        self.assertIn("selectInitialRuns(runsPayload, machine.reports)", page)
        self.assertIn("apiGet('/remediation/' + item.id)", page)
        self.assertIn("canScan=", page)
        self.assertIn("canEdit=", page)
        self.assertIn("canDelete=", page)

    def test_dossier_css_has_compact_and_responsive_rules(self):
        css = read("web/app/globals.css")
        self.assertNotIn("<<<<<<<", css)
        self.assertIn(".machine-dossier", css)
        self.assertIn(".machine-summary-strip", css)
        self.assertIn(".machine-remediation-item", css)
        self.assertIn(".machine-report-row", css)
        self.assertIn("min-height: 44px", css)
        self.assertIn("@media (max-width: 760px)", css)


if __name__ == "__main__":
    unittest.main()
