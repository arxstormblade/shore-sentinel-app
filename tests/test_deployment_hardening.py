import json
import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
COMPOSE = (ROOT / "docker-compose.yml").read_text(encoding="utf-8")


def service_block(service: str) -> str:
    match = re.search(rf"^  {re.escape(service)}:\n(?P<body>.*?)(?=^  [a-z][a-z0-9-]*:\n|^volumes:|\Z)", COMPOSE, re.MULTILINE | re.DOTALL)
    if match is None:
        raise AssertionError(f"service {service!r} is missing")
    return match.group("body")


class SingleContainerComposeTests(unittest.TestCase):
    def test_only_one_service_and_one_persistent_volume_exist(self):
        self.assertEqual(re.findall(r"^  ([a-z][a-z0-9-]*):\n", COMPOSE.split("volumes:", 1)[0], re.MULTILINE), ["shore-sentinel"])
        self.assertIn("shore-sentinel-data:/var/lib/shore-sentinel", COMPOSE)
        self.assertIn("shore-sentinel-data:", COMPOSE)
        self.assertNotIn("docker.sock", COMPOSE)

    def test_application_publishes_only_ui_and_api_and_is_hardened(self):
        block = service_block("shore-sentinel")
        self.assertRegex(block, r"(?m)^    ports:")
        self.assertIn("read_only: true", block)
        self.assertIn("no-new-privileges:true", block)
        self.assertIn("cap_drop:", block)
        self.assertIn("healthcheck:", block)

    def test_runtime_manifest_contains_distinct_users_and_process_allowlist(self):
        dockerfile = (ROOT / "container/Dockerfile").read_text(encoding="utf-8")
        self.assertRegex(dockerfile, r"(?m)^FROM node:[^\s]+@sha256:[0-9a-f]{64} AS runtime$")
        for user in ("shore-web", "shore-api", "shore-worker", "shore-parser", "shore-postgres", "shore-redis", "shore-minio"):
            self.assertIn(user, dockerfile)
        contract = json.loads((ROOT / "container/process-environment-contract.json").read_text(encoding="utf-8"))
        self.assertEqual(set(contract["processes"]), {"migration", "postgres", "redis", "minio", "api", "worker-node", "worker-python", "web"})
        self.assertIn("TARGET_PRIVATE_KEY", contract["forbidden"])


class MigrationAndRecoveryTests(unittest.TestCase):
    def test_database_startup_only_checks_migrations(self):
        source = (ROOT / "api/src/database.service.ts").read_text(encoding="utf-8")
        self.assertIn("schema_migrations", source)
        self.assertNotIn("SCHEMA_SQL", source)
        self.assertNotIn("bcrypt", source)
        self.assertNotIn("async migrate()", source)
        self.assertNotIn("async seed()", source)

    def test_backup_restore_has_hash_manifest_and_no_socket_or_plaintext_assignment(self):
        script = (ROOT / "container/backup-restore.sh").read_text(encoding="utf-8")
        self.assertIn("sha256sum", script)
        self.assertIn("manifest.sha256", script)
        self.assertIn("pg_dump", script)
        self.assertIn("pg_restore", script)
        self.assertNotIn("docker.sock", script)
        self.assertNotRegex(script, r"POSTGRES_PASSWORD\s*=")


if __name__ == "__main__":
    unittest.main()
