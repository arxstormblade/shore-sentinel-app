#!/usr/bin/env python3
from __future__ import annotations

import getpass
import grp
import os
import shlex
import shutil
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
COMPOSE_FILE = ROOT / "docker-compose.yml"
SOCKET = "/var/run/docker.sock"


def has_socket_access() -> bool:
    try:
        return os.path.exists(SOCKET) and os.access(SOCKET, os.R_OK | os.W_OK)
    except OSError:
        return False


def user_in_group(group_name: str) -> bool:
    try:
        group = grp.getgrnam(group_name)
    except KeyError:
        return False
    user = getpass.getuser()
    return user == group.gr_name or user in group.gr_mem or os.getgid() == group.gr_gid


def run(cmd: list[str]) -> subprocess.CompletedProcess[str]:
    return subprocess.run(cmd, cwd=ROOT, text=True, capture_output=True)


def run_compose_via_sg(cmd: list[str]) -> subprocess.CompletedProcess[str]:
    quoted = " ".join(shlex.quote(part) for part in cmd)
    return subprocess.run(["sg", "docker", "-c", quoted], cwd=ROOT, text=True, capture_output=True)


def main() -> int:
    if not COMPOSE_FILE.exists():
        print("SKIP: docker-compose.yml is missing; cannot run compose smoke.")
        return 0

    commands = [
        ["docker", "compose", "config"],
        ["docker", "compose", "ps"],
    ]
    for cmd in commands:
        proc = run(cmd)
        if proc.returncode == 0:
            continue

        permission_denied = "permission denied while trying to connect to the docker API" in (proc.stderr or proc.stdout)
        if permission_denied and user_in_group("docker") and shutil.which("sg"):
            retry = run_compose_via_sg(cmd)
            if retry.returncode == 0:
                continue
            print((retry.stdout or "") + (retry.stderr or ""), end="")
            print(f"FAIL: {' '.join(cmd)} via sg docker exited with {retry.returncode}")
            return retry.returncode

        if not has_socket_access() and not user_in_group("docker"):
            print(
                "SKIP: Docker socket access is unavailable for this user/session; "
                "skipping live Compose smoke and relying on scaffold validation instead."
            )
            return 0

        print((proc.stdout or "") + (proc.stderr or ""), end="")
        print(f"FAIL: {' '.join(cmd)} exited with {proc.returncode}")
        return proc.returncode

    print("Docker Compose smoke passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
