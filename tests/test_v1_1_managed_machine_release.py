import json
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def package(relative: str) -> dict:
    return json.loads((ROOT / relative).read_text(encoding="utf-8"))


class V11ManagedMachineReleaseTests(unittest.TestCase):
    def test_release_packages_are_versioned_1_1_0(self):
        for relative in ("package.json", "api/package.json", "web/package.json", "workers/worker-node/package.json"):
            with self.subTest(package=relative):
                self.assertEqual(package(relative)["version"], "1.1.0")

    def test_readme_documents_directory_scope_for_managed_ssh_scans(self):
        readme = (ROOT / "README.md").read_text(encoding="utf-8")
        self.assertIn("Directory to scan", readme)
        self.assertIn("managed machine", readme.lower())
        self.assertIn("SSH", readme)
        self.assertIn("one-time local audit", readme.lower())


if __name__ == "__main__":
    unittest.main()
