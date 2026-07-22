import json
import re
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
ARCHITECTURE_PATH = ROOT / "docs/superpowers/specs/shore-sentinel-rearchitecture-a.md"
PLAN_PATH = ROOT / "docs/plans/2026-07-22-enterprise-single-container-completion.md"
README_PATH = ROOT / "README.md"
RTM_PATH = ROOT / "docs/qa/2026-07-22-enterprise-single-container-requirements.json"


def read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


class ArchitectureDocumentInvariantTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.architecture = read(ARCHITECTURE_PATH)
        cls.plan = read(PLAN_PATH)
        cls.readme = read(README_PATH)
        cls.rtm = json.loads(read(RTM_PATH))
        cls.documents = "\n".join((cls.architecture, cls.plan, cls.readme))

    def test_traceability_register_is_complete_and_contiguous(self):
        requirements = self.rtm["requirements"]
        self.assertEqual(
            [requirement["id"] for requirement in requirements],
            [f"SC-{number:03d}" for number in range(1, 32)],
        )
        required_fields = {
            "id",
            "statement",
            "source",
            "implementation_files",
            "test_files",
            "verification_commands",
            "evidence",
        }
        for requirement in requirements:
            with self.subTest(requirement=requirement["id"]):
                self.assertTrue(required_fields <= requirement.keys())
                for field in required_fields - {"id"}:
                    value = requirement[field]
                    self.assertTrue(value, f"{requirement['id']} has empty {field}")
                    if isinstance(value, list):
                        self.assertTrue(all(item for item in value))
        self.assertEqual(self.rtm["waivers"], [])
        self.assertRegex(self.rtm["baseline_commit"], r"^[0-9a-f]{7,40}$")

    def test_accepted_deviations_are_explicit_and_not_waivers(self):
        deviations = self.rtm["accepted_deviations"]
        self.assertEqual([item["id"] for item in deviations], ["DEV-001", "DEV-002"])
        for deviation in deviations:
            with self.subTest(deviation=deviation["id"]):
                self.assertFalse(deviation["waiver"])
                self.assertTrue(deviation["compensating_controls"])
                self.assertIn(deviation["id"], self.architecture)
                self.assertIn(deviation["id"], self.plan)
        self.assertIn("not a security or authorization waiver", self.architecture)
        self.assertIn("not waivers", self.plan)

    def test_readme_options_preserve_explicit_installation_contracts(self):
        option_one_heading = "## Option 1 — One-Time Audit (pull the scanner script)"
        option_two_heading = "## Option 2 — App Deployment (install Shore Sentinel into Docker)"
        self.assertEqual(self.readme.count(option_one_heading), 1)
        self.assertEqual(self.readme.count(option_two_heading), 1)

        option_one = self.readme.split(option_one_heading, 1)[1].split("\n---", 1)[0]
        option_two = self.readme.split(option_two_heading, 1)[1].split("\n---", 1)[0]
        self.assertIn("scanner-bundle/bin/Agent_Security_Selfcheck_v3.5.0.py", option_one)
        self.assertIn("Reports and artifacts stay on the client machine", option_one)
        for phrase in (
            "exactly one `shore-sentinel` application container",
            "One named `shore-sentinel-data` volume",
            "`/var/lib/shore-sentinel`",
            "docker compose up -d --build",
            "docker compose ps",
            "curl -fsS http://localhost:4000/health",
            "curl -fsS http://localhost:3010/shore-sentinel",
        ):
            with self.subTest(option_two_contract=phrase):
                self.assertIn(phrase, option_two)

    def test_security_remediations_map_one_to_one_to_dedicated_requirements(self):
        finding_to_requirement = {
            "H-01": "SC-025",
            "H-02": "SC-026",
            "H-03": "SC-027",
            "H-04": "SC-028",
            "H-05": "SC-029",
            "H-06": "SC-030",
            "H-07": "SC-031",
        }
        records = self.rtm["security_remediation_records"]
        requirements = {item["id"]: item for item in self.rtm["requirements"]}
        dedicated_ids = list(finding_to_requirement.values())

        self.assertEqual(len(records), len(finding_to_requirement))
        self.assertEqual(
            [record["finding"] for record in records],
            list(finding_to_requirement),
        )
        self.assertEqual(
            len({record["finding"] for record in records}),
            len(records),
        )

        required_fields = (
            "statement",
            "source",
            "implementation_files",
            "test_files",
            "verification_commands",
            "evidence",
            "negative_test_artifacts",
        )

        def assert_meaningful(value, label):
            if isinstance(value, str):
                self.assertGreater(len(value.strip()), 8, label)
                self.assertNotRegex(value, r"(?i)\b(?:todo|tbd|placeholder|fill[ -]?me)\b", label)
            else:
                self.assertIsInstance(value, list, label)
                self.assertTrue(value, label)
                self.assertTrue(all(isinstance(item, str) and len(item.strip()) > 8 for item in value), label)

        for record in records:
            finding = record["finding"]
            requirement_id = finding_to_requirement[finding]
            requirement = requirements[requirement_id]
            with self.subTest(finding=finding):
                self.assertEqual(record["requirement_ids"], [requirement_id])
                self.assertIn(record["status"], {"resolved", "closed"})
                assert_meaningful(record["resolution"], f"{finding} resolution")
                assert_meaningful(record["evidence"], f"{finding} evidence")
                for field in required_fields:
                    assert_meaningful(requirement[field], f"{requirement_id} {field}")

                artifacts = requirement["negative_test_artifacts"]
                test_files = set(requirement["test_files"])
                artifact_files = {artifact.split(":", 1)[0] for artifact in artifacts}
                self.assertTrue(artifact_files <= test_files)
                self.assertNotIn("tests/test_architecture_document_invariants.py", artifact_files)

        self.assertEqual(
            {requirement_id for requirement_id in dedicated_ids},
            set(requirements) & set(dedicated_ids),
        )

    def test_single_container_and_volume_contract_is_consistent(self):
        self.assertIn("exactly one deployable Shore Sentinel container", self.architecture)
        self.assertIn("exactly one application container", self.plan)
        self.assertEqual(self.rtm["delivery_contract"]["application_container_count"], 1)
        self.assertEqual(self.rtm["delivery_contract"]["persistent_volume_count"], 1)
        self.assertFalse(self.rtm["delivery_contract"]["docker_socket_mount"])
        for retired in ("second Shore Sentinel container", "runner host", "runner broker", "Docker socket"):
            self.assertIn(retired, self.architecture)
        self.assertIn("no second runner host/container", self.plan)
        self.assertIn("No runner broker", self.plan)
        self.assertIn("Docker socket", self.plan)

    def test_readme_update_instructions_fail_closed(self):
        update_section = self.readme.split("## Updating Shore Sentinel", 1)[1]
        self.assertIn("currently **unavailable", update_section)
        self.assertIn("signed immutable commit/tag", update_section)
        self.assertIn("encrypted access-separated off-volume backup", update_section)
        self.assertIn("must be rejected", update_section)
        self.assertNotIn("git pull --ff-only origin main", update_section)
        self.assertNotIn("docker compose up -d --build", update_section)
        self.assertNotIn("SHORE_SENTINEL_UPDATE_ALLOW_DIRTY", update_section)

    def test_architecture_has_no_untracked_high_finding_language(self):
        self.assertNotRegex(self.documents, r"(?i)security review.*\b(?:critical|high)\b.*\b(?:waive|waiver|accepted)\b")
        self.assertIn("zero unresolved Critical or High findings", self.architecture)
        self.assertIn("zero unresolved Critical/High findings", self.plan)


if __name__ == "__main__":
    unittest.main()
