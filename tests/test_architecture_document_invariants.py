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

    def test_each_security_review_blocker_has_architecture_plan_and_rtm_contract(self):
        controls = {
            "H-01": ("SC-025", ("JWKS", "PKCE", "durable", "ACR/AMR", "dual")),
            "H-02": ("SC-026", ("mTLS", "OpenBao", "envelope", "rotation", "attempt-bound")),
            "H-03": ("SC-027", ("cgroup v2", "seccomp", "AppArmor", "ptrace", "startup refusal")),
            "H-04": ("SC-028", ("WORM", "keyed", "monotonic", "legal hold", "truncation")),
            "H-05": ("SC-029", ("DLP", "prompt-injection", "typed", "quarantine", "detector outage")),
            "H-06": ("SC-030", ("signature", "trust roots", "anti-rollback", "provenance", "unavailable")),
            "H-07": ("SC-031", ("off-volume", "encrypted", "quiesce", "RPO/RTO", "fresh empty")),
        }
        requirements = {item["id"]: item for item in self.rtm["requirements"]}
        records = {item["finding"]: item for item in self.rtm["security_remediation_records"]}
        for finding, (requirement_id, keywords) in controls.items():
            with self.subTest(finding=finding):
                self.assertIn(requirement_id, records[finding]["requirement_ids"])
                self.assertIn(requirement_id, requirements)
                self.assertTrue(all(keyword.lower() in self.documents.lower() for keyword in keywords))
                self.assertIn("tests/test_architecture_document_invariants.py", requirements[requirement_id]["test_files"])

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
