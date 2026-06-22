#!/usr/bin/env python3
"""
Agent_Security_Selfcheck_v3.4.0.py
===================================
Portable read-only security auditor for AI agent meshes that build and deploy apps.

Scope for v3.4.0:
  - Agent runtime adapter
  - framework adapter
  - Generic fallback discovery
  - Inline remediation tasks per finding

This script is validation-only. It must not remediate, install packages, change
configuration, mutate cron jobs, or print secrets.
"""
from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import os
import re
import shutil
import stat
import subprocess
import sys
import textwrap
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any

from envdetect import detect_environment, detect_environment_detail
from hardware_collection import collect_hardware_info

SCRIPT_VERSION = "3.4.0"
POLICY_VERSION = "agent-mesh-security-baseline-2026-06"
SCRIPT_DIR = Path(__file__).resolve().parent
DEFAULT_OUT_DIR = SCRIPT_DIR / "reports"

try:
    import yaml  # type: ignore
except Exception:  # pragma: no cover - optional dependency
    yaml = None

SECRET_PATTERNS = [
    re.compile(r"(?i)(api[_-]?key|secret|token|password|passwd|authorization|bearer)\s*[:=]\s*['\"]?[^\s,'\"]+"),
    re.compile(r"(?i)sk-[A-Za-z0-9_\-]{12,}"),
    re.compile(r"(?i)gh[pousr]_[A-Za-z0-9_]{20,}"),
    re.compile(r"\b\d{8,10}:[A-Za-z0-9_-]{25,}\b"),
    re.compile(r"(?i)xox[baprs]-[A-Za-z0-9_\-]{20,}"),
    re.compile(r"(?i)tskey-[A-Za-z0-9_\-]{16,}"),
]

SECRET_FILE_NAMES = {".env", ".env.local", ".env.production", ".env.prod", "auth.json", "credentials.json"}
INSTRUCTION_FILES = {"SOUL.md", "AGENTS.md", "CLAUDE.md", ".cursorrules", "SYSTEM.md"}
DEPLOY_FILE_HINTS = ("deploy", "release", "ship", "publish", "terraform", "ansible")
DANGEROUS_COMMAND_HINTS = (
    "rm -rf", "chmod 777", "curl | sh", "curl -fsSL", "wget | sh", "sudo ",
    "docker.sock", "--privileged", "kubectl apply", "kubectl delete", "terraform apply",
    "npm publish", "gh release", "vercel deploy", "railway up", "fly deploy",
)

FRAMEWORK_CONTROLS = {
    "Framework detection completed": ["NIST-CM-8", "CIS-v8-2.1"],
    "Portable adapter scope reviewed": ["NIST-CM-8", "ISO-42001-8.2", "SOC2-CC3.2"],
    "Agent runtime detected": ["NIST-CM-8", "OWASP-AGT-A1"],
    "Framework project detected": ["NIST-CM-8", "OWASP-AGT-A1"],
    "Agent instruction boundaries present": ["OWASP-LLM-A1", "ATLAS-AML.T0051", "NIST-SI-10"],
    "Secret files metadata reviewed": ["CIS-v8-3.3", "NIST-IA-5", "SOC2-CC6.1"],
    "No obvious plaintext secrets in non-secret configs": ["OWASP-LLM-A7", "CIS-v8-3.11", "NIST-IA-5"],
    "Docker socket exposure reviewed": ["CIS-v8-4.6", "OWASP-AGT-A5", "NIST-CM-7"],
    "Deployment scripts reviewed": ["OWASP-AGT-A2", "NIST-CM-7", "CIS-v8-4.8"],
    "CI/CD workflows reviewed": ["SLSA-L2", "SSDF-PW.7.2", "CIS-v8-16.11"],
    "Runtime routing explicit": ["OWASP-AGT-A1", "NIST-CM-6"],
    "Runtime fallback routing reviewed": ["OWASP-AGT-A1", "NIST-CM-6"],
    "Runtime approvals reviewed": ["OWASP-AGT-A2", "NIST-AC-3", "CIS-v8-6.3"],
    "Runtime terminal backend reviewed": ["OWASP-AGT-A2", "NIST-CM-7"],
    "Runtime redaction posture reviewed": ["OWASP-LLM-A7", "SOC2-CC6.1"],
    "Runtime private URL access reviewed": ["OWASP-LLM-A5", "NIST-SC-7"],
    "Runtime dashboard exposure reviewed": ["CIS-v8-12.1", "NIST-SC-7", "OWASP-LLM-A5"],
    "Runtime Telegram access boundary reviewed": ["OWASP-LLM-A1", "NIST-AC-3", "CIS-v8-6.1"],
    "Runtime Slack access boundary reviewed": ["OWASP-LLM-A1", "NIST-AC-3", "CIS-v8-6.1"],
    "Runtime Discord attachment boundary reviewed": ["OWASP-LLM-A5", "OWASP-AGT-A5", "NIST-SC-7"],
    "Runtime gateway file trust reviewed": ["OWASP-LLM-A5", "OWASP-AGT-A5", "NIST-CM-7"],
    "Runtime cron inventory reviewed": ["NIST-AU-6", "CIS-v8-8.2"],
    "Runtime delegation limits reviewed": ["OWASP-AGT-A3", "NIST-AC-6"],
    "Runtime tool/platform breadth reviewed": ["OWASP-LLM-A6", "NIST-AC-6"],
    "Framework execution policy reviewed": ["OWASP-AGT-A2", "NIST-AC-3"],
    "Framework routing reviewed": ["OWASP-AGT-A1", "NIST-CM-6"],
    "Framework tool exposure reviewed": ["OWASP-LLM-A6", "OWASP-AGT-A5", "NIST-CM-7"],
    "Framework deployment posture reviewed": ["OWASP-AGT-A2", "SLSA-L2"],
    "Optional scanner availability reviewed": ["CIS-v8-7.1", "SSDF-PW.4.4"],
    "Dependency manifest and lockfile posture reviewed": ["SSDF-PW.4.1", "SLSA-L2", "CIS-v8-16.4"],
    "Package lifecycle script posture reviewed": ["OWASP-AGT-A5", "SSDF-PW.4.4", "NIST-CM-7"],
    "Agent instruction override resistance reviewed": ["OWASP-LLM-A1", "ATLAS-AML.T0051", "NIST-SI-10"],
    "Agent destructive-action confirmation reviewed": ["OWASP-AGT-A2", "NIST-AC-3", "CIS-v8-6.3"],
    "Agent secret-disclosure guardrails reviewed": ["OWASP-LLM-A7", "SOC2-CC6.1", "NIST-IA-5"],
    "Secret exclusion posture reviewed": ["CIS-v8-3.3", "SSDF-PW.6.1", "NIST-IA-5"],
    "Secret storage sprawl reviewed": ["CIS-v8-3.3", "SOC2-CC6.1", "NIST-IA-5"],
    "Container image hardening reviewed": ["CIS-Docker-4", "NIST-CM-7", "CSA-CCC"],
    "Compose/runtime privilege posture reviewed": ["CIS-Docker-5", "OWASP-AGT-A5", "NIST-AC-6"],
    "Runtime namespace and mount posture reviewed": ["CIS-Docker-5", "NIST-SC-7", "NIST-AC-6"],
    "Agent tool policy files reviewed": ["OWASP-LLM-A6", "OWASP-AGT-A5", "NIST-CM-7"],
    "MCP/plugin inventory reviewed": ["OWASP-LLM-A3", "OWASP-LLM-A6", "NIST-CM-8"],
    "Subagent inventory reviewed": ["OWASP-AGT-A3", "NIST-CM-8", "NIST-AC-6"],
    "Subagent boundary instructions reviewed": ["OWASP-AGT-A3", "OWASP-LLM-A1", "NIST-AC-6"],
    "Scheduled persistence hooks reviewed": ["NIST-AU-6", "CIS-v8-8.2", "NIST-CM-7"],
    "Deployment rollback and audit markers reviewed": ["SOC2-CC7.2", "SSDF-PO.5.1", "NIST-CP-10"],
    "Dangerous command exposure reviewed": ["OWASP-AGT-A2", "NIST-CM-7", "CIS-v8-4.8"],
    "Runtime lazy install posture reviewed": ["OWASP-AGT-A5", "SSDF-PW.4.4", "NIST-CM-7"],
    "Runtime MCP server inventory reviewed": ["OWASP-LLM-A3", "OWASP-LLM-A6", "NIST-CM-8"],
    "Runtime skill/plugin inventory reviewed": ["OWASP-LLM-A3", "OWASP-AGT-A5", "NIST-CM-8"],
    "Runtime environment passthrough reviewed": ["OWASP-LLM-A7", "NIST-AC-6", "SOC2-CC6.1"],
    "Runtime OAuth/auth metadata posture reviewed": ["NIST-IA-5", "SOC2-CC6.1", "CIS-v8-6.7"],
    "Runtime cron script boundary reviewed": ["OWASP-AGT-A2", "NIST-CM-7", "CIS-v8-8.2"],
    "Runtime subagent approval posture reviewed": ["OWASP-AGT-A3", "NIST-AC-3", "CIS-v8-6.3"],
    "Runtime mount posture reviewed": ["CIS-Docker-5", "NIST-AC-6", "OWASP-AGT-A5"],
    "Framework instruction boundary reviewed": ["OWASP-LLM-A1", "ATLAS-AML.T0051", "NIST-SI-10"],
    "Framework persistence hooks reviewed": ["NIST-CM-7", "CIS-v8-8.2", "OWASP-AGT-A4"],
    "Compound mesh risk correlated": ["NIST-SI-4", "OWASP-AGT-A1"],
    "Cross-category audit coverage reviewed": ["NIST-CA-2", "ISO-42001-9.4", "SOC2-CC3.2"],

    # v3.4: Runtime Environment Detection
    "Runtime environment classified": ["CIS-v8-1.1", "NIST-CM-2", "ISO27001-A.8.1"],
    "Container runtime detected": ["CIS-v8-1.1", "NIST-CM-2", "ISO27001-A.8.1"],
    "VM/hypervisor detected": ["CIS-v8-1.1", "NIST-CM-2", "ISO27001-A.8.1"],
    "WSL environment detected": ["CIS-v8-1.1", "NIST-CM-2", "ISO27001-A.8.1"],
    "OS info captured": ["CIS-v8-1.1", "NIST-CM-2", "ISO27001-A.8.1"],

    # v3.4: System Resources
    "CPU count captured": ["CIS-v8-1.1", "NIST-CM-2", "ISO27001-A.8.1"],
    "Memory size captured": ["CIS-v8-1.1", "NIST-CM-2", "ISO27001-A.8.1"],
    "Disk usage captured": ["CIS-v8-1.1", "NIST-CM-2", "ISO27001-A.8.1"],
    "Network interfaces captured": ["CIS-v8-1.1", "NIST-CM-2", "ISO27001-A.8.1"],
    "Kernel version captured": ["CIS-v8-1.1", "NIST-CM-2", "ISO27001-A.8.1"],
}

WEIGHTS = {
    "Framework Discovery": 8,
    "Access Control": 10,
    "Execution & Approvals": 16,
    "Secrets & Privacy": 18,
    "Prompt Injection Defenses": 12,
    "Tools / Plugins / MCP": 10,
    "Agent Mesh / Subagents": 12,
    "Persistence & Deployment": 12,
    "Container & Runtime": 12,
    "Supply Chain": 8,
    "Risk Correlation": 14,
    "Runtime Environment": 5,
    "System Resources": 3,
}

FRAMEWORKS_USED = [
    "Agent security guide",
    "OWASP Top 10 for LLM Applications",
    "OWASP Agentic AI threat lens",
    "NIST AI RMF 1.0",
    "NIST SP 800-53 / 800-171",
    "CIS Controls v8",
    "SOC 2 Trust Services Criteria",
    "ISO/IEC 27001, 27002, and 42001",
    "MITRE ATLAS",
    "SLSA / SSDF supply-chain practices",
]

METHODOLOGY_TOOLS_USED = [
    "Read-only filesystem and configuration discovery",
    "Capability-based check activation for detected agent runtime contexts only",
    "Metadata-only secret-file inspection; secret contents are not read",
    "Regex-based secret-pattern scan of non-secret text/config files with redacted evidence",
    "Capability posture checks for approvals, gateways, tools, cron, delegation, and runtime boundaries",
    "Static review of instruction files, deployment scripts, CI/CD workflows, package manifests, Docker/Compose files, and policy files",
    "Optional scanner availability check only; no scanners are installed automatically",
    "Compound-risk and cross-category coverage correlation",
    "Report generation as JSON, Markdown, and SARIF v2.1.0",
]

HERMES_SECURITY_BEST_PRACTICES = [
    "Keep dangerous command approvals enabled; avoid approvals.mode=off and YOLO except in disposable/trusted automation environments.",
    "Use manual or smart approvals and keep cron dangerous-command behavior fail-closed/deny by default.",
    "Require confirmation before MCP reload and destructive slash/session operations.",
    "Configure explicit gateway user allowlists or approved DM pairing; do not enable global or platform allow-all without a documented business case.",
    "Use Docker, Singularity, Modal, or another sandbox for production gateways where practical; prefer hardened containers over host-local command execution.",
    "When Docker is used, preserve least-privilege hardening: dropped capabilities, no-new-privileges, PID limits, restricted tmpfs, and scoped mounts.",
    "Do not forward broad environment variables into sandboxes; only pass explicit task credentials and never provider/gateway infrastructure secrets.",
    "Mount credential files read-only when a sandbox needs them and keep secret file permissions restrictive, e.g. 0600.",
    "Enable or document secret/credential redaction and ensure MCP/tool error messages are sanitized before reaching model context or logs.",
    "Use website/private-network blocklists and keep private/internal URL access disabled unless explicitly justified.",
    "Maintain permanent dangerous-command allowlists carefully and review/remove stale patterns.",
    "Treat local terminal backend as trusted-user/development posture; production multi-user gateways need stronger isolation and authorization boundaries.",
]

RISK_ORDER = {"Critical": 5, "High": 4, "Medium": 3, "Low": 2, "Info": 1}
STATUS_ORDER = {"FAIL": 4, "WARN": 3, "SKIP": 2, "PASS": 1}


def finding_sort_key(f: dict[str, Any] | Finding) -> tuple[int, int, int, str]:
    risk = f.risk if isinstance(f, Finding) else f.get("risk", "Info")
    status = f.status if isinstance(f, Finding) else f.get("status", "PASS")
    severity = f.severity if isinstance(f, Finding) else int(f.get("severity", 0))
    check = f.check if isinstance(f, Finding) else f.get("check", "")
    return (-RISK_ORDER.get(str(risk), 0), -STATUS_ORDER.get(str(status), 0), -severity, str(check))


@dataclass
class Finding:
    category: str
    check: str
    status: str
    risk: str
    severity: int
    evidence: str
    recommendation: str
    framework_controls: list[str] = field(default_factory=list)
    adapter: str = "core"

    def as_dict(self) -> dict[str, Any]:
        d = asdict(self)
        d["evidence"] = redact(d.get("evidence", ""))
        d["recommendation"] = redact(d.get("recommendation", ""))
        return d


def redact(text: Any) -> str:
    out = str(text if text is not None else "")
    for pat in SECRET_PATTERNS:
        out = pat.sub("[REDACTED]", out)
    return out


def run(cmd: list[str], cwd: Path | None = None, timeout: int = 20) -> tuple[int, str, str]:
    try:
        p = subprocess.run(cmd, cwd=str(cwd) if cwd else None, text=True,
                           stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=timeout)
        return p.returncode, redact(p.stdout.strip()), redact(p.stderr.strip())
    except Exception as exc:
        return 127, "", redact(str(exc))


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    try:
        with path.open("rb") as f:
            for chunk in iter(lambda: f.read(1024 * 1024), b""):
                h.update(chunk)
        return h.hexdigest()
    except Exception:
        return "unavailable"


def safe_read_text(path: Path, limit: int = 200_000) -> str:
    if path.name in SECRET_FILE_NAMES or path.name.startswith(".env"):
        return ""
    try:
        data = path.read_text(encoding="utf-8", errors="ignore")
        return data[:limit]
    except Exception:
        return ""


def load_config(path: Path) -> dict[str, Any]:
    text = safe_read_text(path)
    if not text:
        return {}
    if yaml:
        try:
            data = yaml.safe_load(text)
            return data if isinstance(data, dict) else {}
        except Exception:
            pass
    # Minimal fallback parser for simple YAML sections. It intentionally skips
    # list bodies so list item keys such as `model:` under fallback providers do
    # not overwrite top-level `model:` mappings when PyYAML is unavailable.
    root: dict[str, Any] = {}
    stack: list[tuple[int, dict[str, Any]]] = [(-1, root)]
    skip_list_indent: int | None = None
    for raw in text.splitlines():
        if not raw.strip() or raw.lstrip().startswith("#") or ":" not in raw:
            continue
        indent = len(raw) - len(raw.lstrip(" "))
        stripped = raw.strip()
        if skip_list_indent is not None and indent > skip_list_indent:
            continue
        if skip_list_indent is not None and indent <= skip_list_indent:
            skip_list_indent = None
        if stripped.startswith("- "):
            skip_list_indent = indent
            continue
        key, val = stripped.split(":", 1)
        key = key.strip()
        val = val.strip().strip("'\"")
        while stack and indent <= stack[-1][0]:
            stack.pop()
        parent = stack[-1][1]
        if val == "":
            child: dict[str, Any] = {}
            parent[key] = child
            stack.append((indent, child))
        else:
            if val.lower() in ("true", "false"):
                parent[key] = val.lower() == "true"
            elif val in ("[]", "{}"):
                parent[key] = [] if val == "[]" else {}
            else:
                parent[key] = val
    providers = re.findall(r"(?m)^\s*-\s*provider:\s*([^\s#]+)", text)
    models = re.findall(r"(?m)^\s*model:\s*([^\s#]+)", text)
    if providers:
        root["fallback_routes"] = [
            {"provider": p, "model": models[i] if i < len(models) else ""}
            for i, p in enumerate(providers)
        ]
    return root


def get(cfg: dict[str, Any], dotted: str, default: Any = None) -> Any:
    cur: Any = cfg
    for part in dotted.split("."):
        if isinstance(cur, dict) and part in cur:
            cur = cur[part]
        else:
            return default
    return cur


def as_list(value: Any) -> list[Any]:
    if value is None:
        return []
    if isinstance(value, list):
        return value
    if isinstance(value, tuple) or isinstance(value, set):
        return list(value)
    return [value]


def text_has_any(text: str, terms: list[str]) -> bool:
    low = text.lower()
    return any(term.lower() in low for term in terms)


def rel_paths(paths: list[Path], root: Path, limit: int = 20) -> list[str]:
    out = []
    for p in paths[:limit]:
        try:
            out.append(str(p.relative_to(root)))
        except Exception:
            out.append(str(p))
    return out


def count_known_config_dirs(root: Path, names: set[str]) -> dict[str, int]:
    counts = {name: 0 for name in names}
    for p in list_files(root, 5000):
        parts = set(p.parts)
        for name in names:
            if name in parts or p.name == name:
                counts[name] += 1
    return {k: v for k, v in counts.items() if v}


def contains_secret_like_literal(text: str) -> bool:
    benign_contexts = (
        "os.environ", "getenv(", "[REDACTED]", "SECRET_PATTERNS", "re.compile(",
        'authorization": token', "authorization': token", "bearer {token}", "token}",
        "api_key_env", "requires_env", "env var", "environment variable",
    )
    assignment_literal = re.compile(r"(?i)(api[_-]?key|secret|token|password|passwd|authorization|bearer)\s*[:=]\s*['\"]([^'\"\s,]{12,})['\"]")
    high_entropy = SECRET_PATTERNS[1:]
    for line in text.splitlines():
        low = line.lower()
        if any(ctx.lower() in low for ctx in benign_contexts):
            continue
        if assignment_literal.search(line):
            return True
        if any(pat.search(line) for pat in high_entropy):
            return True
    return False


def add(findings: list[Finding], category: str, check: str, status: str, risk: str,
        severity: int, evidence: str, recommendation: str, adapter: str = "core") -> None:
    findings.append(Finding(
        category=category,
        check=check,
        status=status,
        risk=risk,
        severity=severity,
        evidence=redact(evidence),
        recommendation=redact(recommendation),
        framework_controls=FRAMEWORK_CONTROLS.get(check, ["NIST-CM-8"]),
        adapter=adapter,
    ))


def find_repo_root(start: Path) -> Path:
    p = start.resolve()
    for candidate in [p, *p.parents]:
        if (candidate / ".git").exists():
            return candidate
    return p


def list_files(root: Path, max_files: int = 5000) -> list[Path]:
    ignored = {".git", "node_modules", ".venv", "venv", "__pycache__", "reports", "backups"}
    allowed_dot_dirs = {".github", ".mcp", ".config"}
    out: list[Path] = []
    for base, dirs, files in os.walk(root):
        dirs[:] = [d for d in dirs if d not in ignored and (not d.startswith(".") or d in allowed_dot_dirs)]
        for name in files:
            path = Path(base) / name
            out.append(path)
            if len(out) >= max_files:
                return out
    return out


def metadata_for_secret_file(path: Path) -> str:
    try:
        st = path.stat()
        mode = stat.S_IMODE(st.st_mode)
        return f"path={path}; mode={oct(mode)}; uid={st.st_uid}; gid={st.st_gid}; size={st.st_size}; content_not_read=true"
    except Exception as exc:
        return f"path={path}; metadata_error={redact(exc)}; content_not_read=true"


def discover_context(target: Path) -> dict[str, Any]:
    root = find_repo_root(target)
    files = list_files(root)
    runtime_home = Path(os.environ.get("AGENT_HOME", str(Path.home())))
    runtime_config_candidates = [
        runtime_home / "config.yaml",
        Path.home() / ".config" / "agent.yaml",
        Path.home() / ".config" / "config.yaml",
        root / "config.yaml",
        root / "agent.yaml",
        root / "runtime.yaml",
        root / "runtime.yml",
    ]
    runtime_config = next((p for p in runtime_config_candidates if p.exists()), None)
    runtime_detected = bool(runtime_config or (root / "agent_cli").exists() or (root / "run_agent.py").exists())

    framework_markers = []
    for p in files:
        rel = str(p.relative_to(root)).lower()
        # Avoid self-detecting this auditor just because the plan/script names
        # Framework as a supported adapter.
        if "security selfcheck" in rel or "security_selfcheck" in rel:
            continue
        if "framework" in rel or p.name.lower() in {"framework.yaml", "framework.yml", "framework.json", "framework.toml"}:
            framework_markers.append(str(p.relative_to(root)))
        elif p.suffix.lower() in {".py", ".js", ".ts", ".json", ".yaml", ".yml", ".toml", ".md"}:
            txt = safe_read_text(p, 50_000).lower()
            if "framework" in txt:
                framework_markers.append(str(p.relative_to(root)))
    docker_files = [str(p.relative_to(root)) for p in files if p.name in {"Dockerfile", "docker-compose.yml", "docker-compose.yaml", "compose.yml", "compose.yaml"}]
    ci_files = [str(p.relative_to(root)) for p in files if ".github/workflows" in str(p.relative_to(root))]
    instruction_files = [str(p.relative_to(root)) for p in files if p.name in INSTRUCTION_FILES]
    secret_files = [p for p in files if p.name in SECRET_FILE_NAMES or p.name.startswith(".env")]
    deploy_files = [p for p in files if any(h in p.name.lower() for h in DEPLOY_FILE_HINTS)]
    docker_config_files = [p for p in files if p.name in {"Dockerfile", "docker-compose.yml", "docker-compose.yaml", "compose.yml", "compose.yaml"}]
    package_files = [p for p in files if p.name in {"package.json", "pyproject.toml", "requirements.txt", "poetry.lock", "package-lock.json", "pnpm-lock.yaml", "yarn.lock", "uv.lock", "Pipfile.lock"}]
    policy_files = [p for p in files if p.name in {"mcp.json", "tools.json", "toolsets.yaml", "toolsets.yml", "permissions.json", "policy.yaml", "policy.yml"}]
    subagent_files = [p for p in files if "subagent" in p.name.lower() or "agents" in p.parts or p.name in {"AGENTS.md", "SOUL.md"}]
    persistence_files = [p for p in files if any(part in {"cron", "crontab", "systemd", "launchd"} for part in p.parts) or p.suffix == ".service"]
    return {
        "root": root,
        "files": files,
        "runtime_detected": runtime_detected,
        "runtime_config": runtime_config,
        "framework_detected": bool(framework_markers),
        "framework_markers": framework_markers[:20],
        "docker_files": docker_files,
        "ci_files": ci_files,
        "instruction_files": instruction_files,
        "secret_files": secret_files,
        "deploy_files": deploy_files,
        "docker_config_files": docker_config_files,
        "package_files": package_files,
        "policy_files": policy_files,
        "subagent_files": subagent_files,
        "persistence_files": persistence_files,
    }


def scan_universal(ctx: dict[str, Any], findings: list[Finding]) -> None:
    root: Path = ctx["root"]
    detected = []
    if ctx["runtime_detected"]:
        detected.append("agent runtime")
    if ctx["framework_detected"]:
        detected.append("framework")
    if not detected:
        detected.append("generic agent project fallback")
    add(findings, "Framework Discovery", "Framework detection completed", "PASS", "Info", 1,
        f"root={root}; detected={detected}; framework_markers={ctx['framework_markers'][:5]}",
        "Run only checks matching detected agent surfaces; keep unsupported surfaces out of scope.")
    active_adapters = ["core"] + (["runtime"] if ctx["runtime_detected"] else []) + (["framework"] if ctx["framework_detected"] else [])
    add(findings, "Framework Discovery", "Portable adapter scope reviewed", "PASS", "Info", 1,
        f"configured_scope=['agent runtime','framework','generic fallback']; active_adapters={active_adapters}; unsupported_frameworks_skipped=true",
        "Keep the portable auditor broad enough for scale while only activating reviewed check sets for detected agent surfaces.")

    if ctx["runtime_detected"]:
        add(findings, "Framework Discovery", "Agent runtime detected", "PASS", "Info", 1,
            f"config={ctx['runtime_config']}; root_markers_checked=true", "Run runtime checks.", "runtime")
    if ctx["framework_detected"]:
        add(findings, "Framework Discovery", "Agent framework detected", "PASS", "Info", 1,
            f"markers={ctx['framework_markers'][:10]}", "Run framework checks.", "framework")

    add(findings, "Prompt Injection Defenses", "Agent instruction boundaries present",
        "PASS" if ctx["instruction_files"] else "WARN", "Medium" if not ctx["instruction_files"] else "Low", 3,
        f"instruction_files={ctx['instruction_files']}",
        "Keep explicit instruction-boundary files with rules for prompt injection, secrets, tool use, and destructive approvals.")

    instruction_text = "\n".join(safe_read_text(root / rel, 80_000) for rel in ctx["instruction_files"][:20])
    override_terms = ["ignore previous", "prompt injection", "untrusted", "external content", "system prompt", "instruction hierarchy"]
    destructive_terms = ["destructive", "delete", "rm -rf", "approval", "confirm", "human approval", "explicit approval"]
    secret_guard_terms = ["secret", "credential", "token", "private key", "do not reveal", "redact"]
    add(findings, "Prompt Injection Defenses", "Agent instruction override resistance reviewed",
        "PASS" if text_has_any(instruction_text, override_terms) else "WARN", "Medium" if not text_has_any(instruction_text, override_terms) else "Low", 4,
        f"instruction_files={ctx['instruction_files']}; override_guardrail_terms_present={text_has_any(instruction_text, override_terms)}",
        "Document instruction hierarchy and external-content distrust so agents reject prompt-injection override attempts.")
    add(findings, "Prompt Injection Defenses", "Agent destructive-action confirmation reviewed",
        "PASS" if text_has_any(instruction_text, destructive_terms) else "WARN", "High" if not text_has_any(instruction_text, destructive_terms) else "Low", 5,
        f"instruction_files={ctx['instruction_files']}; destructive_confirmation_terms_present={text_has_any(instruction_text, destructive_terms)}",
        "Require explicit human confirmation before destructive file, cloud, infrastructure, or deployment actions.")
    add(findings, "Prompt Injection Defenses", "Agent secret-disclosure guardrails reviewed",
        "PASS" if text_has_any(instruction_text, secret_guard_terms) else "WARN", "High" if not text_has_any(instruction_text, secret_guard_terms) else "Low", 5,
        f"instruction_files={ctx['instruction_files']}; secret_non_disclosure_terms_present={text_has_any(instruction_text, secret_guard_terms)}",
        "State that credentials, tokens, private keys, and sensitive data must never be disclosed and must be redacted in evidence.")

    if ctx["secret_files"]:
        evidence = "; ".join(metadata_for_secret_file(p) for p in ctx["secret_files"][:20])
        risky = []
        for p in ctx["secret_files"]:
            try:
                mode = stat.S_IMODE(p.stat().st_mode)
                if mode & 0o077:
                    risky.append(str(p.relative_to(root)))
            except Exception:
                pass
        add(findings, "Secrets & Privacy", "Secret files metadata reviewed",
            "WARN" if risky else "PASS", "Medium" if risky else "Low", 4,
            evidence + f"; world_or_group_readable={risky}",
            "Use restrictive permissions such as 0600 from the runtime perspective; do not duplicate secret files.")
    else:
        add(findings, "Secrets & Privacy", "Secret files metadata reviewed", "PASS", "Info", 1,
            "no common secret files discovered under target root", "Continue keeping credentials outside committed config.")

    secret_hits = []
    for p in ctx["files"][:5000]:
        if p.name in SECRET_FILE_NAMES or p.name.startswith(".env"):
            continue
        if p.suffix.lower() not in {".yaml", ".yml", ".json", ".toml", ".ini", ".conf", ".md", ".py", ".js", ".ts"}:
            continue
        txt = safe_read_text(p, 100_000)
        if contains_secret_like_literal(txt):
            secret_hits.append(str(p.relative_to(root)))
        if len(secret_hits) >= 20:
            break
    add(findings, "Secrets & Privacy", "No obvious plaintext secrets in non-secret configs",
        "WARN" if secret_hits else "PASS", "High" if secret_hits else "Low", 5,
        f"files_with_secret_like_patterns={secret_hits}; values_redacted=true",
        "Move secrets to approved secret storage and rotate anything that may have been exposed.")

    gitignore_text = safe_read_text(root / ".gitignore", 60_000)
    gitignore_has_env = ".env" in gitignore_text or "*.env" in gitignore_text
    add(findings, "Secrets & Privacy", "Secret exclusion posture reviewed",
        "PASS" if gitignore_has_env or not ctx["secret_files"] else "WARN", "Medium" if ctx["secret_files"] and not gitignore_has_env else "Low", 3,
        f"gitignore_present={(root / '.gitignore').exists()}; env_exclusion_present={gitignore_has_env}; secret_file_count={len(ctx['secret_files'])}",
        "Ensure secret-like files are excluded from source control while keeping content inspection out of this read-only auditor.")
    secret_sprawl = len(ctx["secret_files"]) > 3
    add(findings, "Secrets & Privacy", "Secret storage sprawl reviewed",
        "WARN" if secret_sprawl else "PASS", "Medium" if secret_sprawl else "Low", 3,
        f"secret_file_count={len(ctx['secret_files'])}; content_not_read=true",
        "Minimize credential file sprawl and prefer a reviewed secrets provider or a single runtime-scoped env file.")

    docker_evidence = f"docker_files={ctx['docker_files']}; docker_sock_exists={Path('/var/run/docker.sock').exists()}"
    add(findings, "Container & Runtime", "Docker socket exposure reviewed",
        "WARN" if Path("/var/run/docker.sock").exists() else "PASS", "High" if Path("/var/run/docker.sock").exists() else "Low", 5,
        docker_evidence,
        "Docker socket grants host-level control; mount only when explicitly required and reviewed.")

    docker_text = "\n".join(safe_read_text(p, 120_000) for p in ctx["docker_config_files"][:30]).lower()
    dockerfile_present = any(p.name == "Dockerfile" for p in ctx["docker_config_files"])
    non_root = "user " in docker_text and "user root" not in docker_text
    digest_pinned = "@sha256:" in docker_text
    add(findings, "Container & Runtime", "Container image hardening reviewed",
        "WARN" if dockerfile_present and not non_root else ("PASS" if dockerfile_present else "SKIP"), "Medium" if dockerfile_present and not non_root else "Info", 4,
        f"docker_config_files={rel_paths(ctx['docker_config_files'], root)}; non_root_user_marker={non_root}; digest_pinning_marker={digest_pinned}",
        "Prefer non-root container users and pin production images by digest where practical.")
    privilege_terms = ["privileged: true", "cap_add", "network_mode: host", "pid: host", "/var/run/docker.sock", "security_opt"]
    privilege_hits = [term for term in privilege_terms if term in docker_text]
    add(findings, "Container & Runtime", "Compose/runtime privilege posture reviewed",
        "WARN" if privilege_hits else ("PASS" if ctx["docker_config_files"] else "SKIP"), "High" if privilege_hits else "Info", 5,
        f"privilege_markers={privilege_hits}; docker_config_files={rel_paths(ctx['docker_config_files'], root)}",
        "Avoid privileged containers, host namespaces, broad capabilities, and Docker socket mounts unless explicitly justified.")
    mount_terms = ["/:/", "/root:/", "/home:/", f"{Path(os.environ.get('AGENT_HOME', str(Path.home()))).expanduser()}:/", "read_only: false", "read-only=false"]
    mount_hits = [term for term in mount_terms if term in docker_text]
    add(findings, "Container & Runtime", "Runtime namespace and mount posture reviewed",
        "WARN" if mount_hits else ("PASS" if ctx["docker_config_files"] else "SKIP"), "Medium" if mount_hits else "Info", 4,
        f"broad_mount_markers={mount_hits}; docker_config_files={rel_paths(ctx['docker_config_files'], root)}",
        "Constrain bind mounts and namespaces for agents with shell, file, browser, or deployment tools.")

    deploy_risky = []
    for p in ctx["deploy_files"][:50]:
        txt = safe_read_text(p, 80_000).lower()
        if any(h in txt for h in DANGEROUS_COMMAND_HINTS):
            deploy_risky.append(str(p.relative_to(root)))
    add(findings, "Persistence & Deployment", "Deployment scripts reviewed",
        "WARN" if deploy_risky else "PASS", "Medium" if deploy_risky else "Low", 3,
        f"deploy_files={len(ctx['deploy_files'])}; risky_hint_files={deploy_risky}",
        "Require human approval for deployment scripts and destructive commands in app-building agents.")

    ci_risky = []
    for rel in ctx["ci_files"]:
        p = root / rel
        txt = safe_read_text(p, 120_000).lower()
        if "pull_request_target" in txt or "id-token: write" in txt or "secrets." in txt:
            ci_risky.append(rel)
    add(findings, "Persistence & Deployment", "CI/CD workflows reviewed",
        "WARN" if ci_risky else ("PASS" if ctx["ci_files"] else "SKIP"),
        "Medium" if ci_risky else "Info", 3,
        f"workflow_files={ctx['ci_files']}; risky_hint_files={ci_risky}",
        "Review CI/CD workflows for broad tokens, PR-target execution, and deployment permissions.")

    scheduled_hooks = rel_paths(ctx["persistence_files"], root)
    add(findings, "Persistence & Deployment", "Scheduled persistence hooks reviewed",
        "WARN" if scheduled_hooks else "PASS", "Medium" if scheduled_hooks else "Low", 3,
        f"persistence_files={scheduled_hooks}",
        "Inventory cron/systemd/launchd hooks because agent-created persistence can silently retain tool authority.")
    deploy_text = "\n".join(safe_read_text(p, 120_000) for p in ctx["deploy_files"][:50]).lower()
    rollback_markers = text_has_any(deploy_text, ["rollback", "backout", "audit", "log", "dry-run", "--dry-run", "preview"])
    add(findings, "Persistence & Deployment", "Deployment rollback and audit markers reviewed",
        "PASS" if not ctx["deploy_files"] or rollback_markers else "WARN", "Medium" if ctx["deploy_files"] and not rollback_markers else "Low", 3,
        f"deploy_files={len(ctx['deploy_files'])}; rollback_or_audit_markers_present={rollback_markers}",
        "Deployment-capable agent meshes should preserve logs, support dry-run/preview, and document rollback paths.")

    script_text = "\n".join(safe_read_text(p, 80_000) for p in ctx["files"][:500] if p.suffix.lower() in {".sh", ".bash", ".py", ".js", ".ts", ".yaml", ".yml"}).lower()
    dangerous_hits = [hint for hint in DANGEROUS_COMMAND_HINTS if hint in script_text]
    add(findings, "Execution & Approvals", "Dangerous command exposure reviewed",
        "WARN" if dangerous_hits else "PASS", "High" if dangerous_hits else "Low", 5,
        f"dangerous_command_markers={dangerous_hits[:20]}; scanned_file_limit=500",
        "Map destructive shell, deployment, package-publish, Docker, Kubernetes, and infrastructure commands to explicit approval gates.")

    policy_paths = rel_paths(ctx["policy_files"], root)
    add(findings, "Tools / Plugins / MCP", "Agent tool policy files reviewed",
        "PASS" if policy_paths else "WARN", "Medium" if not policy_paths else "Low", 3,
        f"tool_policy_files={policy_paths}",
        "Maintain reviewed policy files that bind powerful tools to least-privilege scopes and approval requirements.")
    inventory_counts = count_known_config_dirs(root, {"plugins", "skills", "mcp", ".mcp", "servers"})
    add(findings, "Tools / Plugins / MCP", "MCP/plugin inventory reviewed",
        "WARN" if inventory_counts else "PASS", "Medium" if inventory_counts else "Low", 3,
        f"inventory_counts={inventory_counts}",
        "Review plugin, skill, and MCP inventories for provenance, capability scope, and disabled/stale entries.")

    subagent_paths = rel_paths(ctx["subagent_files"], root)
    add(findings, "Agent Mesh / Subagents", "Subagent inventory reviewed",
        "WARN" if subagent_paths else "PASS", "Medium" if subagent_paths else "Low", 3,
        f"subagent_related_files={subagent_paths[:30]}",
        "Inventory all subagent definitions because each child agent can expand execution and data-access scope.")
    subagent_text = "\n".join(safe_read_text(p, 80_000) for p in ctx["subagent_files"][:30]).lower()
    subagent_boundaries = text_has_any(subagent_text, ["delegate", "subagent", "approval", "scope", "least privilege", "do not", "deny"])
    add(findings, "Agent Mesh / Subagents", "Subagent boundary instructions reviewed",
        "PASS" if not subagent_paths or subagent_boundaries else "WARN", "Medium" if subagent_paths and not subagent_boundaries else "Low", 4,
        f"subagent_files={subagent_paths[:30]}; boundary_terms_present={subagent_boundaries}",
        "Define scope, tool limits, approval boundaries, and parent verification requirements for child agents.")

    package_names = [p.name for p in ctx["package_files"]]
    lock_present = any(name in package_names for name in ["poetry.lock", "package-lock.json", "pnpm-lock.yaml", "yarn.lock", "uv.lock", "Pipfile.lock"])
    manifest_present = any(name in package_names for name in ["package.json", "pyproject.toml", "requirements.txt"])
    add(findings, "Supply Chain", "Dependency manifest and lockfile posture reviewed",
        "WARN" if manifest_present and not lock_present else ("PASS" if manifest_present else "SKIP"), "Medium" if manifest_present and not lock_present else "Info", 3,
        f"package_files={rel_paths(ctx['package_files'], root)}; lockfile_present={lock_present}",
        "Use lockfiles or equivalent dependency pinning so agent-built applications remain reproducible and reviewable.")
    lifecycle_hits = []
    for pkg in [x for x in ctx["package_files"] if x.name == "package.json"][:20]:
        txt = safe_read_text(pkg, 120_000).lower()
        if any(k in txt for k in ["postinstall", "preinstall", "prepare", "curl", "wget", "chmod", "node-gyp"]):
            lifecycle_hits.append(str(pkg.relative_to(root)))
    add(findings, "Supply Chain", "Package lifecycle script posture reviewed",
        "WARN" if lifecycle_hits else ("PASS" if manifest_present else "SKIP"), "Medium" if lifecycle_hits else "Info", 3,
        f"package_json_with_lifecycle_or_download_markers={lifecycle_hits}",
        "Review package lifecycle scripts because they can execute code during install/build in agent workflows.")

    scanner_tools = ["pip-audit", "bandit", "semgrep", "trivy", "grype", "gitleaks", "npm"]
    availability = {tool: bool(shutil.which(tool)) for tool in scanner_tools}
    add(findings, "Supply Chain", "Optional scanner availability reviewed", "SKIP", "Info", 1,
        f"availability={availability}; no_auto_install=true",
        "Install optional scanners separately if deeper local CVE/SAST/secret scanning is required.")


# ---------------------------------------------------------------------------
# v3.4: Runtime Environment Detection
# ---------------------------------------------------------------------------

def scan_runtime_environment(ctx: dict[str, Any], findings: list[Finding]) -> None:
    """Detect and classify the execution environment: container, VM, WSL, or bare-metal.
    Read-only, deterministic, no external dependencies.
    """
    root: Path = ctx["root"]

    # --- Container detection ---
    in_docker = Path("/.dockerenv").exists()
    in_lxc = False
    in_podman = False
    in_k8s = False

    try:
        cgroup = Path("/proc/1/cgroup").read_text(errors="ignore").lower()
        if "docker" in cgroup:
            in_docker = True
        if "lxc" in cgroup:
            in_lxc = True
    except Exception:
        pass

    if os.environ.get("container") == "podman" or os.environ.get("PODMAN"):
        in_podman = True
    if os.environ.get("KUBERNETES_SERVICE_HOST"):
        in_k8s = True

    container_type = None
    if in_k8s:
        container_type = "kubernetes"
    elif in_docker:
        container_type = "docker"
    elif in_podman:
        container_type = "podman"
    elif in_lxc:
        container_type = "lxc"

    if container_type:
        add(findings, "Runtime Environment", "Container runtime detected",
             "PASS", "Low", 2,
             f"container={container_type}",
             "Container runtime detected — ensure container hardening controls are in place.")
    else:
        add(findings, "Runtime Environment", "Container runtime detected",
             "PASS", "Info", 1,
             "container=none",
             "No container runtime detected — verify host-level isolation separately.")

    # --- VM / hypervisor detection ---
    vm_type = None

    # Method 1: systemd-detect-virt
    try:
        rc, out, _ = run(["systemd-detect-virt"], 10)
        if rc == 0 and out.strip() and out.strip().lower() != "none":
            vm_type = out.strip().lower()
    except Exception:
        pass

    # Method 2: DMI data
    if not vm_type:
        for dmi_file in ["/sys/class/dmi/id/sys_vendor", "/sys/class/dmi/id/product_name"]:
            try:
                dmi_val = Path(dmi_file).read_text(errors="ignore").strip().lower()
                if not dmi_val:
                    continue
                if "vmware" in dmi_val:
                    vm_type = "vmware"
                elif "qemu" in dmi_val or "kvm" in dmi_val:
                    vm_type = "kvm"
                elif "virtualbox" in dmi_val or "oracle" in dmi_val:
                    vm_type = "virtualbox"
                elif "microsoft" in dmi_val or "hyper-v" in dmi_val:
                    vm_type = "hyperv"
                elif "xen" in dmi_val:
                    vm_type = "xen"
                elif "amazon" in dmi_val or "ec2" in dmi_val:
                    vm_type = "aws"
                elif "google" in dmi_val:
                    vm_type = "gcp"
                if vm_type:
                    break
            except Exception:
                pass

    # Method 3: CPU hypervisor flag
    if not vm_type:
        try:
            cpuinfo = Path("/proc/cpuinfo").read_text(errors="ignore").lower()
            if "hypervisor" in cpuinfo:
                vm_type = "vm-unknown"
        except Exception:
            pass

    if vm_type:
        add(findings, "Runtime Environment", "VM/hypervisor detected",
             "PASS", "Low", 2,
             f"hypervisor={vm_type}",
             f"VM/hypervisor detected ({vm_type}) — verify snapshot/backup and network isolation.")
    else:
        add(findings, "Runtime Environment", "VM/hypervisor detected",
             "PASS", "Info", 1,
             "hypervisor=none",
             "No VM/hypervisor detected — may be bare-metal or undetected virtualization.")

    # --- WSL detection ---
    in_wsl = False
    try:
        proc_version = Path("/proc/version").read_text(errors="ignore").lower()
        if "microsoft" in proc_version or "wsl" in proc_version:
            in_wsl = True
    except Exception:
        pass

    if in_wsl:
        add(findings, "Runtime Environment", "WSL environment detected",
             "PASS", "Low", 2,
             "wsl=true",
             "WSL detected — verify Windows host firewall and WSL network isolation.")
    else:
        add(findings, "Runtime Environment", "WSL environment detected",
             "PASS", "Info", 1,
             "wsl=false",
             "WSL not detected.")

    # --- OS info ---
    os_name = "unknown"
    os_version = "unknown"
    try:
        os_release = Path("/etc/os-release").read_text(errors="ignore")
        for line in os_release.splitlines():
            if line.startswith("NAME="):
                os_name = line.split("=", 1)[1].strip().strip('"')
            elif line.startswith("VERSION_ID="):
                os_version = line.split("=", 1)[1].strip().strip('"')
    except Exception:
        pass

    add(findings, "Runtime Environment", "OS info captured",
         "PASS", "Info", 1,
         f"os={os_name} {os_version}",
         "OS information captured for asset inventory.")

    # --- Runtime classification ---
    if container_type:
        runtime_label = container_type
    elif in_wsl:
        runtime_label = "wsl"
    elif vm_type:
        runtime_label = vm_type
    else:
        runtime_label = "bare-metal"

    add(findings, "Runtime Environment", "Runtime environment classified",
         "PASS", "Low", 2,
         f"runtime={runtime_label}",
         f"Classified runtime as '{runtime_label}' — use this to select appropriate hardening baseline.")


# ---------------------------------------------------------------------------
# v3.4: System Resources
# ---------------------------------------------------------------------------

def scan_system_resources(ctx: dict[str, Any], findings: list[Finding]) -> None:
    """Capture hardware/software posture: CPU, memory, disk, network, kernel.
    Informational/read-only — flags WARN only for concerning states.
    """
    root: Path = ctx["root"]

    # --- CPU count ---
    cpu_count = os.cpu_count() or 0
    try:
        cpuinfo_text = Path("/proc/cpuinfo").read_text(errors="ignore")
        proc_count = cpuinfo_text.count("processor\t:")
        if proc_count > 0:
            cpu_count = max(cpu_count, proc_count)
    except Exception:
        pass

    cpu_warn = cpu_count <= 1
    add(findings, "System Resources", "CPU count captured",
         "WARN" if cpu_warn else "PASS", "Medium" if cpu_warn else "Low", 1,
         f"cpu_count={cpu_count}",
         "Single CPU core detected — may be insufficient for production agent workloads." if cpu_warn
         else f"{cpu_count} CPU core(s) detected.")

    # --- Total memory ---
    mem_total_kb = 0
    mem_available_kb = 0
    try:
        meminfo = Path("/proc/meminfo").read_text(errors="ignore")
        for line in meminfo.splitlines():
            if line.startswith("MemTotal:"):
                mem_total_kb = int(line.split()[1])
            elif line.startswith("MemAvailable:"):
                mem_available_kb = int(line.split()[1])
    except Exception:
        pass

    mem_total_gb = round(mem_total_kb / 1048576, 1) if mem_total_kb else 0
    mem_avail_pct = round(mem_available_kb / mem_total_kb * 100, 1) if mem_total_kb and mem_available_kb else 100

    mem_warn = mem_avail_pct < 10 if mem_available_kb else False
    add(findings, "System Resources", "Memory size captured",
         "WARN" if mem_warn else "PASS", "Medium" if mem_warn else "Low", 1,
         f"mem_total={mem_total_gb}GB; mem_available_pct={mem_avail_pct}%",
         f"Low memory availability ({mem_avail_pct}%) — consider reducing workload or adding RAM." if mem_warn
         else f"Total memory: {mem_total_gb}GB ({mem_avail_pct}% available).")

    # --- Disk usage ---
    disk_total = "unknown"
    disk_used = "unknown"
    disk_pct = 0
    try:
        stat = os.statvfs("/")
        total_bytes = stat.f_blocks * stat.f_frsize
        free_bytes = stat.f_bavail * stat.f_frsize
        used_bytes = total_bytes - free_bytes
        disk_pct = round(used_bytes / total_bytes * 100) if total_bytes else 0
        disk_total = f"{round(total_bytes / (1024**3), 1)}G"
        disk_used = f"{round(used_bytes / (1024**3), 1)}G"
    except Exception:
        pass

    disk_warn = disk_pct > 90
    add(findings, "System Resources", "Disk usage captured",
         "WARN" if disk_warn else "PASS", "Medium" if disk_warn else "Low", 1,
         f"disk_total={disk_total}; disk_used={disk_used}; disk_used_pct={disk_pct}%",
         f"Disk usage critical ({disk_pct}%) — free space or expand volume." if disk_warn
         else f"Disk: {disk_used}/{disk_total} ({disk_pct}% used).")

    # --- Network interfaces ---
    net_info = "none"
    try:
        rc3, ip_out, _ = run(["ip", "-br", "addr"], 10)
        if rc3 == 0 and ip_out.strip():
            iface_lines = []
            for line in ip_out.strip().splitlines():
                parts = line.split()
                if len(parts) >= 3:
                    iface_name = parts[0]
                    iface_addrs = parts[2:]
                    redacted_addrs = []
                    for addr in iface_addrs:
                        if "/" in addr:
                            ip_part, mask = addr.split("/", 1)
                            octets = ip_part.split(".")
                            if len(octets) == 4:
                                redacted_addrs.append(f"{octets[0]}.{octets[1]}.x.x/{mask}")
                            else:
                                redacted_addrs.append(f"[ipv6]/{mask}")
                        else:
                            redacted_addrs.append(addr)
                    iface_lines.append(f"{iface_name}={','.join(redacted_addrs)}")
            net_info = "; ".join(iface_lines) if iface_lines else "no_interfaces"
    except Exception:
        net_info = "ip_command_failed"

    add(findings, "System Resources", "Network interfaces captured",
         "PASS", "Info", 1,
         f"interfaces={net_info}",
         "Network interface inventory captured.")

    # --- Kernel version ---
    kernel_version = "unknown"
    try:
        rc4, uname_out, _ = run(["uname", "-r"], 10)
        if rc4 == 0:
            kernel_version = uname_out.strip()
    except Exception:
        pass

    add(findings, "System Resources", "Kernel version captured",
         "PASS", "Info", 1,
         f"kernel={kernel_version}",
         f"Kernel version: {kernel_version}")


def scan_runtime(ctx: dict[str, Any], findings: list[Finding]) -> None:
    if not ctx["runtime_detected"]:
        return
    cfg_path: Path | None = ctx["runtime_config"]
    cfg = load_config(cfg_path) if cfg_path else {}
    agent_home = Path(os.environ.get("AGENT_HOME", str(Path.home())))
    routing_config = get(cfg, "routing", get(cfg, "router", get(cfg, "agent.routing", None)))
    routing_present = routing_config not in (None, "", [], {})
    add(findings, "Execution & Approvals", "Runtime routing metadata reviewed",
        "PASS" if routing_present else "SKIP", "Low" if routing_present else "Info", 2,
        f"config={cfg_path}; routing_metadata_present={routing_present}; routing_type={type(routing_config).__name__ if routing_present else 'none'}",
        "Keep runtime routing metadata explicit only when the project actually supports dynamic agent routing.", "runtime")

    fallback_routes = as_list(cfg.get("fallback_routes")) if isinstance(cfg, dict) else []
    add(findings, "Execution & Approvals", "Runtime fallback routing reviewed",
        "PASS" if fallback_routes else "SKIP", "Low" if fallback_routes else "Info", 2,
        f"fallback_count={len(fallback_routes)}; fallback_routing_present={bool(fallback_routes)}",
        "Keep fallback routing explicit and reviewed so agent runtimes do not silently switch to unknown backends.", "runtime")

    approvals_mode = get(cfg, "approvals.mode", "unset")
    cron_mode = get(cfg, "approvals.cron_mode", "unset")
    weak = approvals_mode in ("off", "none", False) or cron_mode in ("off", "none", False)
    add(findings, "Execution & Approvals", "Runtime approvals reviewed",
        "WARN" if weak or approvals_mode == "unset" else "PASS", "High" if weak else "Medium" if approvals_mode == "unset" else "Low", 5,
        f"approvals.mode={approvals_mode}; approvals.cron_mode={cron_mode}",
        "Use manual or smart approvals for risky actions; cron should not bypass dangerous command controls.", "runtime")

    backend = get(cfg, "terminal.backend", "unset")
    docker_sock = Path("/var/run/docker.sock").exists()
    risky_backend = backend == "docker" and not docker_sock
    add(findings, "Execution & Approvals", "Runtime terminal backend reviewed",
        "WARN" if risky_backend else "PASS", "Medium" if risky_backend else "Low", 3,
        f"terminal.backend={backend}; docker_sock_exists={docker_sock}",
        "Use local backend for stable containerized ARX runtime unless Docker socket sandboxing is verified.", "runtime")

    lazy_install = get(cfg, "tools.lazy_install", get(cfg, "terminal.lazy_install", False))
    inline_shell = get(cfg, "terminal.allow_inline_shell", get(cfg, "tools.allow_inline_shell", "unset"))
    add(findings, "Execution & Approvals", "Runtime lazy install posture reviewed",
        "WARN" if lazy_install is True or inline_shell is True else "PASS", "Medium" if lazy_install is True or inline_shell is True else "Low", 4,
        f"tools.lazy_install={lazy_install}; inline_shell_allowed={inline_shell}",
        "Disable lazy installs and unrestricted inline shell paths for production-grade app-building agents unless separately approved.", "runtime")

    redact_secrets = get(cfg, "security.redact_secrets", False)
    redact_pii = get(cfg, "privacy.redact_pii", False)
    add(findings, "Secrets & Privacy", "Runtime redaction posture reviewed",
        "WARN" if not redact_secrets else "PASS", "Medium" if not redact_secrets else "Low", 4,
        f"security.redact_secrets={redact_secrets}; privacy.redact_pii={redact_pii}",
        "Enable secret redaction where acceptable; enable PII redaction for gateway contexts that include personal identifiers.", "runtime")

    env_passthrough = get(cfg, "terminal.env_passthrough", get(cfg, "tools.env_passthrough", []))
    passthrough_count = len(as_list(env_passthrough))
    risky_env_names = [str(x) for x in as_list(env_passthrough) if re.search(r"(?i)(token|secret|key|password|credential)", str(x))]
    add(findings, "Secrets & Privacy", "Runtime environment passthrough reviewed",
        "WARN" if risky_env_names or passthrough_count > 10 else "PASS", "High" if risky_env_names else "Medium" if passthrough_count > 10 else "Low", 4,
        f"env_passthrough_count={passthrough_count}; sensitive_name_markers={risky_env_names}; values_not_read=true",
        "Keep environment passthrough minimal and never forward broad credential-bearing variables to tools or subagents.", "runtime")
    auth_dirs = [agent_home / "auth", Path.home() / ".config", Path.home() / ".agent"]
    auth_metadata = []
    for d in auth_dirs:
        auth_metadata.append(f"{d}:exists={d.exists()}")
    add(findings, "Secrets & Privacy", "Runtime OAuth/auth metadata posture reviewed",
        "PASS", "Info", 1,
        f"auth_locations_metadata={auth_metadata}; token_values_not_read=true",
        "Track OAuth/auth metadata and expiry without reading or printing token values.", "runtime")

    browser_private = get(cfg, "browser.allow_private_urls", False)
    security_private = get(cfg, "security.allow_private_urls", False)
    blocklist = get(cfg, "security.website_blocklist", [])
    private_url_risk = bool(browser_private or security_private)
    add(findings, "Access Control", "Runtime private URL access reviewed",
        "WARN" if private_url_risk else "PASS", "High" if private_url_risk else "Low", 5,
        f"browser.allow_private_urls={browser_private}; security.allow_private_urls={security_private}; website_blocklist_count={len(as_list(blocklist))}",
        "Keep private/internal URL access disabled unless a scoped business case exists.", "runtime")

    dashboard_public = get(cfg, "dashboard.public_url", "")
    dashboard_enabled = get(cfg, "dashboard.enabled", False)
    dashboard_exposed = bool(dashboard_public and not str(dashboard_public).startswith(("http://127.0.0.1", "http://localhost", "https://localhost")))
    add(findings, "Access Control", "Runtime dashboard exposure reviewed",
        "WARN" if dashboard_exposed else "PASS", "Medium" if dashboard_exposed else "Low", 4,
        f"dashboard.enabled={dashboard_enabled}; dashboard.public_url_set={bool(dashboard_public)}; public_url_local_only={not dashboard_exposed}",
        "Keep dashboards bound locally or behind explicit authentication and network controls.", "runtime")

    telegram_allowed = get(cfg, "telegram.allowed_chats", "")
    telegram_warn = telegram_allowed in (None, "", [], {})
    add(findings, "Access Control", "Runtime Telegram access boundary reviewed",
        "WARN" if telegram_warn else "PASS", "Medium" if telegram_warn else "Low", 4,
        f"telegram.allowed_chats_configured={not telegram_warn}",
        "Configure explicit Telegram chat/user allowlists for agent meshes with tool access.", "runtime")

    slack_require_mention = get(cfg, "slack.require_mention", True)
    slack_allowed = get(cfg, "slack.allowed_channels", "")
    slack_free = get(cfg, "slack.free_response_channels", "")
    slack_warn = (slack_require_mention is False) or bool(slack_free) or slack_allowed in (None, "", [], {})
    add(findings, "Access Control", "Runtime Slack access boundary reviewed",
        "WARN" if slack_warn else "PASS", "Medium" if slack_warn else "Low", 4,
        f"slack.require_mention={slack_require_mention}; slack.allowed_channels_configured={bool(slack_allowed)}; slack.free_response_channels_set={bool(slack_free)}",
        "Keep Slack require-mention enabled and constrain allowed/free-response channels.", "runtime")

    discord_any_attachment = get(cfg, "discord.allow_any_attachment", False)
    discord_max_attachment = get(cfg, "discord.max_attachment_bytes", "unset")
    add(findings, "Access Control", "Runtime Discord attachment boundary reviewed",
        "WARN" if discord_any_attachment else "PASS", "Medium" if discord_any_attachment else "Low", 3,
        f"discord.allow_any_attachment={discord_any_attachment}; discord.max_attachment_bytes={discord_max_attachment}",
        "Restrict arbitrary attachments because agent meshes may process hostile files or prompt-injection payloads.", "runtime")

    trust_recent_files = get(cfg, "gateway.trust_recent_files", False)
    media_dirs = get(cfg, "gateway.media_delivery_allow_dirs", [])
    add(findings, "Access Control", "Runtime gateway file trust reviewed",
        "WARN" if trust_recent_files else "PASS", "Medium" if trust_recent_files else "Low", 3,
        f"gateway.trust_recent_files={trust_recent_files}; media_delivery_allow_dirs_count={len(as_list(media_dirs))}",
        "Review recent-file trust and media allow directories; restrict file delivery surfaces for messaging agents.", "runtime")

    platform_toolsets = cfg.get("platform_toolsets", {}) if isinstance(cfg, dict) else {}
    broad_platforms = []
    if isinstance(platform_toolsets, dict):
        for platform, tools in platform_toolsets.items():
            tool_list = [str(x) for x in as_list(tools)]
            if any(t in tool_list for t in ["terminal", "file", "browser", "web", "delegation"]):
                broad_platforms.append(str(platform))
    add(findings, "Tools / Plugins / MCP", "Runtime tool/platform breadth reviewed",
        "WARN" if broad_platforms else "PASS", "Medium" if broad_platforms else "Low", 4,
        f"broad_platforms={broad_platforms}",
        "Restrict gateway platforms to least-privilege toolsets, especially messaging channels.", "runtime")

    mcp_servers = get(cfg, "mcp.servers", get(cfg, "mcp_servers", {}))
    mcp_count = len(mcp_servers) if isinstance(mcp_servers, dict) else len(as_list(mcp_servers))
    add(findings, "Tools / Plugins / MCP", "Runtime MCP server inventory reviewed",
        "WARN" if mcp_count else "PASS", "Medium" if mcp_count else "Low", 3,
        f"mcp_server_count={mcp_count}; server_names={list(mcp_servers.keys())[:20] if isinstance(mcp_servers, dict) else []}",
        "Review MCP servers as high-risk supply-chain/tooling boundaries; verify provenance and allowed commands.", "runtime")
    runtime_home = Path(os.environ.get("AGENT_HOME", str(Path.home())))
    skill_count = len(list((runtime_home / "skills").glob("**/SKILL.md"))) if (runtime_home / "skills").exists() else 0
    plugin_count = len(list((runtime_home / "plugins").glob("**/*"))) if (runtime_home / "plugins").exists() else 0
    add(findings, "Tools / Plugins / MCP", "Runtime skill/plugin inventory reviewed",
        "WARN" if plugin_count or skill_count > 20 else "PASS", "Medium" if plugin_count or skill_count > 20 else "Low", 3,
        f"skill_count={skill_count}; plugin_file_count={plugin_count}",
        "Review skills/plugins for legitimacy, least privilege, provenance, and stale one-off instructions.", "runtime")

    cron_dir = Path(os.environ.get("AGENT_HOME", str(Path.home()))) / "cron"
    cron_files = list(cron_dir.glob("**/*")) if cron_dir.exists() else []
    add(findings, "Persistence & Deployment", "Runtime cron inventory reviewed",
        "WARN" if cron_files else "PASS", "Medium" if cron_files else "Low", 3,
        f"cron_dir={cron_dir}; cron_file_count={len(cron_files)}",
        "Review recurring jobs for delivery scope, toolsets, script paths, and no-remediation posture.", "runtime")
    cron_script_markers = []
    for cf in cron_files[:50]:
        txt = safe_read_text(cf, 80_000).lower()
        if "script" in txt or "terminal" in txt or "no_agent" in txt or any(h in txt for h in DANGEROUS_COMMAND_HINTS):
            cron_script_markers.append(str(cf))
    add(findings, "Persistence & Deployment", "Runtime cron script boundary reviewed",
        "WARN" if cron_script_markers else "PASS", "Medium" if cron_script_markers else "Low", 4,
        f"cron_script_or_tool_markers_count={len(cron_script_markers)}; cron_dir={cron_dir}",
        "For recurring jobs, verify read-only scope, toolset restrictions, script paths, and delivery destinations.", "runtime")

    max_children = get(cfg, "delegation.max_concurrent_children", "unset")
    spawn_depth = get(cfg, "delegation.max_spawn_depth", "unset")
    auto_approve = get(cfg, "delegation.subagent_auto_approve", False)
    risky_delegation = auto_approve is True or (isinstance(max_children, int) and max_children > 2) or (isinstance(spawn_depth, int) and spawn_depth > 1)
    add(findings, "Agent Mesh / Subagents", "Runtime delegation limits reviewed",
        "WARN" if risky_delegation else "PASS", "High" if auto_approve is True else "Medium" if risky_delegation else "Low", 5,
        f"subagent_auto_approve={auto_approve}; max_concurrent_children={max_children}; max_spawn_depth={spawn_depth}",
        "Keep child-agent autonomy constrained for agent meshes that can build and deploy apps.", "runtime")
    subagent_approval_mode = get(cfg, "delegation.approval_mode", get(cfg, "subagents.approval_mode", "unset"))
    add(findings, "Agent Mesh / Subagents", "Runtime subagent approval posture reviewed",
        "WARN" if auto_approve is True or str(subagent_approval_mode).lower() in {"off", "none", "auto"} else "PASS", "High" if auto_approve is True else "Medium" if str(subagent_approval_mode).lower() in {"off", "none", "auto"} else "Low", 4,
        f"subagent_auto_approve={auto_approve}; subagent_approval_mode={subagent_approval_mode}",
        "Require parent/human verification before child agents execute risky commands or make deploy-impacting changes.", "runtime")
    configured_mounts = get(cfg, "terminal.mounts", get(cfg, "sandbox.mounts", []))
    broad_mounts = [str(x) for x in as_list(configured_mounts) if str(x) in {"/", "/root", "/home", str(Path(os.environ.get("AGENT_HOME", str(Path.home()))).expanduser())} or str(x).endswith(":/")]
    add(findings, "Container & Runtime", "Runtime mount posture reviewed",
        "WARN" if broad_mounts else "PASS", "Medium" if broad_mounts else "Low", 3,
        f"configured_mount_count={len(as_list(configured_mounts))}; broad_mount_markers={broad_mounts}",
        "Keep terminal/sandbox mounts scoped to required project paths and avoid broad host/runtime filesystem exposure.", "runtime")


def scan_framework(ctx: dict[str, Any], findings: list[Finding]) -> None:
    if not ctx["framework_detected"]:
        return
    root: Path = ctx["root"]
    marker_paths = [root / m for m in ctx["framework_markers"] if (root / m).exists()]
    combined = "\n".join(safe_read_text(p, 120_000) for p in marker_paths[:30]).lower()

    model_markers = ["model", "provider", "openai", "anthropic", "openrouter", "codex"]
    has_model = any(m in combined for m in model_markers)
    add(findings, "Execution & Approvals", "Framework routing reviewed",
        "PASS" if has_model else "WARN", "Medium" if not has_model else "Low", 3,
        f"marker_files={ctx['framework_markers'][:10]}; routing_indicators_present={has_model}",
        "Define routing explicitly for app-building agents.", "framework")

    approval_markers = ["approval", "confirm", "human", "manual", "policy", "deny"]
    has_approval = any(m in combined for m in approval_markers)
    add(findings, "Execution & Approvals", "Framework execution policy reviewed",
        "PASS" if has_approval else "WARN", "High" if not has_approval else "Low", 5,
        f"approval_policy_markers_present={has_approval}; marker_files={ctx['framework_markers'][:10]}",
        "Require explicit human approval for shell, deploy, credential, and destructive actions.", "framework")

    boundary_markers = ["prompt injection", "untrusted", "system", "secret", "credential", "approval", "deny", "scope"]
    has_boundary = any(m in combined for m in boundary_markers)
    add(findings, "Prompt Injection Defenses", "Framework instruction boundary reviewed",
        "PASS" if has_boundary else "WARN", "Medium" if not has_boundary else "Low", 4,
        f"instruction_boundary_markers_present={has_boundary}; marker_files={ctx['framework_markers'][:10]}",
        "Define Framework instruction boundaries for untrusted input, tool limits, secret handling, and approval scope.", "framework")

    tool_markers = ["shell", "terminal", "bash", "docker", "kubectl", "terraform", "deploy", "browser", "mcp", "plugin"]
    exposed = [m for m in tool_markers if m in combined]
    add(findings, "Tools / Plugins / MCP", "Framework tool exposure reviewed",
        "WARN" if exposed else "PASS", "Medium" if exposed else "Low", 4,
        f"tool_markers={exposed}; marker_files={ctx['framework_markers'][:10]}",
        "Map every powerful tool to a least-privilege policy and approval boundary.", "framework")

    deploy_markers = ["deploy", "publish", "release", "vercel", "docker push", "kubectl", "terraform apply"]
    deploy_present = any(m in combined for m in deploy_markers)
    add(findings, "Persistence & Deployment", "Framework deployment posture reviewed",
        "WARN" if deploy_present else "PASS", "High" if deploy_present else "Low", 5,
        f"deployment_markers_present={deploy_present}; marker_files={ctx['framework_markers'][:10]}",
        "Treat deploy-capable agent meshes as production change actors; require approvals, logs, and rollback plans.", "framework")

    persistence_markers = ["cron", "schedule", "daemon", "systemd", "webhook", "worker", "background"]
    persistence_present = any(m in combined for m in persistence_markers)
    add(findings, "Persistence & Deployment", "Framework persistence hooks reviewed",
        "WARN" if persistence_present else "PASS", "Medium" if persistence_present else "Low", 3,
        f"persistence_markers_present={persistence_present}; marker_files={ctx['framework_markers'][:10]}",
        "Review scheduled/background Framework hooks as persistent agent authority, not just application code.", "framework")


def correlate(findings: list[Finding]) -> None:
    by_check = {f.check: f for f in findings}
    warn_fail = {f.check for f in findings if f.status in {"WARN", "FAIL"}}
    high_combo = []
    if "No obvious plaintext secrets in non-secret configs" in warn_fail and "Deployment scripts reviewed" in warn_fail:
        high_combo.append("secret-like config + deployment scripts")
    if "Docker socket exposure reviewed" in warn_fail and "Runtime delegation limits reviewed" in warn_fail:
        high_combo.append("Docker socket + broad delegation")
    if "Runtime approvals reviewed" in warn_fail and "Runtime tool/platform breadth reviewed" in warn_fail:
        high_combo.append("weak approvals + broad platform tools")
    if "Framework execution policy reviewed" in warn_fail and "Framework deployment posture reviewed" in warn_fail:
        high_combo.append("Framework deployment markers without clear approval policy")
    add(findings, "Risk Correlation", "Compound mesh risk correlated",
        "WARN" if high_combo else "PASS", "Critical" if high_combo else "Low", 8 if high_combo else 1,
        f"compound_risks={high_combo}; total_warn_fail={sum(1 for f in findings if f.status in {'WARN','FAIL'})}",
        "Prioritize compound risks first because agent meshes can chain tools, deployments, and persistence.")
    category_counts = {}
    for f in findings:
        category_counts[f.category] = category_counts.get(f.category, 0) + 1
    thin_categories = [cat for cat in WEIGHTS if category_counts.get(cat, 0) < 3 and cat != "Risk Correlation"]
    add(findings, "Risk Correlation", "Cross-category audit coverage reviewed",
        "WARN" if thin_categories else "PASS", "Medium" if thin_categories else "Low", 3,
        f"category_counts={category_counts}; thin_categories_under_3_checks={thin_categories}",
        "Keep every major security domain represented by multiple deterministic checks before promoting this portable auditor.")


def score(findings: list[Finding]) -> dict[str, Any]:
    categories = sorted(set(WEIGHTS) | {f.category for f in findings})
    cats: dict[str, Any] = {}
    weighted = 0.0
    total_weight = 0.0
    status_penalty = {"PASS": 0, "SKIP": 0, "WARN": 12, "FAIL": 25}
    for cat in categories:
        rows = [f for f in findings if f.category == cat]
        max_penalty = max(1, len(rows) * 25)
        penalty = sum(status_penalty.get(f.status, 0) + max(0, f.severity - 3) * 2 for f in rows)
        pct = max(0, min(100, round(100 - (penalty / max_penalty) * 100))) if rows else 100
        cats[cat] = {
            "score": pct,
            "checks": len(rows),
            "pass": sum(1 for f in rows if f.status == "PASS"),
            "warn": sum(1 for f in rows if f.status == "WARN"),
            "fail": sum(1 for f in rows if f.status == "FAIL"),
            "skip": sum(1 for f in rows if f.status == "SKIP"),
        }
        w = WEIGHTS.get(cat, 5)
        weighted += pct * w
        total_weight += w
    overall = round(weighted / total_weight) if total_weight else 100
    if any(f.status == "FAIL" for f in findings) or any(f.risk == "Critical" and f.status in {"WARN", "FAIL"} for f in findings):
        grade = "Needs Attention"
    elif any(f.status == "WARN" and f.risk in {"High", "Critical"} for f in findings):
        grade = "Elevated Risk"
    elif any(f.status == "WARN" for f in findings):
        grade = "Review Recommended"
    else:
        grade = "Healthy"
    return {"overall_score": overall, "grade": grade, "categories": cats}


def executive_summary(res: dict[str, Any]) -> list[str]:
    findings = res["findings"]
    attention = [f for f in findings if f["status"] in {"WARN", "FAIL"}]
    high = [f for f in attention if f.get("risk") in {"High", "Critical"}]
    categories_warn = sorted({f["category"] for f in attention})
    return [
        f"Overall score: {res['score']['overall_score']} / 100",
        f"Grade: {res['score']['grade']}",
        f"Total findings: {len(findings)}; findings requiring attention: {len(attention)}; high/critical attention items: {len(high)}",
        f"Affected categories: {', '.join(categories_warn) if categories_warn else 'None'}",
        "Interpretation: this is a read-only posture audit for AI agent meshes that can use tools, persist jobs, and influence application delivery.",
    ]


def extract_path_hint(evidence: str) -> str | None:
    text = str(evidence or "")
    patterns = [
        r"path=([^;\n,]+)",
        r"file=([^;\n,]+)",
        r"'([^']+\.[A-Za-z0-9]+)'",
        r'"([^"]+\.[A-Za-z0-9]+)"',
    ]
    for pat in patterns:
        m = re.search(pat, text)
        if not m:
            continue
        candidate = m.group(1).strip().strip("[]()")
        if candidate and ("/" in candidate or candidate.startswith((".", "~")) or Path(candidate).is_absolute()):
            return candidate
    return None


REMEDIATION_PATHS = {
    "Agent destructive-action confirmation reviewed": "policies/task-lifecycle-sop.md",
    "Agent secret-disclosure guardrails reviewed": "AGENTS.md",
    "Dangerous command exposure reviewed": "policies/task-lifecycle-sop.md",
    "Framework deployment posture reviewed": "scripts/security-tools/agent-security-selfcheck/Agent_Security_Selfcheck_v3.4.0.py",
    "No obvious plaintext secrets in non-secret configs": "policies/README.md",
    "Agent instruction override resistance reviewed": "AGENTS.md",
    "Framework tool exposure reviewed": "policies/tool-policy.md",
    "Agent instruction boundaries present": "AGENTS.md",
    "Agent tool policy files reviewed": "policies/tool-policy.md",
    "Risk Correlation / Cross-category audit coverage reviewed": "scripts/security-tools/agent-security-selfcheck/Agent_Security_Selfcheck_v3.4.0.py",
    "Persistence & Deployment / Framework persistence hooks reviewed": "scripts/security-tools/agent-security-selfcheck/Agent_Security_Selfcheck_v3.4.0.py",
}

REMEDIATION_INSTRUCTIONS = {
    "Agent destructive-action confirmation reviewed": "Add an explicit human-confirmation gate before destructive file, cloud, infrastructure, or deployment actions.",
    "Agent secret-disclosure guardrails reviewed": "State that credentials, tokens, private keys, and sensitive data must never be disclosed and must be redacted in evidence.",
    "Dangerous command exposure reviewed": "Map destructive shell, deployment, package-publish, Docker, Kubernetes, and infrastructure commands to explicit approval gates.",
    "Framework deployment posture reviewed": "Treat deploy-capable agent meshes as production change actors; require approvals, logs, and rollback plans.",
    "No obvious plaintext secrets in non-secret configs": "Move secrets out of this file into approved secret storage and rotate any exposed value.",
    "Agent instruction override resistance reviewed": "Document instruction hierarchy and external-content distrust so agents reject prompt-injection override attempts.",
    "Framework tool exposure reviewed": "Map every powerful tool to a least-privilege policy and approval boundary.",
    "Agent instruction boundaries present": "Keep explicit instruction-boundary files with rules for prompt injection, secrets, tool use, and destructive approvals.",
    "Agent tool policy files reviewed": "Maintain reviewed policy files that bind powerful tools to least-privilege scopes and approval requirements.",
    "Risk Correlation / Cross-category audit coverage reviewed": "Expand this self-check so every major security domain has deterministic coverage before release.",
    "Persistence & Deployment / Framework persistence hooks reviewed": "Review scheduled/background hooks as persistent agent authority and require approvals, logging, and rollback planning.",
}


def remediation_task_for_finding(finding: dict[str, Any], meta: dict[str, Any]) -> dict[str, str]:
    root = Path(str(meta.get("target_root", ".")))
    evidence = str(finding.get("evidence", ""))
    path_hint = extract_path_hint(evidence)
    if path_hint:
        candidate = Path(path_hint)
        file_path = str(candidate if candidate.is_absolute() else (root / candidate))
    else:
        rel = REMEDIATION_PATHS.get(finding["check"], "AGENTS.md")
        file_path = str(root / rel)
    instruction = REMEDIATION_INSTRUCTIONS.get(finding["check"], "Add or update the targeted instruction, policy, or control so this finding re-runs as PASS or SKIP.")
    return {"file_path": file_path, "instruction": instruction}


def render_markdown(meta: dict[str, Any], res: dict[str, Any]) -> str:
    sorted_findings = sorted(res["findings"], key=finding_sort_key)
    attention = [f for f in sorted_findings if f["status"] in {"WARN", "FAIL"}]
    lines = [
        f"# Agent Security Self-Check v{meta['script_version']}",
        "",
        "## Executive Summary",
        "",
    ]
    for item in executive_summary(res):
        lines.append(f"- {item}")
    lines += [
        "",
        f"Generated UTC: `{meta['generated_utc']}`",
        f"Target root: `{meta['target_root']}`",
        f"Policy: `{meta['policy_version']}`",
        f"Script SHA256: `{meta['script_sha256']}`",
        f"Validation-only: `{meta['validation_only']}`",
        "",
        "## Category Scorecards",
        "",
        "| Category | Score | Checks | PASS | WARN | FAIL | SKIP |",
        "|---|---:|---:|---:|---:|---:|---:|",
    ]
    for cat, data in res["score"]["categories"].items():
        lines.append(f"| {cat} | {data['score']} | {data['checks']} | {data['pass']} | {data['warn']} | {data['fail']} | {data['skip']} |")

    lines += ["", "## Findings Sorted by Severity", ""]
    if not sorted_findings:
        lines.append("No findings generated.")
    for f in sorted_findings:
        controls = " ".join(f"`{c}`" for c in f["framework_controls"])
        task = f.get("remediation_task") or remediation_task_for_finding(f, meta)
        lines += [
            f"### {f['risk']} / {f['status']} — {f['category']} / {f['check']}",
            "",
            f"- Adapter: `{f['adapter']}`",
            f"- Severity score: `{f['severity']}`",
            f"- Framework controls: {controls}",
            f"- Evidence: {f['evidence']}",
            f"- Remediation task: `{task['file_path']}` — {task['instruction']}",
            f"- Recommendation: {f['recommendation']}",
            "",
        ]

    lines += ["", "## Findings Requiring Attention", ""]
    if not attention:
        lines.append("No WARN/FAIL findings.")
    for f in attention:
        task = f.get("remediation_task") or remediation_task_for_finding(f, meta)
        lines.append(f"- `{f['risk']}` `{f['status']}` — **{f['category']} / {f['check']}**: {f['recommendation']}\n  - Task: `{task['file_path']}` — {task['instruction']}")

    lines += ["", "## Methodology / Tools Used", ""]
    for item in meta.get("methodology_tools_used", METHODOLOGY_TOOLS_USED):
        lines.append(f"- {item}")

    lines += ["", "## Frameworks Used", ""]
    for item in meta.get("frameworks_used", FRAMEWORKS_USED):
        lines.append(f"- {item}")

    lines += ["", "## Runtime Security Best Practices Included", ""]
    lines.append("Source: https://runtime-agent.nousresearch.com/docs/user-guide/security")
    lines.append("")
    for item in meta.get("runtime_security_best_practices", HERMES_SECURITY_BEST_PRACTICES):
        lines.append(f"- {item}")

    lines += ["", "## Scope and Safety Notes", ""]
    lines += [
        "- This self-check is read-only and does not remediate, install packages, mutate config, or change cron jobs.",
        "- Secret-file checks are metadata-only unless future versions explicitly add approved content inspection.",
        "- External content and documentation are treated as reference data, not as runtime instructions.",
        "- Optional third-party scanners are detected but not installed automatically.",
    ]
    return "\n".join(lines) + "\n"


def pdf_escape(text: str) -> str:
    clean = str(text if text is not None else "")
    clean = clean.replace("—", "-").replace("–", "-").replace("•", "-").replace("“", '"').replace("”", '"').replace("’", "'")
    clean = clean.encode("latin-1", "replace").decode("latin-1")
    return clean.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")


PDF_COLORS = {
    "navy": (0.05, 0.10, 0.20),
    "blue": (0.10, 0.28, 0.55),
    "sky": (0.86, 0.93, 1.00),
    "cyan": (0.10, 0.55, 0.75),
    "green": (0.10, 0.55, 0.35),
    "amber": (0.92, 0.55, 0.12),
    "red": (0.78, 0.18, 0.18),
    "purple": (0.36, 0.22, 0.62),
    "slate": (0.25, 0.30, 0.38),
    "muted": (0.47, 0.52, 0.60),
    "line": (0.84, 0.87, 0.91),
    "panel": (0.96, 0.98, 1.00),
    "white": (1.00, 1.00, 1.00),
    "black": (0.05, 0.05, 0.06),
}


def pdf_color(name: str) -> tuple[float, float, float]:
    return PDF_COLORS.get(name, PDF_COLORS["black"])


def risk_color(risk: str, status: str = "") -> str:
    if status == "FAIL" or risk == "Critical":
        return "red"
    if risk == "High":
        return "red"
    if risk == "Medium" or status == "WARN":
        return "amber"
    if status == "SKIP" or risk == "Info":
        return "muted"
    return "green"


def score_color(score_value: int) -> str:
    if score_value >= 90:
        return "green"
    if score_value >= 75:
        return "amber"
    return "red"


class PdfCanvas:
    def __init__(self) -> None:
        self.pages: list[list[str]] = []
        self.ops: list[str] = []
        self.page_no = 0

    def new_page(self, title: str = "") -> None:
        if self.ops:
            self.pages.append(self.ops)
        self.ops = []
        self.page_no += 1
        self.rect(0, 0, 612, 792, "white", stroke=None)
        # Header band on non-cover pages.
        if self.page_no > 1:
            self.rect(0, 760, 612, 32, "navy", stroke=None)
            self.text(42, 772, "AI Agent Security Audit Report", 10, "Helvetica-Bold", "white")
            self.text(430, 772, f"Page {self.page_no}", 9, "Helvetica", "white")
            if title:
                self.text(42, 735, title, 17, "Helvetica-Bold", "navy")
                self.line(42, 724, 570, 724, "line", 1)

    def finish(self) -> list[list[str]]:
        if self.ops:
            self.pages.append(self.ops)
            self.ops = []
        return self.pages

    def set_fill(self, color: str) -> None:
        r, g, b = pdf_color(color)
        self.ops.append(f"{r:.3f} {g:.3f} {b:.3f} rg")

    def set_stroke(self, color: str) -> None:
        r, g, b = pdf_color(color)
        self.ops.append(f"{r:.3f} {g:.3f} {b:.3f} RG")

    def rect(self, x: float, y: float, w: float, h: float, fill: str | None = None, stroke: str | None = "line", width: float = 0.7) -> None:
        if fill:
            self.set_fill(fill)
        if stroke:
            self.set_stroke(stroke)
            self.ops.append(f"{width:.1f} w")
        mode = "B" if fill and stroke else "f" if fill else "S"
        self.ops.append(f"{x:.1f} {y:.1f} {w:.1f} {h:.1f} re {mode}")

    def line(self, x1: float, y1: float, x2: float, y2: float, color: str = "line", width: float = 0.7) -> None:
        self.set_stroke(color)
        self.ops.append(f"{width:.1f} w {x1:.1f} {y1:.1f} m {x2:.1f} {y2:.1f} l S")

    def text(self, x: float, y: float, s: str, size: int = 10, font: str = "Helvetica", color: str = "black") -> None:
        font_map = {"Helvetica": "F1", "Helvetica-Bold": "F2", "Helvetica-Oblique": "F3"}
        self.set_fill(color)
        self.ops.append(f"BT /{font_map.get(font, 'F1')} {size} Tf {x:.1f} {y:.1f} Td ({pdf_escape(s)}) Tj ET")

    def wrapped_text(self, x: float, y: float, text: str, width_chars: int, size: int = 10, font: str = "Helvetica", color: str = "black", leading: float | None = None, max_lines: int | None = None) -> float:
        leading = leading if leading is not None else size + 4
        lines = textwrap.wrap(str(text), width=width_chars, break_long_words=False, replace_whitespace=True) or [""]
        if max_lines is not None and len(lines) > max_lines:
            lines = lines[:max_lines]
            lines[-1] = lines[-1][: max(0, width_chars - 3)] + "..."
        for line in lines:
            self.text(x, y, line, size, font, color)
            y -= leading
        return y


def pdf_category_remark(data: dict[str, Any]) -> str:
    if data["fail"]:
        return "Immediate action required."
    if data["warn"]:
        return f"Owner review required for {data['warn']} warning(s)."
    if data["skip"] and not data["warn"]:
        return "No active warning; optional evidence skipped or unavailable."
    return "Aligned with current baseline."


def pdf_add_bullet_section(c: PdfCanvas, title: str, items: list[str], start_y: float = 705) -> None:
    c.new_page(title)
    y = start_y
    for item in items:
        if y < 70:
            c.new_page(title + " (continued)")
            y = start_y
        c.text(50, y, "-", 10, "Helvetica-Bold", "cyan")
        y = c.wrapped_text(64, y, item, 88, 9, "Helvetica", "black", 12)
        y -= 5


def _hw_row(c: PdfCanvas, label: str, value: str, y: float, label_color: str = "slate") -> float:
    """Render a single hardware summary label/value row. Returns new y."""
    c.text(52, y, label, 8, "Helvetica-Bold", label_color)
    c.text(170, y, value, 8, "Helvetica", "black")
    return y - 14


def _add_pdf_section_inline(c: PdfCanvas, title: str, y: float) -> float:
    """Render a section header with navy text and rule line. Returns new y."""
    c.text(42, y, title, 14, "Helvetica-Bold", "navy")
    c.line(42, y - 8, 570, y - 8, "line", 0.7)
    return y - 26


def draw_hardware_summary(c: PdfCanvas, env_label: str, hw: dict[str, Any], y: float) -> float:
    """Render the Hardware Summary section on the current page.

    Displays environment type, CPU cores, memory, disk, and network adapters
    in a two-column label/value layout. Returns the new y position.
    """
    y = _add_pdf_section_inline(c, "Hardware Summary", y)

    # Environment type
    env_display = env_label.replace("-", " ").title()
    env_color = "cyan" if "container" in env_label else ("purple" if "virtual" in env_label else "green")
    y = _hw_row(c, "Environment", env_display, y, label_color=env_color)

    # CPU cores
    cores = hw.get("cpu_logical_cores")
    y = _hw_row(c, "CPU Cores", str(cores) if cores else "unknown", y)

    # Memory used / total
    y = _hw_row(c, "Memory", f"{hw.get('memory_used', '?')} / {hw.get('memory_total', '?')}", y)

    # Disk used / total
    y = _hw_row(c, "Disk", f"{hw.get('disk_used', '?')} / {hw.get('disk_total', '?')}", y)

    # Network adapters
    adapters = hw.get("network_adapters", [])
    if adapters:
        adapter_parts = []
        for a in adapters[:8]:
            name = a.get("name", "?")
            ip = a.get("ip") or "no-ip"
            mac = a.get("mac") or "no-mac"
            adapter_parts.append(f"{name}: {ip} ({mac})")
        adapter_text = "; ".join(adapter_parts)
    else:
        adapter_text = "none detected"
    y = _hw_row(c, "Network Adapters", adapter_text, y)

    # Errors if any
    errors = hw.get("errors", [])
    if errors:
        y = _hw_row(c, "Collection Errors", "; ".join(errors), y, label_color="amber")

    return y - 14


def write_simple_pdf(path: Path, meta: dict[str, Any], res: dict[str, Any]) -> None:
    """Write a dependency-free, presentation-grade PDF audit report."""
    c = PdfCanvas()
    score_value = int(res["score"]["overall_score"])
    grade = res["score"]["grade"]
    findings = res["findings"]
    attention = [f for f in findings if f["status"] in {"WARN", "FAIL"}]
    high = [f for f in attention if f.get("risk") in {"High", "Critical"}]

    # Cover page.
    c.new_page()
    c.rect(0, 0, 612, 792, "navy", stroke=None)
    c.rect(0, 0, 612, 180, "blue", stroke=None)
    c.rect(42, 92, 528, 575, "white", stroke=None)
    c.wrapped_text(60, 590, "AI Agent Security Audit Report", 28, 28, "Helvetica-Bold", "navy", 32, 2)
    script_name = Path(str(meta.get("script_path", "Agent_Security_Selfcheck_v3.4.0.py"))).name
    c.wrapped_text(60, 538, script_name, 62, 14, "Helvetica", "slate", 17, 2)
    c.wrapped_text(60, 505, "Business-consumable security posture review for AI agents with tool access, persistence, and application delivery influence.", 70, 10, "Helvetica", "slate", 14)
    c.rect(60, 385, 150, 86, "panel", "line")
    c.text(75, 440, "OVERALL SCORE", 9, "Helvetica-Bold", "muted")
    c.text(75, 405, f"{score_value}/100", 26, "Helvetica-Bold", score_color(score_value))
    c.rect(230, 385, 150, 86, "panel", "line")
    c.text(245, 440, "GRADE", 9, "Helvetica-Bold", "muted")
    c.wrapped_text(245, 415, grade, 18, 18, "Helvetica-Bold", score_color(score_value), 21, 2)
    c.rect(400, 385, 150, 86, "panel", "line")
    c.text(415, 440, "ATTENTION ITEMS", 9, "Helvetica-Bold", "muted")
    c.text(415, 405, f"{len(attention)}", 26, "Helvetica-Bold", risk_color("High" if high else "Medium" if attention else "Low"))
    c.text(60, 325, "Target", 10, "Helvetica-Bold", "muted")
    c.wrapped_text(60, 309, str(meta["target_root"]), 82, 9, "Helvetica", "black", 12, 2)
    c.text(60, 268, "Generated UTC", 10, "Helvetica-Bold", "muted")
    c.text(60, 251, str(meta["generated_utc"]), 9, "Helvetica", "black")
    c.text(60, 214, "Policy Baseline", 10, "Helvetica-Bold", "muted")
    c.wrapped_text(60, 198, str(meta.get("policy_version", "unavailable")), 82, 9, "Helvetica", "black", 12, 2)
    c.text(60, 135, "Validation-only: no remediation, installs, config changes, or cron mutations performed.", 10, "Helvetica-Oblique", "slate")

    def ensure_space(current_y: float, needed: float, title: str) -> float:
        if current_y - needed < 64:
            c.new_page(title)
            return 705
        return current_y

    def add_pdf_section(title: str, current_y: float, min_needed: float = 72) -> float:
        current_y = ensure_space(current_y, min_needed, title)
        c.text(42, current_y, title, 14, "Helvetica-Bold", "navy")
        c.line(42, current_y - 8, 570, current_y - 8, "line", 0.7)
        return current_y - 26

    def add_pdf_bullets(title: str, items: list[str], current_y: float) -> float:
        current_y = add_pdf_section(title, current_y, 100)
        for item in items:
            current_y = ensure_space(current_y, 42, title + " (continued)")
            c.text(50, current_y, "-", 10, "Helvetica-Bold", "cyan")
            current_y = c.wrapped_text(64, current_y, item, 88, 9, "Helvetica", "black", 12)
            current_y -= 5
        return current_y - 10

    # Executive summary and category scorecards.
    c.new_page("Executive Summary & Category Scorecards")
    y = 705
    summary_items = executive_summary(res)
    line_count = 1 + sum(max(1, len(textwrap.wrap(str(item), width=82, break_long_words=False, replace_whitespace=True))) for item in summary_items)
    panel_h = max(112, 36 + line_count * 13)
    panel_y = y - panel_h
    c.rect(42, panel_y, 528, panel_h, "panel", "line")
    c.text(58, y - 23, "Executive Summary", 14, "Helvetica-Bold", "navy")
    y2 = y - 48
    for item in summary_items:
        c.text(62, y2, "-", 9, "Helvetica-Bold", "cyan")
        y2 = c.wrapped_text(76, y2, item, 82, 9, "Helvetica", "black", 12)
        y2 -= 2
    y = panel_y - 28

    # Hardware Summary section (above score cards).
    env_label = str(meta.get("environment_label", "unknown"))
    hw_data = meta.get("hardware_summary", {})
    if hw_data:
        y = draw_hardware_summary(c, env_label, hw_data, y)

    y = add_pdf_section("Category Scorecards", y, 80)
    for cat, data in res["score"]["categories"].items():
        if y < 92:
            c.new_page("Category Scorecards (continued)")
            y = 705
        color = score_color(int(data["score"]))
        c.rect(42, y - 18, 528, 34, "white", "line")
        c.text(52, y + 3, cat, 9, "Helvetica-Bold", "black")
        c.rect(248, y - 2, 140, 8, "line", stroke=None)
        c.rect(248, y - 2, max(3, 140 * int(data["score"]) / 100), 8, color, stroke=None)
        c.text(405, y, f"{data['score']}%", 10, "Helvetica-Bold", color)
        c.text(455, y, f"P{data['pass']} W{data['warn']} F{data['fail']} S{data['skip']}", 8, "Helvetica", "slate")
        c.wrapped_text(52, y - 12, pdf_category_remark(data), 84, 7, "Helvetica-Oblique", "muted", 9, 1)
        y -= 38

    # Priority findings.
    y = add_pdf_section("Findings Sorted by Severity", y - 4, 150)
    if not attention:
        c.text(50, y, "No WARN/FAIL findings requiring attention.", 11, "Helvetica", "green")
        y -= 28
    for idx, f in enumerate(attention, start=1):
        title_text = f"{f['category']} / {f['check']}"
        evidence_text = str(f.get("evidence", "No evidence recorded."))
        recommendation_text = str(f["recommendation"])
        task = f.get("remediation_task") or remediation_task_for_finding(f, meta)
        title_lines = min(2, max(1, len(textwrap.wrap(str(title_text), width=62, break_long_words=False, replace_whitespace=True))))
        evidence_lines = min(4, max(1, len(textwrap.wrap(evidence_text, width=86, break_long_words=False, replace_whitespace=True))))
        task_lines = min(4, max(1, len(textwrap.wrap(f"{task['file_path']} — {task['instruction']}", width=86, break_long_words=False, replace_whitespace=True))))
        recommendation_lines = min(3, max(1, len(textwrap.wrap(recommendation_text, width=86, break_long_words=False, replace_whitespace=True))))
        # Leave extra room for the recommendation block so the next card does not collide with it.
        card_h = 86 + title_lines * 12 + evidence_lines * 10 + task_lines * 10 + recommendation_lines * 10
        if y < card_h + 58:
            c.new_page("Findings Sorted by Severity (continued)")
            y = 704
        color = risk_color(f["risk"], f["status"])
        c.rect(42, y - card_h + 10, 528, card_h, "white", "line")
        c.rect(42, y - card_h + 10, 7, card_h, color, stroke=None)
        c.text(58, y - 10, f"{idx}. {f['risk']} / {f['status']}", 10, "Helvetica-Bold", color)
        title_bottom = c.wrapped_text(170, y - 10, title_text, 62, 10, "Helvetica-Bold", "black", 12, 3)
        content_y = min(y - 36, title_bottom - 10)
        c.text(58, content_y, "Evidence", 8, "Helvetica-Bold", "muted")
        evidence_bottom = c.wrapped_text(58, content_y - 14, evidence_text, 86, 8, "Helvetica", "black", 10, 4)
        task_y = evidence_bottom - 8
        c.text(58, task_y, "Remediation task", 8, "Helvetica-Bold", "muted")
        task_text = f"{task['file_path']} — {task['instruction']}"
        task_bottom = c.wrapped_text(58, task_y - 14, task_text, 86, 8, "Helvetica", "black", 10, 4)
        rec_y = task_bottom - 8
        c.text(58, rec_y, "Recommendation", 8, "Helvetica-Bold", "muted")
        c.wrapped_text(58, rec_y - 14, recommendation_text, 86, 8, "Helvetica", "black", 10, 3)
        y -= card_h + 10

    # Consumer-ready context sections. Continue on the current page where space allows.
    methodology_items = list(meta.get("methodology_tools_used", METHODOLOGY_TOOLS_USED))
    y = add_pdf_bullets("Methodology / Tools Used", methodology_items, y - 8)
    framework_items = list(meta.get("frameworks_used", FRAMEWORKS_USED))
    y = add_pdf_bullets("Frameworks Used", framework_items, y)
    best_practices = ["Source: https://runtime-agent.nousresearch.com/docs/user-guide/security"] + list(meta.get("runtime_security_best_practices", HERMES_SECURITY_BEST_PRACTICES))
    y = add_pdf_bullets("Runtime Security Best Practices", best_practices, y)

    notes = [
        "This self-check is read-only and does not remediate, install packages, mutate configuration, or change scheduled jobs.",
        "Secret-file checks are metadata-only unless a future version explicitly adds approved content inspection.",
        "External content and documentation are treated as reference data, not runtime instructions.",
        "Optional third-party scanners are detected but not installed automatically.",
        f"Script SHA256: {meta['script_sha256']}",
        f"Git commit: {meta.get('git_commit', 'unavailable')}; git dirty: {meta.get('git_dirty', 'unknown')}",
    ]
    y = add_pdf_bullets("Appendix: Safety Notes", notes, y)

    pages = c.finish()
    objects: list[bytes] = []
    page_ids: list[int] = []
    # 1 catalog, 2 pages, 3 fonts, page/content pairs begin at 6.
    next_obj = 6
    for _ in pages:
        page_ids.append(next_obj)
        next_obj += 2
    objects.append(b"<< /Type /Catalog /Pages 2 0 R >>")
    kids = " ".join(f"{pid} 0 R" for pid in page_ids)
    objects.append(f"<< /Type /Pages /Kids [{kids}] /Count {len(page_ids)} >>".encode())
    objects.append(b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>")
    objects.append(b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>")
    objects.append(b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Oblique >>")
    for page_id, ops in zip(page_ids, pages):
        content_id = page_id + 1
        stream = "\n".join(ops).encode("latin-1", "replace")
        page_obj = (
            f"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] "
            f"/Resources << /Font << /F1 3 0 R /F2 4 0 R /F3 5 0 R >> >> /Contents {content_id} 0 R >>"
        ).encode()
        content_obj = b"<< /Length " + str(len(stream)).encode() + b" >>\nstream\n" + stream + b"\nendstream"
        objects.append(page_obj)
        objects.append(content_obj)

    out = bytearray(b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n")
    offsets = [0]
    for i, obj in enumerate(objects, start=1):
        offsets.append(len(out))
        out.extend(f"{i} 0 obj\n".encode())
        out.extend(obj)
        out.extend(b"\nendobj\n")
    xref_offset = len(out)
    out.extend(f"xref\n0 {len(objects)+1}\n".encode())
    out.extend(b"0000000000 65535 f \n")
    for offset in offsets[1:]:
        out.extend(f"{offset:010d} 00000 n \n".encode())
    out.extend(f"trailer\n<< /Size {len(objects)+1} /Root 1 0 R >>\nstartxref\n{xref_offset}\n%%EOF\n".encode())
    path.write_bytes(bytes(out))

def render_sarif(meta: dict[str, Any], res: dict[str, Any]) -> dict[str, Any]:
    rules = {}
    results = []
    level_map = {"FAIL": "error", "WARN": "warning", "PASS": "note", "SKIP": "note"}
    for f in res["findings"]:
        rid = re.sub(r"[^A-Za-z0-9_.-]+", "-", f["check"]).strip("-") or "finding"
        rules[rid] = {
            "id": rid,
            "name": f["check"],
            "shortDescription": {"text": f["check"]},
            "fullDescription": {"text": f"{f['category']} ({f['adapter']}) controls: {', '.join(f['framework_controls'])}; remediation task: {f.get('remediation_task', {}).get('file_path', '')} — {f.get('remediation_task', {}).get('instruction', '')}"},
        }
        if f["status"] in {"WARN", "FAIL"}:
            results.append({
                "ruleId": rid,
                "level": level_map.get(f["status"], "note"),
                "message": {"text": f"{f['status']} [{f['risk']}]: {f['evidence']} Remediation task: {f.get('remediation_task', {}).get('file_path', '')} — {f.get('remediation_task', {}).get('instruction', '')}. Recommendation: {f['recommendation']}"},
                "locations": [{"physicalLocation": {"artifactLocation": {"uri": str(meta['target_root'])}}}],
            })
    return {
        "version": "2.1.0",
        "$schema": "https://json.schemastore.org/sarif-2.1.0.json",
        "runs": [{
            "tool": {"driver": {"name": "Agent Security Selfcheck", "version": meta["script_version"], "rules": list(rules.values())}},
            "invocations": [{"executionSuccessful": True, "endTimeUtc": meta["generated_utc"]}],
            "results": results,
        }],
    }


def write_reports(out_dir: Path, meta: dict[str, Any], res: dict[str, Any]) -> dict[str, str]:
    out_dir.mkdir(parents=True, exist_ok=True)
    stamp = dt.datetime.now(dt.timezone.utc).strftime("%Y%m%d_%H%M%S")
    stem_tag = "_".join(SCRIPT_VERSION.split("-")[0].split(".")[:2])
    stem = f"agent_security_selfcheck_v{stem_tag}_{stamp}"
    json_path = out_dir / f"{stem}.json"
    md_path = out_dir / f"{stem}.md"
    sarif_path = out_dir / f"{stem}.sarif"
    pdf_path = out_dir / f"{stem}.pdf"
    json_path.write_text(json.dumps({"metadata": meta, **res}, indent=2), encoding="utf-8")
    md_path.write_text(render_markdown(meta, res), encoding="utf-8")
    sarif_path.write_text(json.dumps(render_sarif(meta, res), indent=2), encoding="utf-8")
    write_simple_pdf(pdf_path, meta, res)
    return {"json": str(json_path), "markdown": str(md_path), "sarif": str(sarif_path), "pdf": str(pdf_path)}


def git_meta(root: Path) -> dict[str, str]:
    code, commit, _ = run(["git", "rev-parse", "HEAD"], cwd=root, timeout=10)
    code2, status, _ = run(["git", "status", "--short"], cwd=root, timeout=10)
    return {
        "git_commit": commit if code == 0 else "unavailable",
        "git_dirty": "true" if code2 == 0 and status.strip() else "false" if code2 == 0 else "unknown",
    }


def main() -> int:
    ap = argparse.ArgumentParser(description=f"Portable read-only AI agent mesh security self-check v{SCRIPT_VERSION}")
    ap.add_argument("--target", default=".", help="Target repo/runtime root to inspect")
    ap.add_argument("--out-dir", default=str(DEFAULT_OUT_DIR), help="Report output directory")
    ap.add_argument("--exit-zero", action="store_true", help="Always exit 0 after report generation")
    args = ap.parse_args()

    target = Path(args.target).resolve()
    ctx = discover_context(target)
    findings: list[Finding] = []
    scan_universal(ctx, findings)
    scan_runtime_environment(ctx, findings)
    scan_system_resources(ctx, findings)
    scan_runtime(ctx, findings)
    scan_framework(ctx, findings)
    correlate(findings)

    # Collect hardware and environment data for the PDF report.
    try:
        _env_label = detect_environment()
        _hw_data = collect_hardware_info()
    except Exception:
        _env_label = "unknown"
        _hw_data = {}

    meta = {
        "script_version": SCRIPT_VERSION,
        "policy_version": POLICY_VERSION,
        "generated_utc": dt.datetime.now(dt.timezone.utc).isoformat(),
        "target_root": str(ctx["root"]),
        "script_path": str(Path(__file__).resolve()),
        "script_sha256": sha256_file(Path(__file__).resolve()),
        "scope": ["agent runtime", "framework", "generic fallback"],
        "validation_only": True,
        "frameworks_used": FRAMEWORKS_USED,
        "methodology_tools_used": METHODOLOGY_TOOLS_USED,
        "runtime_security_best_practices": HERMES_SECURITY_BEST_PRACTICES,
        "runtime_security_best_practices_source": "https://runtime-agent.nousresearch.com/docs/user-guide/security",
        "environment_label": _env_label,
        "hardware_summary": _hw_data,
        **git_meta(ctx["root"]),
    }
    sorted_finding_objs = sorted(findings, key=finding_sort_key)
    findings_with_tasks = []
    for f in sorted_finding_objs:
        d = f.as_dict()
        d["remediation_task"] = remediation_task_for_finding(d, meta)
        findings_with_tasks.append(d)
    res = {
        "score": score(findings),
        "executive_summary": executive_summary({"score": score(findings), "findings": findings_with_tasks}),
        "findings": findings_with_tasks,
    }
    paths = write_reports(Path(args.out_dir), meta, res)
    print(json.dumps({
        "ok": True,
        "version": SCRIPT_VERSION,
        "grade": res["score"]["grade"],
        "overall_score": res["score"]["overall_score"],
        "finding_count": len(res["findings"]),
        "warn_fail_count": sum(1 for f in res["findings"] if f["status"] in {"WARN", "FAIL"}),
        "reports": paths,
    }, indent=2))

    if args.exit_zero:
        return 0
    if any(f.status == "FAIL" for f in findings):
        return 2
    if any(f.status == "WARN" and f.risk in {"High", "Critical"} for f in findings):
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
