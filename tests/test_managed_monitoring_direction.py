import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(rel: str) -> str:
    return (ROOT / rel).read_text(encoding='utf-8')


class ManagedMonitoringDirectionTests(unittest.TestCase):
    def test_readme_exposes_two_clear_install_options(self):
        readme = read('README.md')
        self.assertIn('Option 1 — One-Time Audit', readme)
        self.assertIn('Option 2 — App Deployment', readme)
        self.assertIn('scanner-bundle/bin/Agent_Security_Selfcheck_v3.5.1.py', readme)
        self.assertIn('docker compose up -d --build', readme)
        self.assertIn('Reports and artifacts stay on the client machine', readme)

    def test_start_scan_route_requires_machine_selection(self):
        page = read('web/app/scans/start/page.jsx')
        self.assertIn("redirect(routePath('/inventory'))", page)
        self.assertNotIn('Start managed monitoring', page)
        self.assertNotIn("routePath('/audits/new')", page)

    def test_one_time_audit_runner_route_is_removed_from_app(self):
        self.assertFalse((ROOT / 'web/app/audits/new/page.jsx').exists())
        dashboard = read('web/app/dashboard/page.jsx')
        reports = read('web/app/scans-reports/page.jsx')
        self.assertNotIn("routePath('/audits/new')", dashboard + reports)
        self.assertNotIn('Run One-Time Audit', dashboard + reports)

    def test_navigation_names_the_primary_feature(self):
        nav = read('web/lib/data.js')
        shell = read('web/components/ui.jsx')
        self.assertIn("label: 'AI Assets'", nav)
        self.assertIn("label: 'Asset inventory'", nav)
        self.assertIn("href: '/inventory'", nav)
        self.assertNotIn("label: 'Start scan'", nav)
        self.assertNotIn('icon:', nav)
        self.assertNotIn('item.icon', shell)

    def test_scanner_readme_documents_local_audit_output(self):
        doc = read('scanner-bundle/README.md')
        self.assertIn('One-time local audit from GitHub', doc)
        self.assertIn('Reports and artifacts remain local', doc)
        self.assertIn('shore-sentinel-local-audit-reports', doc)


if __name__ == '__main__':
    unittest.main()
