import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(rel: str) -> str:
    return (ROOT / rel).read_text(encoding='utf-8')


class RemoveInAppOneTimeAuditTests(unittest.TestCase):
    def test_github_readme_remains_the_one_time_audit_channel(self):
        readme = read('README.md')
        self.assertIn('Option 1 — One-Time Audit', readme)
        self.assertIn('scanner-bundle/bin/Agent_Security_Selfcheck_v3.4.0.py', readme)
        self.assertIn('Reports and artifacts stay on the client machine', readme)

    def test_app_surfaces_do_not_link_to_one_time_audit_runner(self):
        files = [
            'web/app/dashboard/page.jsx',
            'web/app/scans/start/page.jsx',
            'web/app/scans-reports/page.jsx',
            'web/app/knowledgebase/page.jsx',
            'web/components/ui.jsx',
        ]
        forbidden = [
            "routePath('/audits/new')",
            'Run One-Time Audit',
            'Run audit',
            'View local audit instructions',
            'View local audit command',
            'one-time local audit',
            'One-time local audit',
        ]
        for rel in files:
            source = read(rel)
            for marker in forbidden:
                self.assertNotIn(marker, source, f'{rel} should not expose in-app one-time audit marker {marker!r}')

    def test_no_web_route_exists_for_creating_one_time_audits(self):
        self.assertFalse((ROOT / 'web/app/audits/new/page.jsx').exists())
        self.assertFalse((ROOT / 'web/app/api/one-time-audits/route.js').exists())
        self.assertFalse((ROOT / 'web/app/api/scans/start/route.js').exists())

    def test_api_no_longer_exposes_one_time_audit_creation_or_run_posts(self):
        controller = read('api/src/app.controller.ts')
        self.assertNotIn("@Post('one-time-audits')", controller)
        self.assertNotIn("@Post('one-time-audits/:id/run')", controller)
        self.assertNotIn("createAudit(@Body()", controller)
        self.assertNotIn("runAudit(@Param('id')", controller)


if __name__ == '__main__':
    unittest.main()
