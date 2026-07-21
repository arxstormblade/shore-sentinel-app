import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
COMPOSE = (ROOT / "docker-compose.yml").read_text(encoding="utf-8")
WORKFLOW = (ROOT / ".github" / "workflows" / "quality-security.yml").read_text(encoding="utf-8")


def service_block(service: str) -> str:
    match = re.search(
        rf"^  {re.escape(service)}:\n(?P<body>.*?)(?=^  [a-z][a-z0-9-]*:\n|^volumes:|\Z)",
        COMPOSE,
        flags=re.MULTILINE | re.DOTALL,
    )
    if match is None:
        raise AssertionError(f"service {service!r} is missing from docker-compose.yml")
    return match.group("body")


class ProductionComposeEnvironmentTests(unittest.TestCase):
    def test_production_has_exactly_one_application_service(self):
        services = re.findall(r"^  ([a-z][a-z0-9-]*):\n", COMPOSE.split("volumes:", 1)[0], flags=re.MULTILINE)
        self.assertEqual(services, ["shore-sentinel"])
        self.assertIn("NODE_ENV: production", service_block("shore-sentinel"))

    def test_development_requires_the_explicit_one_container_override(self):
        development = (ROOT / "docker-compose.dev.yml").read_text(encoding="utf-8")
        self.assertIn("shore-sentinel:", development)
        self.assertIn("NODE_ENV: development", development)


class ProductionSecurityPostureTests(unittest.TestCase):
    def test_production_secret_validation_rejects_placeholders_and_session_cookies_are_secure(self):
        secret_validation = (ROOT / "api" / "src" / "database.service.ts").read_text(encoding="utf-8")
        controller = (ROOT / "api" / "src" / "app.controller.ts").read_text(encoding="utf-8")
        self.assertIn("const PLACEHOLDER_SECRET =", secret_validation)
        self.assertIn("if (environment.NODE_ENV !== 'production') return;", secret_validation)
        self.assertIn("Invalid production secrets: ${invalid.join(', ')}", secret_validation)
        self.assertIn("secure: process.env.NODE_ENV === 'production'", controller)


class ContinuousIntegrationReleaseGateTests(unittest.TestCase):
    def test_ci_builds_the_single_application_image_without_starting_services(self):
        expected_build = "docker compose --env-file \"$COMPOSE_CI_ENV\" build shore-sentinel"
        self.assertIn(expected_build, WORKFLOW)
        self.assertNotIn("docker compose --env-file \"$COMPOSE_CI_ENV\" up", WORKFLOW)

    def test_ci_never_starts_or_deploys_compose_services(self):
        self.assertNotRegex(WORKFLOW, r"(?m)^\s*(?:run:\s*)?docker compose(?:\s+[^\n]*)?\s+up(?:\s|$)")

    def test_ci_quietly_proves_production_compose_rejects_missing_operator_input(self):
        self.assertIn("if docker compose config --quiet >/dev/null 2>&1; then", WORKFLOW)
        self.assertIn("Compose unexpectedly accepted missing production input.", WORKFLOW)
        self.assertNotIn("docker compose --env-file .env.example", WORKFLOW)


if __name__ == "__main__":
    unittest.main()
