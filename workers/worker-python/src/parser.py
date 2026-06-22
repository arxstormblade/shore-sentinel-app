from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

PARSER_VERSION = "0.1.0"
CONTRACT_VERSION = "shore-sentinel.scanner-output/v1"


@dataclass(frozen=True)
class ParseResult:
    run_id: str
    parser_version: str
    normalized_findings: list[dict[str, Any]]
    enrichment_summary: dict[str, Any]

    def to_dict(self) -> dict[str, Any]:
        return {
            "runId": self.run_id,
            "parserVersion": self.parser_version,
            "normalizedFindings": self.normalized_findings,
            "enrichmentSummary": self.enrichment_summary,
        }


def _now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def normalize_severity(value: Any) -> str:
    normalized = str(value or "informational").strip().lower()
    aliases = {"info": "informational", "medium": "moderate", "med": "moderate", "crit": "critical"}
    normalized = aliases.get(normalized, normalized)
    allowed = {"informational", "low", "moderate", "high", "critical"}
    return normalized if normalized in allowed else "informational"


def normalize_finding(raw: dict[str, Any], *, index: int, target: dict[str, Any]) -> dict[str, Any]:
    finding_id = raw.get("id") or raw.get("findingId") or f"finding-{index + 1}"
    title = raw.get("title") or raw.get("name") or "Untitled finding"
    return {
        "id": str(finding_id),
        "title": str(title),
        "severity": normalize_severity(raw.get("severity")),
        "category": str(raw.get("category") or "general"),
        "description": str(raw.get("description") or raw.get("summary") or ""),
        "asset": {
            "assetId": target.get("assetId"),
            "hostname": target.get("hostname"),
            "ip": target.get("ip"),
        },
        "evidence": raw.get("evidence") or [],
        "remediation": raw.get("remediation") or raw.get("recommendation") or None,
        "references": raw.get("references") or [],
        "source": raw.get("source") or raw.get("check") or "scanner",
    }


def parse_scanner_output(run_id: str, scanner_output: dict[str, Any]) -> ParseResult:
    if not run_id:
        raise ValueError("runId is required")
    if not isinstance(scanner_output, dict):
        raise ValueError("scannerOutput must be an object")
    if scanner_output.get("contractVersion") != CONTRACT_VERSION:
        raise ValueError(f"contractVersion must be {CONTRACT_VERSION}")

    target = scanner_output.get("target") or {}
    raw_findings = scanner_output.get("findings") or []
    if not isinstance(raw_findings, list):
        raise ValueError("findings must be an array")

    normalized = [normalize_finding(item or {}, index=i, target=target) for i, item in enumerate(raw_findings)]
    severity_counts: dict[str, int] = {}
    for finding in normalized:
        severity_counts[finding["severity"]] = severity_counts.get(finding["severity"], 0) + 1

    summary = {
        "runId": run_id,
        "contractVersion": scanner_output.get("contractVersion"),
        "scanner": scanner_output.get("scanner") or {},
        "target": target,
        "totalFindings": len(normalized),
        "severityCounts": severity_counts,
        "parsedAt": _now(),
    }
    return ParseResult(run_id, PARSER_VERSION, normalized, summary)
