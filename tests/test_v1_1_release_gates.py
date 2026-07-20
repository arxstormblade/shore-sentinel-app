import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
WORKFLOW = ROOT / ".github/workflows/quality-security.yml"
SCORECARD = ROOT / "docs/qa/2026-07-20-v1.1.0-release-scorecard.md"
RELEASE_CHECKLIST = ROOT / "documents/shore-sentinel-release-checklist.md"


def read(relative: str) -> str:
    return (ROOT / relative).read_text(encoding="utf-8")


class V110ReleaseGateTests(unittest.TestCase):
    def test_quality_security_workflow_runs_safe_required_gates(self):
        self.assertTrue(WORKFLOW.is_file(), f"missing CI workflow: {WORKFLOW.relative_to(ROOT)}")
        workflow = WORKFLOW.read_text(encoding="utf-8")

        self.assertIn("pull_request:", workflow)
        self.assertIn("push:", workflow)
        self.assertIn("permissions:\n  contents: read", workflow)
        self.assertIn("npm ci", workflow)
        self.assertIn("npm run test", workflow)
        self.assertIn("npm run web:build", workflow)
        self.assertIn("npm run check", workflow)
        self.assertIn("python3 -m unittest discover -s tests", workflow)
        self.assertIn("npm audit --omit=dev", workflow)

        # Production builds must be a first-class gate, rather than being inferred
        # from unit tests or a non-production development command.
        self.assertLess(workflow.index("npm ci"), workflow.index("npm run web:build"))

        # Checkout must contain the graph Gitleaks is asked to inspect. A full
        # history plus --all covers main, PR merge refs, and release refs/tags.
        self.assertIn("actions/checkout@34e114876b0b11c390a56381ad16ebd13914f8d5", workflow)
        self.assertIn("actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020", workflow)
        self.assertIn("fetch-depth: 0", workflow)
        self.assertIn('branches: [main, "release/**"]', workflow)
        self.assertIn('tags: ["v*"]', workflow)
        self.assertIn('detect --source=/repo --log-opts="--all" --redact --exit-code=1', workflow)
        self.assertNotIn("--no-git", workflow)
        self.assertIn("--redact", workflow)

        # Keep the image immutable and make the placeholder exception exact. A
        # path-wide .env.example exclusion would hide a real secret accidentally
        # committed to that file, so only the known full-line fake values pass.
        self.assertIn(
            "zricethezav/gitleaks:v8.21.2@sha256:0e99e8821643ea5b235718642b93bb32486af9c8162c8b8731f7cbdc951a7f46",
            workflow,
        )
        self.assertIn("useDefault = true", workflow)
        self.assertIn("[[rules]]", workflow)
        self.assertIn("'id = \"generic-api-key\"'", workflow)
        self.assertIn("[[rules.allowlists]]", workflow)
        self.assertNotIn("'[allowlist]'", workflow)
        self.assertIn("Known non-secret development placeholders", workflow)
        self.assertLess(
            workflow.index("# Generic-api-key is the one default rule"),
            workflow.index("printf '%s\\n'"),
            "shell comments must precede the continued printf command",
        )
        self.assertIn('regexTarget = "line"', workflow)
        self.assertIn(r"(?m)^\+?POSTGRES_PASSWORD=replace-me-postgres-password", workflow)
        self.assertNotIn("'paths = ['", workflow)
        self.assertLess(
            workflow.index("Scan reachable repository history for committed secrets"),
            workflow.index("Install locked dependencies"),
            "secret scanning must run before npm ci introduces dependency files",
        )
        self.assertNotIn("secrets.", workflow)

    def test_quality_security_workflow_validates_production_compose_without_using_development_placeholders(self):
        workflow = WORKFLOW.read_text(encoding="utf-8")

        compose_validation = 'docker compose --env-file "$COMPOSE_CI_ENV" config --quiet'
        self.assertIn(
            compose_validation,
            workflow,
            "CI must validate production Compose with ephemeral, non-printed runner input",
        )
        self.assertIn("if docker compose config --quiet >/dev/null 2>&1; then", workflow)
        self.assertIn("openssl rand -hex 32", workflow)
        self.assertNotIn("docker compose --env-file .env.example", workflow)
        self.assertLess(
            workflow.index("Check out complete source history"),
            workflow.index(compose_validation),
            "Compose validation must run after checkout",
        )
        self.assertNotRegex(
            workflow,
            r"(?m)^\s*(?:run:\s*)?docker compose(?:\s+[^\n]*)?\s+up(?:\s|$)",
            "CI Compose validation must not deploy services",
        )

    def test_quality_security_workflow_builds_every_runtime_image_without_deploying(self):
        workflow = WORKFLOW.read_text(encoding="utf-8")
        image_build = 'docker compose --env-file "$COMPOSE_CI_ENV" build api web worker-node worker-python'

        self.assertIn(
            image_build,
            workflow,
            "CI must build every deployable Compose application image without starting services",
        )
        self.assertNotRegex(
            workflow,
            r"(?m)^\s*(?:run:\s*)?docker compose(?:\s+[^\n]*)?\s+up(?:\s|$)",
            "the image gate must not deploy services",
        )

    def test_v11_scorecard_template_captures_required_release_evidence(self):
        self.assertTrue(SCORECARD.is_file(), f"missing release scorecard: {SCORECARD.relative_to(ROOT)}")
        scorecard = SCORECARD.read_text(encoding="utf-8").lower()

        for required_field in (
            "fixture evidence",
            "viewport/browser evidence",
            "security-review evidence",
            "deployment evidence",
            "rollback evidence",
            "release tag is created only at promotion",
        ):
            with self.subTest(required_field=required_field):
                self.assertIn(required_field, scorecard)

    def test_v110_changelog_is_unreleased_until_promotion(self):
        for relative in ("CHANGELOG.md", "web/CHANGELOG.md"):
            with self.subTest(changelog=relative):
                changelog = read(relative)
                self.assertIn("## v1.1.0 - Release candidate (unreleased)", changelog)
                self.assertIn("release tag is created only at promotion", changelog.lower())

    def test_install_docs_do_not_instruct_cloning_an_uncreated_release_tag(self):
        for relative in ("README.md", "scanner-bundle/README.md"):
            with self.subTest(document=relative):
                document = read(relative).lower()
                self.assertNotIn("git clone --depth 1 --branch v1.1.0", document)
                self.assertIn("release tag is created only at promotion", document)

    def test_release_checklist_requires_ci_and_ssh_security_gates(self):
        checklist = RELEASE_CHECKLIST.read_text(encoding="utf-8").lower()

        for required_gate in (
            "ci quality/security workflow passes",
            "production dependency audit",
            "secret scan",
            "pinned host-key",
            "disposable ssh fixture",
            "ssh security review",
            "release tag is created only at promotion",
        ):
            with self.subTest(required_gate=required_gate):
                self.assertIn(required_gate, checklist)


if __name__ == "__main__":
    unittest.main()
