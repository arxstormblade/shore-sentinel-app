import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
COMPOSE = (ROOT / "docker-compose.yml").read_text(encoding="utf-8")


def service_block(service: str) -> str:
    match = re.search(
        rf"^  {re.escape(service)}:\n(?P<body>.*?)(?=^  [a-z][a-z0-9-]*:\n|^volumes:|\Z)",
        COMPOSE,
        flags=re.MULTILINE | re.DOTALL,
    )
    if match is None:
        raise AssertionError(f"service {service!r} is missing from docker-compose.yml")
    return match.group("body")


class ComposeNetworkExposureTests(unittest.TestCase):
    def test_only_web_and_api_publish_host_ports(self):
        for service in ("postgres", "redis", "minio", "minio-init", "worker-python", "worker-node"):
            with self.subTest(service=service):
                self.assertNotRegex(service_block(service), r"(?m)^    ports:")

        for service in ("api", "web"):
            with self.subTest(service=service):
                self.assertRegex(service_block(service), r"(?m)^    ports:")


class PrivateWorkerNetworkTests(unittest.TestCase):
    def test_python_parser_is_authenticated_and_on_an_internal_worker_network(self):
        python_worker = service_block("worker-python")
        node_worker = service_block("worker-node")

        self.assertRegex(
            python_worker,
            r"(?m)^      INTERNAL_WORKER_TOKEN: \$\{INTERNAL_WORKER_TOKEN:\?[^}]+\}$",
        )
        self.assertRegex(python_worker, r"(?m)^    networks: \[worker-private\]$")
        self.assertRegex(node_worker, r"(?m)^    networks: \[backend, worker-private, worker-egress\]$")
        self.assertRegex(COMPOSE, r"(?m)^  worker-private:\n    internal: true$")


class WorkerNodeEgressTests(unittest.TestCase):
    def test_ssh_worker_concurrency_is_immutable_at_one(self):
        node_worker = service_block("worker-node")

        self.assertRegex(node_worker, r"(?m)^      WORKER_CONCURRENCY: 1$")
        self.assertNotIn("${WORKER_CONCURRENCY", node_worker)

    def test_node_worker_has_a_dedicated_egress_network_without_exposing_the_parser(self):
        node_worker = service_block("worker-node")
        parser = service_block("worker-python")

        self.assertRegex(node_worker, r"(?m)^    networks: \[backend, worker-private, worker-egress\]$")
        self.assertRegex(node_worker, r"(?m)^      API_URL: http://api:4000$")
        self.assertRegex(node_worker, r"(?m)^      PYTHON_WORKER_URL: http://worker-python:4100$")
        self.assertRegex(COMPOSE, r"(?m)^  worker-egress:\n(?!    internal: true$)")
        self.assertNotIn("worker-egress", parser)
        self.assertRegex(parser, r"(?m)^    networks: \[worker-private\]$")


class LockfileReproducibleImageTests(unittest.TestCase):
    def test_api_image_uses_the_root_lockfile_for_build_and_production_dependencies(self):
        dockerfile = (ROOT / "api/Dockerfile").read_text(encoding="utf-8")

        self.assertIn("COPY package.json package-lock.json ./", dockerfile)
        self.assertNotIn("npm install", dockerfile)
        self.assertIn("FROM node:20.18.0-alpine3.20 AS production-deps", dockerfile)
        self.assertIn("RUN npm ci --omit=dev", dockerfile)
        self.assertIn("COPY --from=production-deps --chown=shore:shore /app/node_modules ./node_modules", dockerfile)
        self.assertIn("RUN npm ci\n", dockerfile)
        self.assertIn("COPY --from=deps /app/ ./", dockerfile)

    def test_node_worker_image_installs_production_dependencies_from_the_root_lockfile(self):
        dockerfile = (ROOT / "workers/worker-node/Dockerfile").read_text(encoding="utf-8")

        self.assertIn("COPY package.json package-lock.json ./", dockerfile)
        self.assertNotIn("npm install", dockerfile)
        self.assertIn("RUN npm ci --omit=dev -w workers/worker-node", dockerfile)

    def test_web_image_installs_dependencies_from_the_root_lockfile(self):
        dockerfile = (ROOT / "web/Dockerfile").read_text(encoding="utf-8")

        self.assertIn("COPY package.json package-lock.json ./", dockerfile)
        self.assertNotIn("npm install", dockerfile)
        self.assertIn("RUN npm ci", dockerfile)


class MinioAccessTests(unittest.TestCase):
    def test_artifact_bucket_is_private_after_initialization(self):
        init = service_block("minio-init")
        self.assertIn("mc anonymous set none", init)
        self.assertNotIn("mc anonymous set download", init)


class ProductionSecretDeliveryTests(unittest.TestCase):
    def test_compose_requires_explicit_secret_values_without_insecure_defaults(self):
        self.assertNotRegex(COMPOSE, r"\$\{(?:POSTGRES_PASSWORD|MINIO_ACCESS_KEY|MINIO_SECRET_KEY|SEED_ADMIN_PASSWORD):-[^}]+\}")

        required_api_secrets = (
            "POSTGRES_PASSWORD",
            "MINIO_ACCESS_KEY",
            "MINIO_SECRET_KEY",
            "SEED_ADMIN_PASSWORD",
            "SHORE_SENTINEL_SECRET_KEY",
            "INTERNAL_WORKER_TOKEN",
        )
        api = service_block("api")
        for variable in required_api_secrets:
            with self.subTest(variable=variable):
                self.assertRegex(api, rf"(?m)^      {variable}: \$\{{{variable}:\?[^}}]+\}}$")

    def test_deployable_node_services_are_unconditionally_production(self):
        for service in ("api", "web", "worker-node"):
            with self.subTest(service=service):
                self.assertRegex(
                    service_block(service),
                    r"(?m)^      NODE_ENV: production$",
                )
                self.assertNotIn("${NODE_ENV:-development}", service_block(service))

    def test_compose_does_not_implicitly_load_development_placeholders(self):
        for service in ("api", "web", "worker-node"):
            with self.subTest(service=service):
                self.assertNotIn("env_file: [.env.example]", service_block(service))

    def test_internal_worker_token_is_required_and_shared_by_api_and_node_worker(self):
        for service in ("api", "worker-node"):
            with self.subTest(service=service):
                self.assertRegex(
                    service_block(service),
                    r"(?m)^      INTERNAL_WORKER_TOKEN: \$\{INTERNAL_WORKER_TOKEN:\?[^}]+\}$",
                )

        environment_example = (ROOT / ".env.example").read_text(encoding="utf-8")
        self.assertRegex(environment_example, r"(?m)^INTERNAL_WORKER_TOKEN=replace-me-internal-worker-token$")


class ContainerHardeningTests(unittest.TestCase):
    def test_api_and_worker_images_run_as_dedicated_nonroot_users(self):
        for relative in (
            "api/Dockerfile",
            "workers/worker-node/Dockerfile",
            "workers/worker-python/Dockerfile",
        ):
            with self.subTest(dockerfile=relative):
                dockerfile = (ROOT / relative).read_text(encoding="utf-8")
                self.assertRegex(dockerfile, r"(?m)^USER (?!root$)[a-z][a-z0-9_-]*$")

    def test_compose_restricts_application_container_privileges(self):
        for service in ("api", "web", "worker-python", "worker-node"):
            with self.subTest(service=service):
                block = service_block(service)
                self.assertIn("security_opt: [no-new-privileges:true]", block)
                self.assertIn("cap_drop: [ALL]", block)

        python_worker = service_block("worker-python")
        self.assertIn("read_only: true", python_worker)
        self.assertIn("tmpfs: [/tmp]", python_worker)


class ComposeSmokeTests(unittest.TestCase):
    def test_smoke_resolves_only_the_explicit_development_override_without_starting_services(self):
        smoke_script = (ROOT / "scripts" / "compose_smoke.py").read_text(encoding="utf-8")
        command = '["docker", "compose", "--env-file", ".env.example", "-f", "docker-compose.yml", "-f", "docker-compose.dev.yml", "config", "--quiet"]'
        self.assertIn(command, smoke_script)
        self.assertNotIn('"ps"', smoke_script)


class ImagePinningTests(unittest.TestCase):
    def test_compose_images_use_versioned_release_tags(self):
        images = re.findall(r"(?m)^    image: ([^\s]+)$", COMPOSE)
        self.assertTrue(images)
        for image in images:
            with self.subTest(image=image):
                self.assertNotIn(":latest", image)
                # Docker Official Images do not use a uniform version-component
                # count: Postgres publishes 16.4-alpine3.20 while Redis publishes
                # 7.4.1-alpine3.20. Require an explicit upstream release plus an
                # explicit Alpine release, rather than rejecting a valid pinned
                # Postgres release tag solely because it omits a patch component.
                self.assertRegex(
                    image,
                    r"^(?:postgres|redis):\d+\.\d+(?:\.\d+)?-alpine\d+\.\d+$|^minio/(?:minio|mc):RELEASE\.\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}Z$",
                )

    def test_application_dockerfiles_pin_runtime_base_images(self):
        for relative in (
            "api/Dockerfile",
            "web/Dockerfile",
            "workers/worker-node/Dockerfile",
            "workers/worker-python/Dockerfile",
        ):
            with self.subTest(dockerfile=relative):
                dockerfile = (ROOT / relative).read_text(encoding="utf-8")
                for image in re.findall(r"(?m)^FROM ([^\s]+)", dockerfile):
                    self.assertRegex(image, r"^(?:node|python):\d+\.\d+\.\d+-alpine\d+\.\d+$")


if __name__ == "__main__":
    unittest.main()
