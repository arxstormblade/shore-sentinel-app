import json
import os
import re
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


class SingleContainerRuntimeContractTests(unittest.TestCase):
    def setUp(self):
        self.compose = (ROOT / "docker-compose.yml").read_text(encoding="utf-8")
        self.dockerfile = (ROOT / "container" / "Dockerfile").read_text(encoding="utf-8")
        self.supervisor = (ROOT / "container" / "supervisord.conf").read_text(encoding="utf-8")
        self.entrypoint = (ROOT / "container" / "entrypoint.sh").read_text(encoding="utf-8")
        self.healthcheck = (ROOT / "container/healthcheck.sh").read_text(encoding="utf-8")
        self.capability_check = (ROOT / "container/capability-check.sh").read_text(encoding="utf-8")
        self.object_storage_bootstrap = (ROOT / "container/object-storage-bootstrap.mjs").read_text(encoding="utf-8")

    def parsed_compose(self):
        environment = os.environ.copy()
        environment.update({
            "POSTGRES_PASSWORD": "runtime-test-postgres-password-1234567890",
            "MINIO_ACCESS_KEY": "runtime-test-minio-access",
            "MINIO_SECRET_KEY": "runtime-test-minio-secret-1234567890",
            "SEED_ADMIN_PASSWORD": "runtime-test-seed-password-1234567890",
            "SHORE_SENTINEL_SECRET_KEY": "runtime-test-shore-secret-1234567890",
            "INTERNAL_WORKER_TOKEN": "runtime-test-worker-token-1234567890",
        })
        result = subprocess.run(
            ["docker", "compose", "--env-file", "/dev/null", "config", "--format", "json"],
            cwd=ROOT,
            env=environment,
            check=True,
            capture_output=True,
            text=True,
        )
        return json.loads(result.stdout)

    def test_production_has_one_application_service_and_one_volume(self):
        model = self.parsed_compose()
        self.assertEqual(set(model["services"]), {"shore-sentinel"})
        service = model["services"]["shore-sentinel"]
        self.assertNotIn("platforms", service["build"])
        self.assertEqual(service["labels"]["org.opencontainers.image.version"], "1.1.0")
        self.assertEqual(service["volumes"], [{
            "type": "volume",
            "source": "shore-sentinel-data",
            "target": "/var/lib/shore-sentinel",
            "volume": {},
        }])
        self.assertEqual(set(model["volumes"]), {"shore-sentinel-data"})
        for path in ("postgres", "redis", "object-storage", "evidence"):
            self.assertIn(f"/var/lib/shore-sentinel/{path}", self.dockerfile)

    def test_image_and_supervisor_define_seven_distinct_processes(self):
        self.assertRegex(self.dockerfile, r"(?m)^FROM [^\s]+@sha256:[0-9a-f]{64} AS runtime$")
        self.assertRegex(self.dockerfile, r"(?m)^FROM --platform=\$BUILDPLATFORM [^\s]+@sha256:[0-9a-f]{64} AS dependencies$")
        self.assertRegex(self.dockerfile, r"(?m)^FROM --platform=\$BUILDPLATFORM dependencies AS build$")
        self.assertRegex(self.dockerfile, r"(?m)^FROM [^\s]+@sha256:[0-9a-f]{64} AS runtime-dependencies$")
        self.assertIn("npm ci --omit=dev --ignore-scripts", self.dockerfile)
        for user in ("shore-web", "shore-api", "shore-worker", "shore-parser", "shore-postgres", "shore-redis", "shore-minio"):
            self.assertRegex(self.dockerfile, rf"adduser[^\n]*{re.escape(user)}")
        for process in ("postgres", "redis", "minio", "api", "worker-node", "worker-python", "web"):
            self.assertIn(f"program:{process}", self.supervisor)
        self.assertIn("stopasgroup=true", self.supervisor)
        self.assertIn("killasgroup=true", self.supervisor)
        self.assertIn("stdout_logfile=/dev/fd/1", self.supervisor)
        self.assertIn("stderr_logfile=/dev/fd/2", self.supervisor)

    def test_entrypoint_migrates_before_supervisor_and_health_is_fail_closed(self):
        self.assertRegex(self.entrypoint, r"shore-sentinel migrate")
        self.assertRegex(self.entrypoint, r"exec\s+[^\n]*supervisord")
        self.assertIn("ensure_postgres_database", self.entrypoint)
        self.assertIn("createdb", self.entrypoint)
        self.assertLess(self.entrypoint.index("ensure_postgres_database"), self.entrypoint.index("shore-sentinel migrate"))
        self.assertIn("object-storage-bootstrap.mjs", self.entrypoint)
        self.assertLess(self.entrypoint.index("object-storage-bootstrap.mjs"), self.entrypoint.index("shore-sentinel migrate"))
        for dependency in ("postgres", "redis", "minio", "api", "worker-node", "worker-python", "web"):
            self.assertIn(dependency, self.healthcheck)
        self.assertNotIn("exit 0", self.healthcheck)

    def test_postgres_bootstrap_is_scram_socket_explicit_and_recovers_partial_init(self):
        run_process = (ROOT / "container" / "run-process.sh").read_text(encoding="utf-8")
        self.assertIn("--auth-local=scram-sha-256", self.entrypoint)
        self.assertIn("--auth-host=scram-sha-256", self.entrypoint)
        self.assertIn("unix_socket_directories=/run/postgresql", self.entrypoint)
        self.assertIn("unix_socket_directories=/run/postgresql", run_process)
        self.assertIn('test -s "$PGDATA/PG_VERSION"', self.entrypoint)
        self.assertIn('find "$PGDATA" -mindepth 1 -maxdepth 1', self.entrypoint)
        self.assertIn('rm -rf -- {} +', self.entrypoint)

    def test_bootstrap_database_checks_use_password_authentication(self):
        self.assertIn("PGPASSWORD=\"$POSTGRES_PASSWORD\"", self.entrypoint)
        self.assertIn("--owner=\"$POSTGRES_USER\"", self.entrypoint)

    def test_runtime_smoke_covers_persistence_integrity_shutdown_and_backup_primitives(self):
        smoke = (ROOT / "tests" / "single_container_runtime_smoke.sh").read_text(encoding="utf-8")
        for marker in (
            "pg_get_userbyid(datdba)",
            "schema_migrations",
            "sha256sum",
            "runtime-persistence-marker",
            "docker stop -t",
            "backup-restore.sh backup",
            "backup-restore.sh rollback",
        ):
            self.assertIn(marker, smoke)
        self.assertIn(
            '-e DATABASE_URL="postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@127.0.0.1:5432/${POSTGRES_DB}"',
            smoke,
        )
        self.assertNotRegex(smoke, r"DATABASE_URL=.*:\*+@")
        self.assertIn("backup-restore.sh restore", smoke)

    def test_no_docker_socket_or_privileged_runtime(self):
        service = self.parsed_compose()["services"]["shore-sentinel"]
        self.assertNotIn("docker.sock", json.dumps(service))
        self.assertNotIn("privileged", service)
        self.assertIn("no-new-privileges:true", service["security_opt"])
        self.assertEqual(service["cap_drop"], ["ALL"])
        self.assertEqual(service["cap_add"], ["CHOWN", "SETGID", "SETUID"])

    def test_supervised_dependents_wait_for_local_readiness(self):
        run_process = (ROOT / "container" / "run-process.sh").read_text(encoding="utf-8")
        self.assertIn("wait_for_url()", run_process)
        self.assertIn("wait_for_url http://127.0.0.1:9000/minio/health/live", run_process)
        self.assertIn("wait_for_url http://127.0.0.1:4000/health", run_process)
        self.assertIn("wait_for_url http://127.0.0.1:4100/health", run_process)

    def test_capability_check_decodes_cap_eff_and_rejects_extra_capabilities(self):
        self.assertIn("CapEff", self.capability_check)
        self.assertIn("CAP_CHOWN", self.capability_check)
        self.assertIn("CAP_SETUID", self.capability_check)
        self.assertIn("CAP_SETGID", self.capability_check)
        self.assertIn("unexpected effective capabilities", self.capability_check)
        self.assertNotIn("SYS_ADMIN", self.capability_check)
        self.assertNotIn("NET_ADMIN", self.capability_check)

    def test_healthcheck_parses_supervisor_state_and_rejects_duplicate_services(self):
        self.assertIn("supervisorctl status", self.healthcheck)
        self.assertIn("RUNNING", self.healthcheck)
        self.assertIn("ps -o args", self.healthcheck)
        self.assertIn("count", self.healthcheck)
        self.assertIn("= 1", self.healthcheck)

    def test_object_storage_bootstrap_removes_anonymous_policy_idempotently(self):
        self.assertIn("DeleteBucketPolicyCommand", self.object_storage_bootstrap)
        self.assertIn("NoSuchBucketPolicy", self.object_storage_bootstrap)
        self.assertIn("HeadBucketCommand", self.object_storage_bootstrap)
        self.assertIn("anonymous access probe returned", self.object_storage_bootstrap)

    def test_entrypoint_cleans_bootstrap_password_file_on_failure(self):
        self.assertIn("trap cleanup_bootstrap_password EXIT INT TERM", self.entrypoint)
        self.assertIn('rm -f "${password_file:-}"', self.entrypoint)
        self.assertIn("trap - EXIT INT TERM", self.entrypoint)

    def test_process_environment_contract_is_allowlisted(self):
        contract = json.loads((ROOT / "container" / "process-environment-contract.json").read_text(encoding="utf-8"))
        self.assertEqual(set(contract["processes"]), {"web", "api", "worker-node", "worker-python", "postgres", "redis", "minio", "migration"})
        for process in contract["processes"].values():
            self.assertNotIn("TARGET_PASSWORD", process["allowed"])
            self.assertNotIn("MINIO_ROOT_PASSWORD", process["allowed"])


if __name__ == "__main__":
    unittest.main()
