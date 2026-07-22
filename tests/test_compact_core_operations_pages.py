import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(relative: str) -> str:
    return (ROOT / relative).read_text(encoding="utf-8")


class CompactCoreOperationsPageTests(unittest.TestCase):
    def test_dashboard_is_a_live_compact_operator_briefing(self):
        page = read("web/app/dashboard/page.jsx")
        for contract in [
            "CompactPageHeader",
            "OperationsSummaryStrip",
            "OperationalSection",
            "OperationsLedger",

            "const severitySegments",
            "conic-gradient(${severitySegments})",
            "openRemediations",
            "latestReports",
        ]:
            self.assertIn(contract, page)
        self.assertRegex(page, r'className="operations-page(?:\s+[^\"]+)?"')
        self.assertNotIn('className="dashboard-hero"', page)
        self.assertNotIn('className="hero-actions"', page)

    def test_inventory_uses_a_compact_registry_with_real_filter_controls(self):
        page = read("web/app/inventory/page.jsx")
        registry = read("web/components/inventory-registry-client.jsx")
        self.assertIn("InventoryRegistry", page)
        self.assertRegex(page, r'className="operations-page(?:\s+[^\"]+)?"')
        for contract in [
            "useState",
            "environmentFilter",
            "statusFilter",
            "visibleMachines",
            'htmlFor="inventory-environment-filter"',
            'htmlFor="inventory-status-filter"',
            "Clear filters",
            "No machines match the selected filters",
            "last_successful_scan_at",
            "remediation_count",
            "timeZone: 'UTC'",
        ]:
            self.assertIn(contract, registry)

    def test_enrollment_groups_fields_and_keeps_connection_details_progressive(self):
        page = read("web/app/inventory/new/page.jsx")
        form = read("web/components/new-machine-form.jsx")
        self.assertIn("NewMachineForm", page)
        for contract in [
            "CompactPageHeader",
            "OperationsDisclosure",
            'name="hostname"',
            'name="connection_mode"',
            'name="ssh_auth_method"',
            'name="ssh_private_key"',
            'name="ssh_password"',
            'summary="Advanced connection settings"',
            'className="operations-page enrollment-page"',
        ]:
            self.assertIn(contract, form)

    def test_scan_start_redirects_to_machine_selection(self):
        page = read("web/app/scans/start/page.jsx")
        self.assertIn("redirect(routePath('/inventory'))", page)
        self.assertNotIn("CompactPageHeader", page)
        self.assertNotIn('className="operations-page scan-start-page"', page)

    def test_production_dependencies_pin_non_vulnerable_sharp(self):
        package = read("package.json")
        self.assertIn('"sharp": "0.35.3"', package)

    def test_web_production_build_uses_architecture_independent_webpack(self):
        package = read("web/package.json")
        self.assertIn('"build": "next build --webpack"', package)

    def test_public_shell_sign_in_uses_the_mounted_application_path(self):
        shell = read("web/components/ui.jsx")
        self.assertIn("href={appPath('/auth/login')}", shell)
        self.assertNotIn("href={routePath('/auth/login')}", shell)

    def test_authenticated_root_continues_to_redirect_to_dashboard(self):
        landing = read("web/app/page.jsx")
        self.assertIn("getAuthenticatedUser", landing)
        self.assertIn("redirect('/dashboard')", landing)
        self.assertIn("SignInForm", landing)


if __name__ == "__main__":
    unittest.main()
