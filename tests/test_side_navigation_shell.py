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
        self.assertIn('aria-label="Primary navigation"', shell)
        self.assertNotIn('className="primary-nav"', shell)

    def test_side_navigation_keeps_word_only_labels(self):
        shell = read('web/components/ui.jsx')
        data = read('web/lib/data.js')
        self.assertIn('{item.label}', shell)
        self.assertNotIn('item.icon', shell)
        self.assertNotIn('icon:', data)
        for label in ['Managed Machines', 'Scans & Reports', 'Remediation', 'Users', 'System']:
            self.assertIn(label, data)

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
