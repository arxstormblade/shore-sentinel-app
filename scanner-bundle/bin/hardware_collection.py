"""
Hardware data collection module for the agent security selfcheck.

Collects CPU, memory, disk, and network adapter information. Uses psutil when
available, with standard-library fallbacks so the report can still run in minimal
environments.
"""

from __future__ import annotations

import logging
import os
import shutil
import socket
from pathlib import Path
from typing import Any

try:
    import psutil  # type: ignore
except ModuleNotFoundError:  # pragma: no cover - optional dependency
    psutil = None

logger = logging.getLogger(__name__)


def _human_readable_bytes(num_bytes: int | float | None) -> str:
    """Convert bytes to a human-readable string (e.g. '1.2 GB')."""
    if num_bytes is None or num_bytes < 0:
        return "unknown"
    value = float(num_bytes)
    for unit in ("B", "KB", "MB", "GB", "TB", "PB"):
        if abs(value) < 1024.0:
            return f"{value:.1f} {unit}"
        value /= 1024.0
    return f"{value:.1f} EB"


def _fallback_memory_info() -> dict[str, Any]:
    """Return best-effort memory stats without psutil."""
    result: dict[str, Any] = {
        "used": None,
        "total": None,
        "percent": None,
    }
    try:
        meminfo: dict[str, int] = {}
        for line in Path("/proc/meminfo").read_text(errors="ignore").splitlines():
            if ":" not in line:
                continue
            key, rest = line.split(":", 1)
            parts = rest.strip().split()
            if parts and parts[0].isdigit():
                meminfo[key] = int(parts[0]) * 1024
        total = meminfo.get("MemTotal")
        available = meminfo.get("MemAvailable", meminfo.get("MemFree"))
        if total is not None:
            used = total - available if available is not None else None
            result["total"] = total
            result["used"] = used
            if used is not None:
                result["percent"] = round((used / total) * 100, 1) if total else None
    except Exception as exc:
        logger.warning("Failed to collect memory info without psutil: %s", exc)
    return result


def _fallback_network_adapters() -> list[dict[str, Any]]:
    """Return best-effort interface names when psutil is unavailable."""
    adapters: list[dict[str, Any]] = []
    try:
        if hasattr(socket, "if_nameindex"):
            for _, name in socket.if_nameindex():
                adapters.append({"name": name, "ip": None, "mac": None})
    except Exception as exc:
        logger.warning("Failed to collect network adapter names without psutil: %s", exc)
    return adapters


def collect_hardware_info() -> dict[str, Any]:
    """Collect hardware details from the host machine.

    Returns a structured dict with:
        - cpu_logical_cores: int | None
        - memory_used: str (human-readable)
        - memory_total: str (human-readable)
        - memory_used_bytes: int | None
        - memory_total_bytes: int | None
        - memory_percent: float | None
        - disk_used: str (human-readable)
        - disk_total: str (human-readable)
        - disk_used_bytes: int | None
        - disk_total_bytes: int | None
        - disk_percent: float | None
        - network_adapters: list of {name, ip, mac}
        - errors: list of strings for any fields that could not be collected
    """
    result: dict[str, Any] = {
        "cpu_logical_cores": None,
        "memory_used": "unknown",
        "memory_total": "unknown",
        "memory_used_bytes": None,
        "memory_total_bytes": None,
        "memory_percent": None,
        "disk_used": "unknown",
        "disk_total": "unknown",
        "disk_used_bytes": None,
        "disk_total_bytes": None,
        "disk_percent": None,
        "network_adapters": [],
        "errors": [],
    }

    # --- CPU ---
    try:
        result["cpu_logical_cores"] = os.cpu_count()
    except (OSError, RuntimeError) as exc:
        logger.warning("Failed to collect CPU info: %s", exc)
        result["errors"].append(f"cpu: {exc}")

    # --- Memory ---
    try:
        if psutil is not None:
            mem = psutil.virtual_memory()
            mem_used = mem.used
            mem_total = mem.total
            mem_percent = mem.percent
        else:
            fallback = _fallback_memory_info()
            mem_used = fallback["used"]
            mem_total = fallback["total"]
            mem_percent = fallback["percent"]
            if mem_total is None:
                raise RuntimeError("memory stats unavailable without psutil")

        result["memory_used_bytes"] = mem_used
        result["memory_total_bytes"] = mem_total
        result["memory_used"] = _human_readable_bytes(mem_used)
        result["memory_total"] = _human_readable_bytes(mem_total)
        result["memory_percent"] = mem_percent
    except (OSError, RuntimeError) as exc:
        logger.warning("Failed to collect memory info: %s", exc)
        result["errors"].append(f"memory: {exc}")

    # --- Disk (root filesystem) ---
    try:
        disk = psutil.disk_usage("/") if psutil is not None else shutil.disk_usage("/")
        result["disk_used_bytes"] = disk.used
        result["disk_total_bytes"] = disk.total
        result["disk_used"] = _human_readable_bytes(disk.used)
        result["disk_total"] = _human_readable_bytes(disk.total)
        result["disk_percent"] = getattr(disk, "percent", round((disk.used / disk.total) * 100, 1))
    except (OSError, RuntimeError) as exc:
        logger.warning("Failed to collect disk info: %s", exc)
        result["errors"].append(f"disk: {exc}")

    # --- Network adapters ---
    try:
        if psutil is not None:
            addrs = psutil.net_if_addrs()
            for iface_name, iface_addrs in addrs.items():
                adapter: dict[str, Any] = {"name": iface_name, "ip": None, "mac": None}
                for addr in iface_addrs:
                    family_name = getattr(addr.family, "name", str(addr.family))
                    if family_name == "AF_INET":
                        adapter["ip"] = addr.address
                    elif family_name in {"AF_LINK", "AF_PACKET"}:
                        adapter["mac"] = addr.address
                if adapter["ip"] or adapter["mac"]:
                    result["network_adapters"].append(adapter)
        else:
            result["network_adapters"] = _fallback_network_adapters()
    except (OSError, RuntimeError, AttributeError) as exc:
        logger.warning("Failed to collect network adapter info: %s", exc)
        result["errors"].append(f"network: {exc}")

    if psutil is None:
        result["errors"].append("psutil unavailable; used standard-library hardware fallback")

    return result
