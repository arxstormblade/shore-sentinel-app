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
        services = re.findall(r"^  ([a-z][a-z0-9-]*):\n", self.compose.split("volumes:", 1)[0], flags=re.MULTILINE)
        self.assertEqual(services, ["shore-sentinel"])
        self.assertIn("shore-sentinel-data:/var/lib/shore-sentinel", self.compose)
        for path in ("postgres", "redis", "object-storage", "evidence"):
            self.assertIn(f"/var/lib/shore-sentinel/{path}", self.dockerfile)

    def test_image_and_supervisor_define_seven_distinct_processes(self):
        self.assertRegex(self.dockerfile, r"(?m)^FROM [^\s]+@sha256:[0-9a-f]{64} AS runtime$")
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

    def test_process_environment_contract_is_allowlisted(self):
        contract = json.loads((ROOT / "container" / "process-environment-contract.json").read_text(encoding="utf-8"))
        self.assertEqual(set(contract["processes"]), {"web", "api", "worker-node", "worker-python", "postgres", "redis", "minio", "migration"})
        for process in contract["processes"].values():
            self.assertNotIn("TARGET_PASSWORD", process["allowed"])
            self.assertNotIn("MINIO_ROOT_PASSWORD", process["allowed"])


if __name__ == "__main__":
    unittest.main()
