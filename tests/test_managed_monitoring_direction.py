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
        self.assertIn('scanner-bundle/bin/Agent_Security_Selfcheck_v3.4.0.py', readme)
        self.assertIn('docker compose up -d --build', readme)
        self.assertIn('Reports and artifacts stay on the client machine', readme)

    def test_start_scan_page_prioritizes_managed_monitoring(self):
        page = read('web/app/scans/start/page.jsx')
        self.assertIn('Managed machine monitoring', page)
        self.assertIn('Add managed machine', page)
        self.assertIn('One-time local audit', page)
        self.assertIn('reports stay on the client machine', page.lower())
        self.assertLess(page.index('Managed machine monitoring'), page.index('One-time local audit'))

    def test_one_time_audit_page_is_local_github_pull_workflow(self):
        page = read('web/app/audits/new/page.jsx')
        self.assertIn('Run a local one-time audit', page)
        self.assertIn('git clone --depth 1', page)
        self.assertIn('scanner-bundle/bin/Agent_Security_Selfcheck_v3.4.0.py', page)
        self.assertIn('shore-sentinel-local-audit-reports', page)
        self.assertNotIn('form action={appPath', page)
        self.assertNotIn('Create audit', page)

    def test_navigation_names_the_primary_feature(self):
        nav = read('web/lib/data.js')
        self.assertIn("label: 'Managed Machines'", nav)
        self.assertIn("href: '/inventory'", nav)

    def test_scanner_readme_documents_local_audit_output(self):
        doc = read('scanner-bundle/README.md')
        self.assertIn('One-time local audit from GitHub', doc)
        self.assertIn('Reports and artifacts remain local', doc)
        self.assertIn('shore-sentinel-local-audit-reports', doc)


if __name__ == '__main__':
    unittest.main()
