import json
import shlex
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
EGRESS_CONTRACT = ROOT / "docs" / "security" / "worker-node-egress-acl-contract.md"
EGRESS_CHECKER = ROOT / "scripts" / "check_worker_node_egress_policy.py"
EGRESS_POLICY = ROOT / "infra" / "egress-acl" / "server-authoritative-policy.example.json"
FIXTURE_SPEC = ROOT / "infra" / "ssh-fixture" / "fixture-contract.json"
FIXTURE_GUIDE = ROOT / "docs" / "security" / "disposable-ssh-fixture.md"
FIXTURE_HARNESS = ROOT / "scripts" / "check_disposable_ssh_fixture.py"
FORCE_COMMAND_ADAPTER = ROOT / "infra" / "ssh-fixture" / "force-command-dispatch"
SUDOERS_RULE = ROOT / "infra" / "ssh-fixture" / "shore-sentinel-scanner-runner.sudoers"


class ForceCommandProtocolDispatchTests(unittest.TestCase):
    REQUEST_ID = "123e4567-e89b-12d3-a456-426614174000"
    RUNNER = "/usr/local/lib/shore-sentinel/run-scan"
    ADAPTER = "/usr/local/lib/shore-sentinel/force-command-dispatch"

    def run_adapter(self, original_command: str) -> tuple[subprocess.CompletedProcess[str], str]:
        source = FORCE_COMMAND_ADAPTER.read_text(encoding="utf-8")
        with tempfile.TemporaryDirectory() as directory:
            directory_path = Path(directory)
            invocation = directory_path / "sudo-invocation"
            fake_sudo = directory_path / "sudo"
            fake_sudo.write_text(
                "#!/usr/bin/env bash\nset -euo pipefail\nprintf '<%s>\\n' \"$@\" > "
                f"{shlex.quote(str(invocation))}\n",
                encoding="utf-8",
            )
            fake_sudo.chmod(0o700)
            adapter = directory_path / "force-command-dispatch"
            adapter.write_text(
                source.replace("exec /usr/bin/sudo", f"exec {shlex.quote(str(fake_sudo))}"),
                encoding="utf-8",
            )
            adapter.chmod(0o700)
            completed = subprocess.run(
                ["bash", str(adapter)],
                env={"PATH": "/usr/bin:/bin", "SSH_ORIGINAL_COMMAND": original_command},
                check=False,
                capture_output=True,
                text=True,
                timeout=2,
            )
            return completed, invocation.read_text(encoding="utf-8") if invocation.exists() else ""

    def test_fixture_requires_a_root_owned_force_command_adapter_that_dispatches_only_fixed_protocol(self):
        self.assertTrue(FORCE_COMMAND_ADAPTER.is_file(), "missing root-owned ForceCommand protocol adapter asset")
        self.assertTrue(SUDOERS_RULE.is_file(), "missing constrained scanner sudoers asset")
        spec = json.loads(FIXTURE_SPEC.read_text(encoding="utf-8"))
        self.assertEqual(spec["account"]["force_command"], self.ADAPTER)
        self.assertEqual(spec["ownership"]["force_command_adapter"], "root:root:0755")
        self.assertEqual(spec["privilege_adapter"]["adapter"], self.ADAPTER)
        self.assertEqual(spec["privilege_adapter"]["sudo_binary"], "/usr/bin/sudo")
        self.assertEqual(spec["privilege_adapter"]["sudoers_asset"], "infra/ssh-fixture/shore-sentinel-scanner-runner.sudoers")

        request = f"{self.RUNNER} --request {self.REQUEST_ID}"
        cancellation = f"{self.RUNNER} --cancel-request {self.REQUEST_ID}"
        staging = f"{self.RUNNER} --stage-request {self.REQUEST_ID}"
        for command, expected in (
            (request, f"<-n>\n<{self.RUNNER}>\n<--request>\n<{self.REQUEST_ID}>\n"),
            (cancellation, f"<-n>\n<{self.RUNNER}>\n<--cancel-request>\n<{self.REQUEST_ID}>\n"),
            (staging, f"<-n>\n<{self.RUNNER}>\n<--stage-request>\n<{self.REQUEST_ID}>\n"),
        ):
            with self.subTest(command=command):
                completed, invocation = self.run_adapter(command)
                self.assertEqual(completed.returncode, 0, completed.stderr)
                self.assertEqual(completed.stdout, "")
                self.assertEqual(completed.stderr, "")
                self.assertEqual(invocation, expected)

        rejected_commands = (
            "",
            self.RUNNER,
            f"{self.RUNNER} --request",
            f"{self.RUNNER} --request {self.REQUEST_ID} extra",
            f"{self.RUNNER} --request {self.REQUEST_ID}; id",
            f"{self.RUNNER} --request not-a-uuid",
            f"/tmp/run-scan --request {self.REQUEST_ID}",
            f"{self.RUNNER} --REQUEST {self.REQUEST_ID}",
            f"{self.RUNNER} --cancel-request {self.REQUEST_ID} ",
            f"{self.RUNNER} --stage-request {self.REQUEST_ID} extra",
            f"{self.RUNNER} --stage-request not-a-uuid",
            f"{self.RUNNER} --write-request /tmp/request.json",
            f"sudo -n {self.RUNNER} --request {self.REQUEST_ID}",
        )
        for command in rejected_commands:
            with self.subTest(command=command):
                completed, invocation = self.run_adapter(command)
                self.assertEqual(completed.returncode, 64)
                self.assertEqual(completed.stdout, "REJECTED\n")
                self.assertEqual(completed.stderr, "")
                self.assertEqual(invocation, "")

        source = FORCE_COMMAND_ADAPTER.read_text(encoding="utf-8")
        self.assertIn("SSH_ORIGINAL_COMMAND", source)
        self.assertIn("[[ $# -eq 0 ]] || reject", source)
        self.assertIn("exec /usr/bin/sudo -n \"$RUNNER\"", source)
        self.assertNotRegex(source, r"\beval\b|\b(?:ba)?sh\s+-c\b|\$\(.*SSH_ORIGINAL_COMMAND")
        self.assertNotRegex(source, r"(?m)exec[^\n]*SSH_ORIGINAL_COMMAND|^\s*(?:source|\.)\s+")
        self.assertNotIn("$@", source)

        sudoers = SUDOERS_RULE.read_text(encoding="utf-8")
        self.assertIn("Defaults:scanner env_reset", sudoers)
        self.assertIn("NOSETENV:", sudoers)
        self.assertIn(self.RUNNER, sudoers)
        self.assertIn("^(", sudoers)
        self.assertIn("--request|--cancel-request|--stage-request", sudoers)
        self.assertNotRegex(sudoers, r"\*|\bSETENV:")


class WorkerNodeEgressEvidenceTests(unittest.TestCase):
    def test_contract_records_a_fail_closed_worker_only_acl_without_claiming_live_enforcement(self):
        self.assertTrue(EGRESS_CONTRACT.is_file(), "missing worker-node egress ACL contract")
        contract = EGRESS_CONTRACT.read_text(encoding="utf-8").lower()

        for required in (
            "compose service `worker-node`",
            "worker-egress",
            "default-deny",
            "unverified local schema input",
            "no caller-supplied cidr",
            "ipv4 /24 through /32",
            "does not authenticate or verify provenance",
            "atomic",
            "rollback",
            "not a live firewall enforcement proof",
            "do not run locally",
        ):
            with self.subTest(required=required):
                self.assertIn(required, contract)

        self.assertIn("dns", contract)
        self.assertIn("https", contract)

    def test_checker_is_check_only_and_rejects_non_schema_or_broad_policy_data(self):
        self.assertTrue(EGRESS_CHECKER.is_file(), "missing check-only egress policy checker")
        self.assertTrue(EGRESS_POLICY.is_file(), "missing server-authoritative policy example")
        source = EGRESS_CHECKER.read_text(encoding="utf-8")
        self.assertNotRegex(source, r"\b(?:iptables|nft|ufw|firewall-cmd|docker\s+compose|curl|requests\.)\b")
        self.assertIn("--render", source)
        self.assertIn("check-only", source.lower())

        accepted = subprocess.run(
            [sys.executable, str(EGRESS_CHECKER), "--policy", str(EGRESS_POLICY)],
            check=False,
            capture_output=True,
            text=True,
            timeout=3,
        )
        self.assertEqual(accepted.returncode, 0, accepted.stderr)
        self.assertIn("CHECK OK", accepted.stdout)

        schema_only_input = {
            "version": 1,
            "source": "unverified-local-schema-input",
            "worker_identity": {
                "compose_project": "shore-sentinel",
                "compose_service": "worker-node",
                "egress_network": "worker-egress",
            },
            "target_authorizations": [
                {
                    "enrollment_id": "123e4567-e89b-12d3-a456-426614174000",
                    "cidr": "192.0.2.45/32",
                    "protocol": "tcp",
                    "port": 22,
                }
            ],
            "optional_resolvers": [],
            "optional_https": [],
        }
        with tempfile.TemporaryDirectory() as directory:
            policy = Path(directory) / "schema-only-input.json"
            policy.write_text(json.dumps(schema_only_input), encoding="utf-8")
            accepted_schema_only = subprocess.run(
                [sys.executable, str(EGRESS_CHECKER), "--policy", str(policy)],
                check=False,
                capture_output=True,
                text=True,
                timeout=3,
            )
        self.assertEqual(accepted_schema_only.returncode, 0, accepted_schema_only.stderr)
        self.assertIn("UNVERIFIED LOCAL SCHEMA INPUT", accepted_schema_only.stdout)
        self.assertNotIn("authoritative", accepted_schema_only.stdout.lower())

        forged_source = dict(schema_only_input)
        forged_source["source"] = "server-authoritative-enrollment-export"
        with tempfile.TemporaryDirectory() as directory:
            policy = Path(directory) / "forged-source.json"
            policy.write_text(json.dumps(forged_source), encoding="utf-8")
            rejected_source = subprocess.run(
                [sys.executable, str(EGRESS_CHECKER), "--policy", str(policy)],
                check=False,
                capture_output=True,
                text=True,
                timeout=3,
            )
        self.assertNotEqual(rejected_source.returncode, 0)
        self.assertIn("REJECTED", rejected_source.stdout)

        for cidr in ("0.0.0.0/1", "192.0.2.0/23", "::/1", "2001:db8::/64"):
            with self.subTest(cidr=cidr), tempfile.TemporaryDirectory() as directory:
                unsafe_cidr = dict(schema_only_input)
                unsafe_cidr["target_authorizations"] = [
                    dict(schema_only_input["target_authorizations"][0], cidr=cidr)
                ]
                policy = Path(directory) / "unsafe-cidr.json"
                policy.write_text(json.dumps(unsafe_cidr), encoding="utf-8")
                rejected_cidr = subprocess.run(
                    [sys.executable, str(EGRESS_CHECKER), "--policy", str(policy)],
                    check=False,
                    capture_output=True,
                    text=True,
                    timeout=3,
                )
                self.assertNotEqual(rejected_cidr.returncode, 0)
                self.assertIn("REJECTED", rejected_cidr.stdout)


class DisposableSshFixtureEvidenceTests(unittest.TestCase):
    def test_fixture_spec_is_approval_gated_and_has_the_required_negative_cases(self):
        self.assertTrue(FIXTURE_SPEC.is_file(), "missing disposable SSH fixture specification")
        spec = json.loads(FIXTURE_SPEC.read_text(encoding="utf-8"))

        self.assertEqual(spec["execution"], "external-approved-only")
        self.assertEqual(spec["host_key"]["verification"], "fixed-sha256-fingerprint-no-tofu")
        self.assertEqual(
            spec["account"]["force_command"],
            "/usr/local/lib/shore-sentinel/force-command-dispatch",
        )
        self.assertEqual(spec["account"]["root_group_membership"], "forbidden")
        self.assertEqual(
            spec["privilege_adapter"],
            {
                "sudoers_file": "/etc/sudoers.d/shore-sentinel-scanner-runner",
                "sudoers_ownership": "root:root:0440",
                "environment_reset": "required",
                "setenv": "forbidden",
                "adapter": "/usr/local/lib/shore-sentinel/force-command-dispatch",
                "adapter_ownership": "root:root:0755",
                "sudo_binary": "/usr/bin/sudo",
                "exact_command": "/usr/local/lib/shore-sentinel/run-scan",
                "sudoers_asset": "infra/ssh-fixture/shore-sentinel-scanner-runner.sudoers",
                "sudoers_arguments": (
                    "^(--request|--cancel-request|--stage-request) "
                    "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-"
                    "[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$"
                ),
            },
        )
        self.assertEqual(spec["ownership"]["force_command_adapter"], "root:root:0755")
        self.assertEqual(spec["ownership"]["runner"], "root:root:0750")
        self.assertEqual(spec["ownership"]["supervisor"], "root:root:0750")
        self.assertEqual(spec["ownership"]["request_root"], "root:root:0700")
        self.assertEqual(
            spec["protected_parent_directories"]["/usr/local/lib/shore-sentinel"],
            "root:root:0755:directory:not-symlink:non-scanner-writable",
        )
        self.assertEqual(
            spec["protected_parent_directories"]["/var/lib/shore-sentinel"],
            "root:root:0755:directory:not-symlink:non-scanner-writable",
        )
        self.assertIn("term-resistant-child", spec["scan_implementations"])
        self.assertIn("allowed-scope", spec["test_cases"])
        self.assertIn("disallowed-scope", spec["test_cases"])
        self.assertIn("symlink-rejection", spec["test_cases"])
        self.assertIn("cancel-term-kill-deadline", spec["test_cases"])
        self.assertIn("duplicate-cancel", spec["test_cases"])
        self.assertIn("client-disconnect", spec["test_cases"])
        self.assertIn("host-key-mismatch", spec["test_cases"])
        self.assertIn("cleanup", spec["test_cases"])

    def test_fixture_checker_rejects_tofu_and_executable_or_writable_runner_layouts(self):
        self.assertTrue(FIXTURE_HARNESS.is_file(), "missing fixture check-only harness")
        self.assertTrue(FIXTURE_GUIDE.is_file(), "missing fixture operator guide")
        source = FIXTURE_HARNESS.read_text(encoding="utf-8")
        self.assertNotRegex(source, r"\b(?:docker\s+(?:compose\s+)?up|subprocess\.(?:run|Popen)|os\.system|ssh-keygen)\b")
        self.assertIn("check-only", source.lower())

        checked = subprocess.run(
            [sys.executable, str(FIXTURE_HARNESS), "--spec", str(FIXTURE_SPEC)],
            check=False,
            capture_output=True,
            text=True,
            timeout=3,
        )
        self.assertEqual(checked.returncode, 0, checked.stderr)
        self.assertIn("CHECK OK", checked.stdout)

        unsafe_tofu = json.loads(FIXTURE_SPEC.read_text(encoding="utf-8"))
        unsafe_tofu["host_key"]["verification"] = "accept-new"
        with tempfile.TemporaryDirectory() as directory:
            spec_path = Path(directory) / "unsafe-tofu.json"
            spec_path.write_text(json.dumps(unsafe_tofu), encoding="utf-8")
            rejected_tofu = subprocess.run(
                [sys.executable, str(FIXTURE_HARNESS), "--spec", str(spec_path)],
                check=False,
                capture_output=True,
                text=True,
                timeout=3,
            )
        self.assertNotEqual(rejected_tofu.returncode, 0)
        self.assertIn("REJECTED", rejected_tofu.stdout)

        unsafe_privilege_adapter = json.loads(FIXTURE_SPEC.read_text(encoding="utf-8"))
        unsafe_privilege_adapter["privilege_adapter"]["setenv"] = "permitted"
        with tempfile.TemporaryDirectory() as directory:
            spec_path = Path(directory) / "unsafe-privilege-adapter.json"
            spec_path.write_text(json.dumps(unsafe_privilege_adapter), encoding="utf-8")
            rejected_privilege_adapter = subprocess.run(
                [sys.executable, str(FIXTURE_HARNESS), "--spec", str(spec_path)],
                check=False,
                capture_output=True,
                text=True,
                timeout=3,
            )
        self.assertNotEqual(rejected_privilege_adapter.returncode, 0)
        self.assertIn("REJECTED", rejected_privilege_adapter.stdout)

        unsafe_supervisor = json.loads(FIXTURE_SPEC.read_text(encoding="utf-8"))
        unsafe_supervisor["ownership"]["supervisor"] = "root:root:0777"
        with tempfile.TemporaryDirectory() as directory:
            spec_path = Path(directory) / "unsafe-supervisor.json"
            spec_path.write_text(json.dumps(unsafe_supervisor), encoding="utf-8")
            rejected_supervisor = subprocess.run(
                [sys.executable, str(FIXTURE_HARNESS), "--spec", str(spec_path)],
                check=False,
                capture_output=True,
                text=True,
                timeout=3,
            )
        self.assertNotEqual(rejected_supervisor.returncode, 0)
        self.assertIn("REJECTED", rejected_supervisor.stdout)

        unsafe_root_group = json.loads(FIXTURE_SPEC.read_text(encoding="utf-8"))
        unsafe_root_group["account"]["root_group_membership"] = "permitted"
        with tempfile.TemporaryDirectory() as directory:
            spec_path = Path(directory) / "unsafe-root-group.json"
            spec_path.write_text(json.dumps(unsafe_root_group), encoding="utf-8")
            rejected_root_group = subprocess.run(
                [sys.executable, str(FIXTURE_HARNESS), "--spec", str(spec_path)],
                check=False,
                capture_output=True,
                text=True,
                timeout=3,
            )
        self.assertNotEqual(rejected_root_group.returncode, 0)
        self.assertIn("REJECTED", rejected_root_group.stdout)

        unsafe_parent = json.loads(FIXTURE_SPEC.read_text(encoding="utf-8"))
        unsafe_parent["protected_parent_directories"]["/var/lib/shore-sentinel"] = (
            "scanner:scanner:0755:directory:not-symlink:non-scanner-writable"
        )
        with tempfile.TemporaryDirectory() as directory:
            spec_path = Path(directory) / "unsafe-parent.json"
            spec_path.write_text(json.dumps(unsafe_parent), encoding="utf-8")
            rejected_parent = subprocess.run(
                [sys.executable, str(FIXTURE_HARNESS), "--spec", str(spec_path)],
                check=False,
                capture_output=True,
                text=True,
                timeout=3,
            )
        self.assertNotEqual(rejected_parent.returncode, 0)
        self.assertIn("REJECTED", rejected_parent.stdout)

        guide = FIXTURE_GUIDE.read_text(encoding="utf-8").lower()
        self.assertIn("do not run locally", guide)
        self.assertIn("strict host key checking", guide)
        self.assertIn("external evidence commands", guide)
        self.assertIn("sudo -n", guide)
        self.assertIn("ssh_original_command", guide)
        self.assertIn("force-command-dispatch", guide)
        self.assertIn("without arguments", guide)
        self.assertIn("--stage-request <uuid>", guide)
        self.assertIn("root-owned atomic", guide)
        self.assertIn("not-symlink", guide)
        self.assertIn("stat -c", guide)


if __name__ == "__main__":
    unittest.main()
