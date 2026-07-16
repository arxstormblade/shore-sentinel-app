import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(relative: str) -> str:
    return (ROOT / relative).read_text(encoding="utf-8")


class CompactOperationsComponentTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.ui = read("web/components/ui.jsx")
        cls.css = read("web/app/globals.css")

    def test_existing_ui_exports_remain_available(self):
        for export_name in ["ShoreLogo", "Brand", "Shell", "Header", "Filters", "Pill", "Empty"]:
            self.assertRegex(self.ui, rf"export function {export_name}\b")

    def test_compact_primitives_are_small_named_exports(self):
        for export_name in [
            "CompactPageHeader",
            "OperationsSummaryStrip",
            "OperationalSection",
            "OperationsLedger",
            "OperationsLedgerRow",
            "ComposedEmptyState",
            "OperationsDisclosure",
        ]:
            self.assertRegex(self.ui, rf"export function {export_name}\b")
        self.assertNotIn("CompactOperationsTemplate", self.ui)
        self.assertNotIn("PageTemplate", self.ui)

    def test_primitives_use_semantic_document_structure(self):
        semantic_contracts = [
            '<header className="compact-page-header',
            "<h1>{title}</h1>",
            '<dl className="operations-summary-strip',
            '<section className="operational-section',
            "aria-labelledby={headingId}",
            '<ul className="operations-ledger',
            '<li className="operations-ledger-row',
            '<details className="operations-disclosure',
            '<summary className="operations-disclosure-summary">',
        ]
        for contract in semantic_contracts:
            self.assertIn(contract, self.ui)

    def test_summary_values_keep_terms_and_descriptions_paired(self):
        self.assertIn("items.map((item)", self.ui)
        self.assertIn("<dt>{item.label}</dt>", self.ui)
        self.assertIn("<dd>", self.ui)
        self.assertIn("{item.value}", self.ui)

    def test_empty_and_error_states_announce_their_meaning(self):
        self.assertIn("tone === 'error' ? 'alert' : 'status'", self.ui)
        self.assertIn("aria-live={tone === 'error' ? 'assertive' : 'polite'}", self.ui)
        self.assertIn('className="composed-empty-state-actions"', self.ui)

    def test_compact_css_defines_shared_dossier_tokens_and_rhythm(self):
        for token in [
            "--operations-page-max: 1180px",
            "--operations-section-gap: 0.8rem",
            "--operations-section-padding: 1rem 1.1rem",
            "--operations-target-min: 44px",
        ]:
            self.assertIn(token, self.css)
        for selector in [
            ".operations-page",
            ".compact-page-header",
            ".operations-summary-strip",
            ".operational-section",
            ".operations-ledger",
            ".operations-ledger-row",
            ".composed-empty-state",
            ".operations-disclosure",
        ]:
            self.assertIn(selector, self.css)

    def test_summary_strip_resolves_to_six_three_and_one_columns(self):
        self.assertRegex(
            self.css,
            r"\.operations-summary-strip\s*\{[^}]*grid-template-columns:\s*repeat\(6,\s*minmax\(0,\s*1fr\)\)",
        )
        self.assertIn(
            "@media (max-width: 980px) {\n  .operations-summary-strip {\n"
            "    grid-template-columns: repeat(3, minmax(0, 1fr));",
            self.css,
        )
        self.assertIn(
            "@media (max-width: 460px) {\n  .operations-summary-strip {\n"
            "    grid-template-columns: 1fr;",
            self.css,
        )

    def test_shared_system_guards_targets_focus_motion_and_overflow(self):
        self.assertRegex(
            self.css,
            r"\.compact-page-header-actions a,[^}]*\.operations-ledger-row a,[^}]*\.operations-disclosure-summary\s*\{[^}]*min-height:\s*var\(--operations-target-min\)",
        )
        self.assertIn(":focus-visible", self.css)
        self.assertIn("@media (prefers-reduced-motion: reduce)", self.css)
        self.assertIn("scroll-behavior: auto", self.css)
        self.assertRegex(
            self.css,
            r"\.operations-page\s*\{[^}]*max-width:\s*var\(--operations-page-max\)[^}]*overflow-x:\s*clip",
        )
        self.assertRegex(
            self.css,
            r"\.operations-ledger-row\s*\{[^}]*min-width:\s*0",
        )


class CompactOperationsQualityArtifactTests(unittest.TestCase):
    CHECKLIST = "policies/templates/qa-checklist-template.md"
    SCORECARD = "policies/templates/qa-scorecard-template.md"
    GUIDE = "docs/qa/app-wide-compact-operations-test-guide.md"

    def test_canonical_quality_artifacts_exist(self):
        for relative in [self.CHECKLIST, self.SCORECARD, self.GUIDE]:
            self.assertTrue((ROOT / relative).is_file(), relative)

    def test_checklist_covers_blockers_reviewers_interactions_and_evidence(self):
        checklist_path = ROOT / self.CHECKLIST
        self.assertTrue(checklist_path.is_file(), self.CHECKLIST)
        checklist = checklist_path.read_text(encoding="utf-8")
        for requirement in [
            "Hard blockers",
            "UX designer",
            "Business user",
            "Commercial SaaS",
            "Frontend architecture",
            "1440×1050",
            "900×1050",
            "390×844",
            "Primary actions",
            "Filters",
            "Native disclosures",
            "Empty and error states",
            "Mounted-path",
            "44px",
            "horizontal overflow",
            "console errors",
            "Production web Docker build",
            "Evidence",
        ]:
            self.assertIn(requirement, checklist)

    def test_scorecard_is_blocker_gated_and_totals_one_hundred_points(self):
        scorecard_path = ROOT / self.SCORECARD
        self.assertTrue(scorecard_path.is_file(), self.SCORECARD)
        scorecard = scorecard_path.read_text(encoding="utf-8")
        for requirement in [
            "Hard-blocker gate",
            "95/100",
            "Visual Quality",
            "Simplicity & Usability",
            "Business Meaning",
            "Interaction Quality",
            "Responsive Behaviour",
            "Accessibility",
            "Technical Frontend Quality",
            "Performance & Polish",
            "Total | /100",
            "PASS",
            "FAIL",
        ]:
            self.assertIn(requirement, scorecard)

    def test_guide_links_templates_and_defines_the_app_wide_route_matrix(self):
        guide_path = ROOT / self.GUIDE
        self.assertTrue(guide_path.is_file(), self.GUIDE)
        guide = guide_path.read_text(encoding="utf-8")
        for link in [
            "../../policies/templates/qa-checklist-template.md",
            "../../policies/templates/qa-scorecard-template.md",
        ]:
            self.assertIn(link, guide)
        for route in [
            "/dashboard",
            "/inventory",
            "/inventory/new",
            "/scans/start",
            "/scans-reports",
            "/remediation",
            "/users",
            "/system/update",
            "/preferences",
            "/saved-views",
            "/knowledgebase",
            "/audits",
        ]:
            self.assertIn(f"`{route}`", guide)
        for requirement in [
            "1440×1050",
            "900×1050",
            "390×844",
            "authenticated",
            "zero page errors",
            "zero console errors",
            "zero horizontal overflow",
            "95+",
            "No production Playwright dependency",
        ]:
            self.assertIn(requirement, guide)


if __name__ == "__main__":
    unittest.main()
