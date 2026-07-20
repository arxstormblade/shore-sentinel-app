import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def read(relative: str) -> str:
    return (ROOT / relative).read_text(encoding="utf-8")


class ManagedMachineV11CopyAndControlsTests(unittest.TestCase):
    def test_managed_machine_navigation_uses_open_machine_copy(self):
        dashboard = read("web/app/dashboard/page.jsx")
        registry = read("web/components/inventory-registry-client.jsx")

        self.assertNotIn("Open dossier", dashboard)
        self.assertNotIn("open dossier", dashboard)
        self.assertNotIn("Open dossier", registry)
        self.assertNotIn("open dossier", registry)
        self.assertIn(">Open Machine</Link>", dashboard)
        self.assertIn(">Open Machine</Link>", registry)

    def test_scan_directory_control_is_labelled_defaults_to_root_and_locks_while_running(self):
        component = read("web/components/machine-detail-client.jsx")

        self.assertIn("const [scanTarget, setScanTarget] = useState('.')", component)
        self.assertIn('htmlFor="machine-scan-target"', component)
        self.assertIn("Directory to scan", component)
        self.assertIn('id="machine-scan-target"', component)
        self.assertIn("value={scanTarget}", component)
        self.assertIn("disabled={scanBusy || hasActiveRun}", component)
        self.assertIn("className=\"machine-scan-controls\"", component)

    def test_scan_directory_rejects_unsafe_values_before_launch_and_includes_safe_scope(self):
        component = read("web/components/machine-detail-client.jsx")

        self.assertIn("function validateScanTarget(value)", component)
        self.assertIn("[\\u0000-\\u001F\\u007F]", component)
        self.assertIn("1024", component)
        self.assertIn("\\.\\.", component)
        self.assertIn("const targetError = validateScanTarget(scanTarget)", component)
        self.assertIn("if (targetError)", component)
        self.assertIn("scan_target: scanTarget.trim()", component)

    def test_active_scan_displays_its_immutable_directory_scope_without_raw_data_copy(self):
        component = read("web/components/machine-detail-client.jsx")

        self.assertIn('<span>Directory in scope</span><code>{currentRun?.scan_target || \'.\'}</code>', component)
        self.assertNotIn("Scan target", component)

    def test_directory_controls_have_scoped_responsive_typography_and_target_size_rules(self):
        css = read("web/app/globals.css")

        self.assertIn(".machine-scan-controls", css)
        self.assertIn(".machine-scan-target-label", css)
        self.assertIn(".machine-scan-target-helper", css)
        self.assertIn(".machine-scan-target-error", css)
        self.assertIn("font-variant-numeric: tabular-nums", css)
        self.assertIn(".machine-scan-controls input", css)
        self.assertIn("min-height: 44px", css)
        self.assertIn("@media (max-width: 760px)", css)


if __name__ == "__main__":
    unittest.main()
