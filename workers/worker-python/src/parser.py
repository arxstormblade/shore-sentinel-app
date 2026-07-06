from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

PARSER_VERSION = "0.1.0"
CONTRACT_VERSION = "shore-sentinel.scanner-output/v1"
CVE_PATTERN = re.compile(r"\bCVE-\d{4}-\d{4,7}\b", re.IGNORECASE)
NVD_URL = "https://nvd.nist.gov/vuln/detail/{cve}"


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


def _reference_texts(references: Any) -> list[str]:
    if not isinstance(references, list):
        return []
    texts: list[str] = []
    for reference in references:
        if isinstance(reference, str):
            texts.append(reference)
            continue
        if isinstance(reference, dict):
            values = [reference.get(key) for key in ("cve", "id", "url", "title", "name", "text", "value")]
            for value in values:
                if isinstance(value, str) and value:
                    texts.append(value)
            joined = " ".join(str(value) for value in reference.values() if value is not None)
            if joined:
                texts.append(joined)
            continue
        if reference is not None:
            texts.append(str(reference))
    return texts


def extract_cve_info(raw: dict[str, Any]) -> tuple[str | None, str | None, list[str]]:
    sources: list[str] = []
    sources.extend(_reference_texts(raw.get("references")))
    for field in ("title", "name", "description", "summary", "category", "remediation", "recommendation"):
        value = raw.get(field)
        if isinstance(value, str) and value:
            sources.append(value)
    discovered: list[str] = []
    for source in sources:
        for match in CVE_PATTERN.findall(source):
            cve = match.upper()
            if cve not in discovered:
                discovered.append(cve)
    if not discovered:
        return None, None, []
    cve = discovered[0]
    return cve, NVD_URL.format(cve=cve), discovered


def normalize_finding(raw: dict[str, Any], *, index: int, target: dict[str, Any]) -> dict[str, Any]:
    finding_id = raw.get("id") or raw.get("findingId") or f"finding-{index + 1}"
    title = raw.get("title") or raw.get("name") or "Untitled finding"
    cve, cve_url, cves = extract_cve_info(raw)
    references = raw.get("references") or []
    if not isinstance(references, list):
        references = [references]
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
        "references": references,
        "cve": cve,
        "cveUrl": cve_url,
        "cves": cves,
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
    all_cves: list[str] = []
    for finding in normalized:
        severity_counts[finding["severity"]] = severity_counts.get(finding["severity"], 0) + 1
        for cve in finding.get("cves") or []:
            if cve not in all_cves:
                all_cves.append(cve)

    summary = {
        "runId": run_id,
        "contractVersion": scanner_output.get("contractVersion"),
        "scanner": scanner_output.get("scanner") or {},
        "target": target,
        "totalFindings": len(normalized),
        "findingsWithCve": sum(1 for finding in normalized if finding.get("cve")),
        "cves": all_cves,
        "severityCounts": severity_counts,
        "parsedAt": _now(),
    }
    return ParseResult(run_id, PARSER_VERSION, normalized, summary)
