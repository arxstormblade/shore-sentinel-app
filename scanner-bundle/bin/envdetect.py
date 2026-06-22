#!/usr/bin/env python3
"""
envdetect — Container / VM / Bare-metal environment detection.

Detects whether the current process is running inside a container
(Docker, LXC, Podman, Kubernetes), a virtual machine (VMware, KVM,
VirtualBox, Hyper-V, Xen, AWS, GCP), or directly on bare-metal.

Usage:
    from envdetect import detect_environment
    label = detect_environment()
    # label is one of: 'container', 'virtual-machine', 'bare-metal'

This module is read-only and has no external dependencies beyond the
Python standard library.
"""

from __future__ import annotations

import os
import subprocess
from pathlib import Path
from typing import Optional


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def detect_environment() -> str:
    """Return a string label describing the execution environment.

    Returns:
        'container'        — running inside a container runtime
        'virtual-machine'  — running inside a VM/hypervisor
        'bare-metal'       — no container or VM detected

    Detection order:
        1. Container indicators (.dockerenv, cgroup, env vars, K8s)
        2. VM/hypervisor indicators (systemd-detect-virt, DMI, CPUID)
        3. Fallback to bare-metal
    """
    if _is_container():
        return "container"
    if _is_vm():
        return "virtual-machine"
    return "bare-metal"


# ---------------------------------------------------------------------------
# Container detection
# ---------------------------------------------------------------------------

def _is_container() -> bool:
    """Check common container indicators."""
    # 1. Docker / containerd / CRI-O
    if Path("/.dockerenv").exists():
        return True

    # 2. cgroup path inspection
    if _cgroup_indicates_container():
        return True

    # 3. Environment variable hints
    container_env = os.environ.get("container", "")
    if container_env in ("docker", "podman", "lxc", "containerd"):
        return True
    if os.environ.get("PODMAN"):
        return True

    # 4. Kubernetes service account token
    if Path("/var/run/secrets/kubernetes.io").exists():
        return True
    if os.environ.get("KUBERNETES_SERVICE_HOST"):
        return True

    # 5. PID 1 is not a typical init system (heuristic)
    if _pid1_is_container_init():
        return True

    return False


def _cgroup_indicates_container() -> bool:
    """Inspect /proc/1/cgroup for container-related entries."""
    cgroup_paths = [Path("/proc/1/cgroup"), Path("/proc/self/cgroup")]
    container_markers = ("docker", "containerd", "crio", "kubepods", "lxc", "podman")
    for cgroup_file in cgroup_paths:
        try:
            text = cgroup_file.read_text(errors="ignore").lower()
            if any(marker in text for marker in container_markers):
                return True
        except Exception:
            continue
    return False


def _pid1_is_container_init() -> bool:
    """Heuristic: PID 1 cmdline suggests a container init, not systemd/init."""
    try:
        cmdline = Path("/proc/1/cmdline").read_bytes()
        # cmdline uses NUL separators
        parts = cmdline.split(b"\x00")
        exe = parts[0].decode(errors="ignore").lower() if parts else ""
        # Common container init processes
        container_inits = (
            "/bin/sh", "/bin/bash", "/usr/bin/dumb-init",
            "/sbin/tini", "/usr/bin/tini", "/entrypoint",
            "/app", "/start", "node", "python", "python3",
        )
        # If PID 1 is NOT systemd, init, or launchd, likely a container
        host_inits = ("/sbin/init", "/usr/sbin/init", "/lib/systemd/systemd",
                      "/usr/lib/systemd/systemd", "launchd")
        if any(exe.startswith(ci) for ci in container_inits):
            if not any(exe.startswith(hi) for hi in host_inits):
                return True
    except Exception:
        pass
    return False


# ---------------------------------------------------------------------------
# VM / hypervisor detection
# ---------------------------------------------------------------------------

def _is_vm() -> bool:
    """Check common VM/hypervisor indicators."""
    # 1. systemd-detect-virt (most reliable on systemd hosts)
    virt = _systemd_detect_virt()
    if virt and virt != "none":
        return True

    # 2. DMI / SMBIOS vendor data
    if _dmi_indicates_vm():
        return True

    # 3. CPUID hypervisor flag via /proc/cpuinfo
    if _cpuinfo_hypervisor_flag():
        return True

    # 4. DMI product name
    if _dmi_product_name_vm():
        return True

    return False


def _systemd_detect_virt() -> Optional[str]:
    """Run systemd-detect-virt and return the detected virt type, or None on failure."""
    try:
        result = subprocess.run(
            ["systemd-detect-virt"],
            capture_output=True, text=True, timeout=10,
        )
        if result.returncode == 0:
            return result.stdout.strip().lower()
    except Exception:
        pass
    return None


def _dmi_indicates_vm() -> bool:
    """Check DMI sys_vendor for VM indicators."""
    dmi_files = [
        "/sys/class/dmi/id/sys_vendor",
        "/sys/class/dmi/id/board_vendor",
        "/sys/class/dmi/id/bios_vendor",
    ]
    vm_vendors = (
        "vmware", "qemu", "kvm", "virtualbox", "oracle",
        "microsoft", "hyper-v", "xen", "amazon", "ec2",
        "google", "virtual", "parallels", "innotek",
        "bochs", "vmware",
    )
    for dmi_path in dmi_files:
        try:
            value = Path(dmi_path).read_text(errors="ignore").strip().lower()
            if any(vendor in value for vendor in vm_vendors):
                return True
        except Exception:
            continue
    return False


def _cpuinfo_hypervisor_flag() -> bool:
    """Check /proc/cpuinfo for the hypervisor CPUID flag."""
    try:
        cpuinfo = Path("/proc/cpuinfo").read_text(errors="ignore").lower()
        if "hypervisor" in cpuinfo:
            return True
    except Exception:
        pass
    return False


def _dmi_product_name_vm() -> bool:
    """Check DMI product name for VM indicators."""
    product_files = [
        "/sys/class/dmi/id/product_name",
        "/sys/class/dmi/id/product_family",
    ]
    vm_products = (
        "vmware", "virtual machine", "virtualbox", "kvm",
        "qemu", "xen", "hyper-v", "google compute engine",
        "amazon ec2", "parallels",
    )
    for product_path in product_files:
        try:
            value = Path(product_path).read_text(errors="ignore").strip().lower()
            if any(vm_prod in value for vm_prod in vm_products):
                return True
        except Exception:
            continue
    return False


# ---------------------------------------------------------------------------
# Convenience: detailed info
# ---------------------------------------------------------------------------

def detect_environment_detail() -> dict:
    """Return detailed environment information.

    Returns a dict with:
        - label: 'container' | 'virtual-machine' | 'bare-metal'
        - container_type: specific container runtime or None
        - vm_type: specific hypervisor or None
        - indicators: list of strings describing what was detected
    """
    indicators: list[str] = []
    container_type: Optional[str] = None
    vm_type: Optional[str] = None

    # Container checks
    if Path("/.dockerenv").exists():
        container_type = "docker"
        indicators.append("/.dockerenv exists")

    if _cgroup_indicates_container():
        if not container_type:
            container_type = "container"
        indicators.append("cgroup indicates container")

    # Environment variable hints
    container_env = os.environ.get("container", "")
    if container_env in ("docker", "podman", "lxc", "containerd"):
        if not container_type:
            container_type = container_env
        indicators.append(f"container env={container_env}")
    if os.environ.get("PODMAN"):
        if not container_type:
            container_type = "podman"
        indicators.append("PODMAN env set")

    k8s_host = os.environ.get("KUBERNETES_SERVICE_HOST")
    if k8s_host:
        container_type = "kubernetes"
        indicators.append("KUBERNETES_SERVICE_HOST set")

    if Path("/var/run/secrets/kubernetes.io").exists():
        if not container_type:
            container_type = "kubernetes"
        indicators.append("K8s service account token present")

    if container_type:
        return {
            "label": "container",
            "container_type": container_type,
            "vm_type": None,
            "indicators": indicators,
        }

    # VM checks
    virt = _systemd_detect_virt()
    if virt is not None and virt != "none":
        vm_type = virt
        indicators.append(f"systemd-detect-virt: {virt}")

    if _dmi_indicates_vm():
        if not vm_type:
            vm_type = "vm-unknown"
        indicators.append("DMI vendor indicates VM")

    if _cpuinfo_hypervisor_flag():
        if not vm_type:
            vm_type = "vm-unknown"
        indicators.append("CPUID hypervisor flag set")

    if _dmi_product_name_vm():
        if not vm_type:
            vm_type = "vm-unknown"
        indicators.append("DMI product name indicates VM")

    if vm_type:
        return {
            "label": "virtual-machine",
            "container_type": None,
            "vm_type": vm_type,
            "indicators": indicators,
        }

    return {
        "label": "bare-metal",
        "container_type": None,
        "vm_type": None,
        "indicators": ["No container or VM indicators found"],
    }
