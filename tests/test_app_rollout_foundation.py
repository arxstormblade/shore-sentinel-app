import re
import unittest
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CONTROLLER = ROOT / 'api/src/app.controller.ts'
CONTROLLER_TEST = ROOT / 'api/test/controller-shapes.test.ts'
SCHEMA = ROOT / 'api/src/schema.ts'


def read(path: Path) -> str:
    return path.read_text(encoding='utf-8')


class AppRolloutFoundationTests(unittest.TestCase):
    def test_controller_sources_have_no_merge_markers_or_duplicate_routes(self):
        controller = read(CONTROLLER)
        controller_test = read(CONTROLLER_TEST)
        marker_pattern = re.compile(r'^(<<<<<<<|=======|>>>>>>>)', re.MULTILINE)
        self.assertIsNone(marker_pattern.search(controller), 'app.controller.ts contains a committed merge marker')
        self.assertIsNone(marker_pattern.search(controller_test), 'controller-shapes.test.ts contains a committed merge marker')

        routes = re.findall(r"@(Get|Post|Patch|Delete)\('([^']+)'\)", controller)
        duplicates = {route: count for route, count in Counter(routes).items() if count > 1}
        self.assertEqual({}, duplicates, f'duplicate controller routes: {duplicates}')

        required_routes = {
            ('Get', 'targets'),
            ('Get', 'targets/:id'),
            ('Post', 'targets'),
            ('Get', 'targets/:id/scan-runs'),
            ('Patch', 'targets/:id'),
            ('Delete', 'targets/:id'),
            ('Post', 'targets/:id/scan-jobs'),
            ('Get', 'users'),
            ('Get', 'reports'),
            ('Get', 'reports/:id'),
            ('Get', 'remediation'),
            ('Get', 'remediation/:id'),
            ('Patch', 'remediations/:id/status'),
            ('Post', 'artifacts'),
            ('Get', 'artifacts/:id/download'),
            ('Post', 'auth/login'),
            ('Get', 'auth/me'),
            ('Get', 'system/update'),
            ('Post', 'system/update/check'),
            ('Post', 'system/update/apply'),
        }
        self.assertEqual(set(), required_routes - set(routes), 'critical controller routes were lost during conflict repair')

    def test_one_time_audits_are_read_only_historical_evidence(self):
        controller = read(CONTROLLER)
        self.assertFalse((ROOT / 'web/app/audits/new/page.jsx').exists())
        self.assertFalse((ROOT / 'web/app/api/one-time-audits/route.js').exists())
        self.assertNotIn("@Post('one-time-audits')", controller)
        self.assertNotIn("@Post('one-time-audits/:id/run')", controller)
        self.assertEqual(1, controller.count("@Get('one-time-audits')"))
        self.assertEqual(1, controller.count("@Get('one-time-audits/:id')"))

        archive = read(ROOT / 'web/app/audits/page.jsx')
        detail = read(ROOT / 'web/app/audits/[id]/page.jsx')
        self.assertIn("apiGet('/one-time-audits')", archive)
        self.assertIn("apiGet('/one-time-audits/' + id)", detail)
        self.assertNotIn("routePath('/audits/new')", archive + detail)

    def test_remediation_status_contract_matches_the_database_schema(self):
        controller = read(CONTROLLER)
        schema = read(SCHEMA)

        self.assertIn("CHECK(status IN ('open','accepted','ignored','resolved'))", schema)
        self.assertIn("const allowedStatuses = ['open', 'accepted', 'ignored', 'resolved'];", controller)


if __name__ == '__main__':
    unittest.main()
