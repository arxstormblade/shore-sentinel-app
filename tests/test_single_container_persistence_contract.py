import json
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


class SingleContainerPersistenceContractTests(unittest.TestCase):
    def test_named_volume_and_backup_restore_runbook_are_explicit(self):
        compose = (ROOT / "docker-compose.yml").read_text(encoding="utf-8")
        self.assertIn("shore-sentinel-data:", compose)
        self.assertIn("/var/lib/shore-sentinel", compose)
        runbook = (ROOT / "docs/runbooks/single-container-backup-restore.md").read_text(encoding="utf-8")
        for marker in ("pg_dump", "redis", "object", "evidence", "encrypted", "fresh empty volume", "rollback"):
            self.assertIn(marker.lower(), runbook.lower())

    def test_runtime_backup_script_is_safe_and_supports_restore(self):
        script = (ROOT / "container" / "backup-restore.sh").read_text(encoding="utf-8")
        self.assertIn("set -eu", script)
        self.assertIn("umask 077", script)
        self.assertIn("backup", script)
        self.assertIn("restore", script)
        self.assertIn("pg_dump", script)
        self.assertIn("sha256sum", script)
        self.assertNotIn("POSTGRES_PASSWORD=", script)

    def test_runtime_backup_script_matches_documented_mode_first_interface(self):
        script = (ROOT / "container" / "backup-restore.sh").read_text(encoding="utf-8")
        self.assertRegex(script, r"(?m)^MODE=\$\{1:-\}$")
        self.assertRegex(script, r"(?m)^BACKUP_DIR=\$\{2:\?usage: backup-restore\.sh backup\|restore\|rollback <directory>\}$")

    def test_migrations_are_versioned_and_have_checksums(self):
        migrations = sorted((ROOT / "api/migrations").glob("*.sql"))
        self.assertEqual([p.name for p in migrations], [
            "0001_baseline.sql",
            "0002_enterprise_authorization.sql",
            "0003_evidence-findings-read-model.sql",
            "0004_single-container-runtime.sql",
        ])
        for migration in migrations:
            content = migration.read_text(encoding="utf-8")
            self.assertRegex(content, r"(?i)BEGIN|CREATE TABLE")
        runner = (ROOT / "api/src/migration-runner.ts").read_text(encoding="utf-8")
        for marker in ("pg_advisory_lock", "sha256", "schema_migrations", "lock_timeout"):
            self.assertIn(marker, runner)

    def test_database_module_does_not_mutate_schema_or_rehash_seed_on_startup(self):
        database = (ROOT / "api/src/database.service.ts").read_text(encoding="utf-8")
        self.assertNotIn("SCHEMA_SQL", database)
        self.assertNotIn("bcrypt", database)
        self.assertNotIn("async migrate()", database)
        self.assertNotIn("async seed()", database)
        self.assertIn("schema_migrations", database)

    def test_traceability_registers_runtime_and_migration_controls(self):
        register = json.loads((ROOT / "docs/qa/2026-07-22-enterprise-single-container-requirements.json").read_text(encoding="utf-8"))
        requirements = {item["id"]: item for item in register["requirements"]}
        for identifier in ("SC-001", "SC-002", "SC-003", "SC-008", "SC-009", "SC-017", "SC-018", "SC-020", "SC-021", "SC-024", "SC-031"):
            self.assertIn(identifier, requirements)
            for field in ("source", "implementation_files", "test_files", "verification_commands", "evidence"):
                self.assertTrue(requirements[identifier].get(field), f"{identifier} missing {field}")


if __name__ == "__main__":
    unittest.main()
