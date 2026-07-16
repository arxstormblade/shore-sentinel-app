import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(relative: str) -> str:
    return (ROOT / relative).read_text(encoding="utf-8")


class CompactAdminAndArchivePageTests(unittest.TestCase):
    def test_users_directory_uses_compact_primitives_without_losing_account_controls(self):
        client = read("web/app/users/users-client.jsx")
        for contract in [
            "CompactPageHeader",
            "OperationsSummaryStrip",
            "OperationalSection",
            "OperationsLedger",
            "OperationsLedgerRow",
            "createUser",
            "updateUser",
            "resetPassword",
            "disableUser",
            "enableUser",
            "deleteUser",
            "Add user",
            "Reset password",
            "Edit roles",
        ]:
            self.assertIn(contract, client)
        self.assertNotIn("users-table", client)

    def test_update_console_keeps_safety_gate_and_uses_compact_output_disclosure(self):
        client = read("web/app/system/update/update-client.jsx")
        for contract in [
            "CompactPageHeader",
            "OperationsSummaryStrip",
            "OperationalSection",
            "OperationsDisclosure",
            "checkUpdate",
            "applyUpdate",
            "!result?.enabled",
            "Update output",
            "Operational safety",
        ]:
            self.assertIn(contract, client)

    def test_preferences_keep_browser_local_behavior_inside_compact_settings_layout(self):
        page = read("web/app/preferences/page.jsx")
        panel = read("web/components/display-preferences.jsx")
        for contract in ["CompactPageHeader", "OperationalSection", "DisplayPreferencesPanel"]:
            self.assertIn(contract, page)
        self.assertIn('<h3 id="display-preferences-title">Display controls</h3>', panel)
        for contract in [
            "DISPLAY_PREFERENCE_STORAGE_KEY",
            "window.localStorage.setItem",
            "applyPreferences",
            "Reset to defaults",
        ]:
            self.assertIn(contract, panel)

    def test_audit_archive_is_compact_read_only_and_keeps_report_and_promotion_handoffs(self):
        archive = read("web/app/audits/page.jsx")
        detail = read("web/app/audits/[id]/page.jsx")
        combined = archive + detail
        for contract in [
            "CompactPageHeader",
            "OperationsSummaryStrip",
            "OperationalSection",
            "OperationsLedger",
            "OperationsLedgerRow",
            "apiGet('/one-time-audits')",
            "apiGet('/one-time-audits/' + id)",
            "Promote to Managed Machine",
            "scans-reports/reports/",
            "Read-only historical evidence",
        ]:
            self.assertIn(contract, combined)
        self.assertNotIn("routePath('/audits/new')", combined)
        self.assertNotIn("Run audit", combined)


if __name__ == "__main__":
    unittest.main()
