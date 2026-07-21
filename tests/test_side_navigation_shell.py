import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(rel: str) -> str:
    return (ROOT / rel).read_text(encoding='utf-8')


class SideNavigationShellTests(unittest.TestCase):
    def test_authenticated_shell_uses_side_navigation_not_top_nav(self):
        shell = read('web/components/ui.jsx')
        self.assertIn('className="app-shell authenticated-shell"', shell)
        self.assertIn('className="side-nav"', shell)
        self.assertIn("label = 'Primary navigation'", shell)
        self.assertIn('aria-label={label}', shell)
        self.assertNotIn('className="primary-nav"', shell)

    def test_side_navigation_uses_required_order_and_grouped_subpages(self):
        shell = read('web/components/ui.jsx')
        data = read('web/lib/data.js')
        self.assertIn('navGroups.map', shell)
        self.assertNotIn('item.icon', shell)
        self.assertNotIn('icon:', data)

        expected_groups = ['Dashboard', 'AI Assets', 'Audit Reports', 'Knowledgebase', 'System', 'Users']
        positions = [data.index(f"label: '{label}'") for label in expected_groups]
        self.assertEqual(positions, sorted(positions))

        for label in expected_groups:
            self.assertIn(f"label: '{label}'", data)
        for label in ['Saved views', 'Add machine', 'Audit archive', 'Remediation', 'Display preferences', 'System update']:
            self.assertIn(f"label: '{label}'", data)
        self.assertNotIn("label: 'Start scan'", data)

    def test_legacy_start_scan_route_redirects_to_machine_selection(self):
        page = read('web/app/scans/start/page.jsx')
        self.assertIn("redirect(routePath('/inventory'))", page)
        self.assertNotIn('title="Start managed monitoring"', page)

    def test_start_scan_is_a_machine_detail_action_not_primary_navigation(self):
        data = read('web/lib/data.js')
        machine_detail = read('web/components/machine-detail-client.jsx')
        self.assertNotIn("href: '/scans/start'", data)
        self.assertIn("const scanButtonLabel", machine_detail)
        self.assertIn("onClick={requestScanConfirmation}", machine_detail)
        self.assertIn("runScan();", machine_detail)

    def test_side_navigation_renders_group_labels_and_subpage_links(self):
        shell = read('web/components/ui.jsx')
        self.assertIn('side-nav-group', shell)
        self.assertIn('side-nav-group-label', shell)
        self.assertIn('side-nav-group-items', shell)
        self.assertIn('{item.label}', shell)

    def test_mobile_navigation_uses_a_drawer_while_desktop_keeps_the_side_rail(self):
        shell = read('web/components/ui.jsx') + read('web/components/mobile-navigation.jsx')
        css = read('web/app/globals.css')
        self.assertIn('className="mobile-navigation-drawer"', shell)
        self.assertIn('<summary', shell)
        self.assertIn('Navigation', shell)
        self.assertIn('.mobile-navigation-drawer', css)
        self.assertIn('@media (max-width: 960px)', css)
        self.assertIn('.mobile-navigation-panel', css)
        self.assertIn('.side-nav {', css)
        self.assertIn('display: none;', css)
        self.assertIn('.mobile-rail > .user-strip .system-status', css)
        self.assertNotIn('.mobile-rail .system-status {', css)
        self.assertIn('onClick={closeDrawer}', shell)
        self.assertIn("event.key === 'Escape'", shell)
        self.assertIn('summaryRef.current?.focus()', shell)

    def test_shell_uses_neutral_system_truth_and_skip_navigation(self):
        shell = read('web/components/ui.jsx')
        css = read('web/app/globals.css')
        self.assertNotIn('All Systems Operational', shell)
        self.assertIn('System status unavailable', shell)
        self.assertIn('href="#main-content"', shell)
        self.assertIn('id="main-content"', shell)
        self.assertIn('className="skip-link"', shell)
        self.assertIn('.skip-link', css)
        self.assertIn('scroll-margin-top: 5rem', css)
        self.assertTrue((ROOT / 'web/app/icon.png').is_file())

    def test_empty_navigation_groups_do_not_render_empty_subpage_containers(self):
        shell = read('web/components/ui.jsx')
        self.assertIn('group.items.length ?', shell)

    def test_css_defines_responsive_side_navigation(self):
        css = read('web/app/globals.css')
        for selector in ['.app-shell', '.side-nav', '.shell-main', '.mobile-rail']:
            self.assertIn(selector, css)
        self.assertIn('grid-template-columns: var(--side-nav-width) minmax(0, 1fr)', css)
        self.assertIn('@media (max-width: 760px)', css)
        self.assertIn('grid-template-columns: 1fr', css)
        self.assertIn('min-height: 44px', css)


if __name__ == '__main__':
    unittest.main()
