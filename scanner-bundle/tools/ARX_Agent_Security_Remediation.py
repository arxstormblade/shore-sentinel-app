#!/usr/bin/env python3
"""ARX_Agent_Security_Remediation.py — separate ARX/Hermes remediation planner/applier.
Dry-run by default. Requires --apply plus explicit human approval to write changes. Creates backup first.
"""
from __future__ import annotations
import argparse, datetime as dt, json, os, shutil, stat, subprocess, sys
from pathlib import Path
from typing import Any
try:
    import yaml  # type: ignore
except Exception:
    yaml = None

SCRIPT_DIR = Path(__file__).resolve().parent
APPROVAL_PHRASE = "I_APPROVE_ARX_SECURITY_REMEDIATION"
BASELINE = {
    "security.redact_secrets": True,
    "security.allow_private_urls": False,
    "security.tirith_enabled": True,
    "security.tirith_fail_open": False,
    "security.allow_lazy_installs": False,
    "privacy.redact_pii": True,
    "approvals.mode": "manual",
    "approvals.cron_mode": "deny",
    "approvals.mcp_reload_confirm": True,
    "approvals.destructive_slash_confirm": True,
    "skills.inline_shell": False,
    "skills.guard_agent_created": True,
    "delegation.subagent_auto_approve": False,
    "delegation.orchestrator_enabled": False,
    "delegation.max_spawn_depth": 1,
    "delegation.max_concurrent_children": 1,
    "cron.max_parallel_jobs": 1,
}


def run(cmd: list[str], timeout: int = 20) -> tuple[int, str, str]:
    try:
        p = subprocess.run(cmd, text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=timeout)
        return p.returncode, p.stdout.strip(), p.stderr.strip()
    except Exception as e:
        return 127, "", str(e)


def hermes_bin() -> str:
    for c in ["/opt/hermes/.venv/bin/hermes", shutil.which("hermes") or ""]:
        if c and Path(c).exists(): return c
    return "hermes"


def config_path() -> Path:
    if os.environ.get("HERMES_CONFIG"): return Path(os.environ["HERMES_CONFIG"])
    rc, out, _ = run([hermes_bin(), "config", "path"], 10)
    if rc == 0 and out: return Path(out.splitlines()[-1].strip())
    if Path.home().joinpath(".hermes", "config.yaml").exists(): return Path.home() / ".hermes" / "config.yaml"
    return Path.home() / ".hermes" / "config.yaml"


def env_path() -> Path:
    if os.environ.get("HERMES_ENV"): return Path(os.environ["HERMES_ENV"])
    rc, out, _ = run([hermes_bin(), "config", "env-path"], 10)
    if rc == 0 and out: return Path(out.splitlines()[-1].strip())
    if Path.home().joinpath(".hermes", ".env").exists(): return Path.home() / ".hermes" / ".env"
    return Path.home() / ".hermes" / ".env"


def file_mode(path: Path) -> int | None:
    try:
        return stat.S_IMODE(path.stat().st_mode)
    except FileNotFoundError:
        return None


def _parse_scalar(value: str) -> Any:
    value = value.strip()
    if value.lower() == "true": return True
    if value.lower() == "false": return False
    if value.lower() in ("null", "none", "~"): return None
    if value == "[]": return []
    if value == "{}": return {}
    if (value.startswith('"') and value.endswith('"')) or (value.startswith("'") and value.endswith("'")):
        return value[1:-1]
    try:
        return int(value)
    except Exception:
        return value


def _fallback_yaml(text: str) -> dict[str, Any]:
    root: dict[str, Any] = {}
    stack: list[tuple[int, dict[str, Any]]] = [(-1, root)]
    for raw in text.splitlines():
        line = raw.split('#', 1)[0].rstrip()
        if not line.strip() or ':' not in line or line.lstrip().startswith('- '):
            continue
        indent = len(line) - len(line.lstrip(' '))
        key, val = line.strip().split(':', 1)
        while stack and indent <= stack[-1][0]: stack.pop()
        parent = stack[-1][1] if stack else root
        if val.strip() == "":
            node: dict[str, Any] = {}; parent[key] = node; stack.append((indent, node))
        else:
            parent[key] = _parse_scalar(val)
    return root


def load_yaml(path: Path) -> dict[str, Any]:
    text = path.read_text(errors="replace")
    if yaml:
        data = yaml.safe_load(text) or {}
        return data if isinstance(data, dict) else {}
    return _fallback_yaml(text)


def get(data: dict[str, Any], dotted: str, default: Any = None) -> Any:
    cur: Any = data
    for p in dotted.split("."):
        if not isinstance(cur, dict) or p not in cur: return default
        cur = cur[p]
    return cur


def setv(data: dict[str, Any], dotted: str, value: Any):
    cur = data
    parts = dotted.split(".")
    for p in parts[:-1]:
        if not isinstance(cur.get(p), dict): cur[p] = {}
        cur = cur[p]
    cur[parts[-1]] = value


def newest_report() -> str:
    reports = sorted((SCRIPT_DIR / "reports").glob("ARX_security_selfcheck_*.json"), key=lambda p: p.stat().st_mtime, reverse=True)
    return str(reports[0]) if reports else ""


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--from-report", default="", help="Self-check JSON report. Optional; newest report is used if available.")
    ap.add_argument("--config", default="")
    ap.add_argument("--apply", action="store_true", help="Actually write config changes. Default is dry-run.")
    ap.add_argument("--confirm-apply", default="", help=f"Required with --apply. Must equal {APPROVAL_PHRASE!r}.")
    ap.add_argument("--approved-by", default="", help="Human approver identity/name. Required with --apply.")
    ap.add_argument("--approval-reason", default="", help="Short reason or ticket/context for the approved remediation. Required with --apply.")
    ap.add_argument("--backup-dir", default=str(SCRIPT_DIR / "backups"))
    args = ap.parse_args()
    cfgp = Path(args.config) if args.config else config_path()
    envp = env_path()
    cfg = load_yaml(cfgp)
    report_path = args.from_report or newest_report()
    if report_path and Path(report_path).exists():
        # Loaded for traceability only. Do not execute arbitrary report instructions.
        json.loads(Path(report_path).read_text(errors="replace"))
    config_plan = []
    for key, desired in BASELINE.items():
        current = get(cfg, key)
        if current != desired:
            config_plan.append({"key": key, "current": current, "desired": desired})
    env_current_mode = file_mode(envp)
    env_plan = []
    if env_current_mode is not None and env_current_mode != 0o600:
        env_plan.append({"path": str(envp), "current": oct(env_current_mode), "desired": "0o600"})
    plan_count = len(config_plan) + len(env_plan)
    print("ARX Security Remediation")
    print(f"Config: {cfgp}")
    print(f"Env: {envp}")
    print(f"Report: {report_path or 'none'}")
    print(f"Mode: {'APPLY' if args.apply else 'DRY-RUN'}")
    print(f"Planned changes: {plan_count}")
    for item in config_plan:
        print(f"- set {item['key']}: {item['current']!r} -> {item['desired']!r}")
    for item in env_plan:
        print(f"- chmod {item['path']}: {item['current']} -> {item['desired']}")
    if not plan_count:
        print("No remediation required by the hardened baseline.")
        return 0
    if not args.apply:
        print("\nDry-run only. Re-run with --apply after human approval to write changes.")
        print(f"Approval gate: --confirm-apply {APPROVAL_PHRASE!r} --approved-by <name> --approval-reason <reason>")
        return 1
    approval_errors = []
    if args.confirm_apply != APPROVAL_PHRASE:
        approval_errors.append(f"--confirm-apply must exactly equal {APPROVAL_PHRASE!r}")
    if not args.approved_by.strip():
        approval_errors.append("--approved-by is required")
    if not args.approval_reason.strip():
        approval_errors.append("--approval-reason is required")
    if approval_errors:
        print("\nREFUSED: explicit human approval metadata is required before remediation can apply changes.")
        for err in approval_errors:
            print(f"- {err}")
        print("No files were modified.")
        return 2
    bdir = Path(args.backup_dir); bdir.mkdir(parents=True, exist_ok=True)
    stamp = dt.datetime.now(dt.timezone.utc).strftime("%Y%m%d_%H%M%S")
    backup = None
    env_metadata = None
    if config_plan:
        backup = bdir / f"{cfgp.name}.bak.{stamp}"
        shutil.copy2(cfgp, backup)
        if yaml:
            for item in config_plan: setv(cfg, item["key"], item["desired"])
            cfgp.write_text(yaml.safe_dump(cfg, sort_keys=False), encoding="utf-8")
        else:
            # Safe fallback: use Hermes' own config writer when PyYAML is unavailable.
            for item in config_plan:
                desired = item["desired"]
                if isinstance(desired, bool): value = "true" if desired else "false"
                else: value = str(desired)
                rc, out, err = run([hermes_bin(), "config", "set", item["key"], value], 30)
                if rc != 0:
                    print(f"Failed to set {item['key']}: {err or out}")
                    print(f"Backup remains available: {backup}")
                    return 3
    if env_plan:
        # Do not copy .env contents into backups. Record only permission metadata, then chmod.
        env_metadata = bdir / f"{envp.name}.permission-metadata.{stamp}.json"
        env_metadata.write_text(json.dumps({
            "path": str(envp),
            "current_mode": env_plan[0]["current"],
            "desired_mode": env_plan[0]["desired"],
            "approved_by": args.approved_by.strip(),
            "approval_reason": args.approval_reason.strip(),
            "timestamp_utc": stamp,
        }, indent=2) + "\n", encoding="utf-8")
        os.chmod(envp, 0o600)
    if backup:
        print(f"Backup created: {backup}")
    if env_metadata:
        print(f"Env permission metadata recorded: {env_metadata}")
    print(f"Approved by: {args.approved_by.strip()}")
    print(f"Approval reason: {args.approval_reason.strip()}")
    print("Remediation applied. Run `hermes config check` and restart/reset Hermes if config values changed.")
    return 0

if __name__ == "__main__": sys.exit(main())
