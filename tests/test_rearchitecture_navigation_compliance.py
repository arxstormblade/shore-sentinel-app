import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(relative_path):
    return (ROOT / relative_path).read_text(encoding='utf-8')


class RearchitectureNavigationComplianceTests(unittest.TestCase):
    def test_app_exposes_loading_and_actionable_error_states(self):
        loading_path = ROOT / 'web/app/loading.jsx'
        error_path = ROOT / 'web/app/error.jsx'
        self.assertTrue(loading_path.exists(), 'Missing route-level loading state')
        self.assertTrue(error_path.exists(), 'Missing route-level error state')
        loading = read('web/app/loading.jsx')
        error = read('web/app/error.jsx')
        self.assertIn('aria-busy="true"', loading)
        self.assertIn('aria-live="polite"', loading)
        self.assertIn('role="alert"', error)
        self.assertIn('onClick={reset}', error)
        self.assertNotIn('error.message', error)
        self.assertNotIn('console.', error)

    def test_page_state_styles_are_static_and_reduced_motion_safe(self):
        css = read('web/app/globals.css')
        self.assertIn('.route-state', css)
        self.assertIn('.route-state-skeleton', css)
        self.assertNotIn('animation: pulse', css)


if __name__ == '__main__':
    unittest.main()
