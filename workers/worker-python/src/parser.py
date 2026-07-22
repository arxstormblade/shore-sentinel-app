from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

PARSER_VERSION = "0.1.0"
CONTRACT_VERSION = "shore-sentinel.scanner-output/v1"
CVE_PATTERN = re.compile(r"\bCVE-\d{4}-\d{4,7}\b", re.IGNORECASE)
RFC3339_PATTERN = re.compile(r"^(\d{4})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])T([01]\d|2[0-3]):([0-5]\d):([0-5]\d)(\.\d+)?(Z|[+-](?:0\d|1\d|2[0-3]):[0-5]\d)$")
NVD_URL = "https://nvd.nist.gov/vuln/detail/{cve}"
VALID_CONFIDENCE = {"confirmed", "high", "medium", "low"}
VALID_SCOPE = {"target_source", "host_runtime", "external/unknown"}
VALID_REACHABILITY = {"unknown", "declared", "host_only", "host_observed"}
VALID_EVIDENCE_KIND = {"observation", "secret_classification", "compose_socket_mount", "correlation", "coverage_diagnostic"}
VALID_STATUS = {"PASS", "WARN", "FAIL", "SKIP"}
VALID_RISK = {"Critical", "High", "Medium", "Low", "Info"}
VALID_SEVERITY = {"informational", "low", "moderate", "high", "critical"}
VALID_SCOPE_MODE = {"exact", "discover", "runtime", "full"}
COVERAGE_BOOLEAN_FIELDS = {"scan_complete", "security_relevant_incomplete", "truncated_file_list", "host_runtime_not_collected", "host_runtime_incomplete"}
COVERAGE_INTEGER_FIELDS = {"files_discovered"}
COVERAGE_STRING_FIELDS = {"requested_root", "effective_root", "scope_mode", "host_runtime_error"}
COVERAGE_STRING_ARRAY_FIELDS = {"secret_files_not_read", "missing_optional_paths", "symlink_directory_skips", "symlink_skips", "decode_errors"}
COVERAGE_RECORD_ARRAY_FIELDS = {"walk_errors", "unreadable_paths", "truncated_files", "limit_overrides", "config_parse_errors", "scope_errors", "runtime_probe_errors"}
COVERAGE_FIELDS = COVERAGE_BOOLEAN_FIELDS | COVERAGE_INTEGER_FIELDS | COVERAGE_STRING_FIELDS | COVERAGE_STRING_ARRAY_FIELDS | COVERAGE_RECORD_ARRAY_FIELDS


@dataclass(frozen=True)
class ParseResult:
    run_id: str
    parser_version: str
    normalized_findings: list[dict[str, Any]]
    enrichment_summary: dict[str, Any]

    def to_dict(self) -> dict[str, Any]:
        return {"runId": self.run_id, "parserVersion": self.parser_version, "normalizedFindings": self.normalized_findings, "enrichmentSummary": self.enrichment_summary}


def _now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _valid_datetime(value: Any) -> bool:
    if not isinstance(value, str):
        return False
    match = RFC3339_PATTERN.fullmatch(value)
    if not match:
        return False
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return False
    return parsed.tzinfo is not None


def _validate_coverage(coverage: Any) -> None:
    if not isinstance(coverage, dict):
        raise ValueError("coverage must be an object")
    unknown = set(coverage) - COVERAGE_FIELDS
    if unknown:
        raise ValueError(f"coverage contains unknown fields: {', '.join(sorted(unknown))}")
    for key in COVERAGE_BOOLEAN_FIELDS:
        if key in coverage and type(coverage[key]) is not bool:
            raise ValueError(f"coverage field {key} must be boolean")
    for key in COVERAGE_INTEGER_FIELDS:
        if key in coverage and (type(coverage[key]) is not int or coverage[key] < 0):
            raise ValueError(f"coverage field {key} must be a nonnegative integer")
    for key in COVERAGE_STRING_FIELDS:
        if key in coverage and (not isinstance(coverage[key], str) or not coverage[key]):
            raise ValueError(f"coverage field {key} must be a non-empty string")
    if "scope_mode" in coverage and coverage["scope_mode"] not in VALID_SCOPE_MODE:
        raise ValueError("coverage scope_mode is invalid")
    for key in COVERAGE_STRING_ARRAY_FIELDS:
        if key in coverage and (not isinstance(coverage[key], list) or not all(isinstance(item, str) for item in coverage[key])):
            raise ValueError(f"coverage field {key} must be a string array")
    for key in COVERAGE_RECORD_ARRAY_FIELDS:
        if key in coverage and (not isinstance(coverage[key], list) or not all(isinstance(item, dict) for item in coverage[key])):
            raise ValueError(f"coverage field {key} must be an object array")
    if type(coverage.get("scan_complete")) is not bool:
        raise ValueError("coverage scan_complete must be boolean")


def normalize_severity(value: Any) -> str:
    normalized = str(value or "informational").strip().lower()
    aliases = {"info": "informational", "medium": "moderate", "med": "moderate", "crit": "critical"}
    normalized = aliases.get(normalized, normalized)
    allowed = set(VALID_SEVERITY)
    return normalized if normalized in allowed else "informational"


def _reference_texts(references: Any) -> list[str]:
    if not isinstance(references, list):
        return []
    texts: list[str] = []
    for reference in references:
        if isinstance(reference, str):
            texts.append(reference)
            continue
        raise ValueError("finding references must contain only strings")
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


def _validate_evidence(raw: dict[str, Any], index: int) -> list[dict[str, Any]]:
    evidence = raw.get("evidence")
    if not isinstance(evidence, list):
        raise ValueError(f"finding {index} evidence must be an array")
    for item in evidence:
        if not isinstance(item, dict):
            raise ValueError(f"finding {index} evidence items must be objects")
        if not isinstance(item.get("text"), str):
            raise ValueError(f"finding {index} evidence text must be a string")
        if item.get("kind") not in VALID_EVIDENCE_KIND or item.get("scope") not in VALID_SCOPE or item.get("confidence") not in VALID_CONFIDENCE:
            raise ValueError(f"finding {index} evidence provenance is invalid")
        if "path" in item and not isinstance(item["path"], str):
            raise ValueError(f"finding {index} evidence path must be a string")
        if "line" in item and (type(item["line"]) is not int or item["line"] < 1):
            raise ValueError(f"finding {index} evidence line is invalid")
    return evidence


def normalize_finding(raw: dict[str, Any], *, index: int, target: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(raw, dict):
        raise ValueError("finding must be an object")
    finding_id = raw.get("id") or raw.get("findingId")
    if not isinstance(finding_id, str) or not finding_id:
        raise ValueError("stable finding id is required")
    for field in ("category", "scope", "confidence", "reachability", "evidenceKind"):
        if not isinstance(raw.get(field), str) or not raw[field]:
            raise ValueError(f"finding missing required provenance: {field}")
    if raw["scope"] not in VALID_SCOPE or raw["confidence"] not in VALID_CONFIDENCE or raw["reachability"] not in VALID_REACHABILITY or raw["evidenceKind"] not in VALID_EVIDENCE_KIND:
        raise ValueError("finding provenance enum is invalid")
    if not isinstance(raw.get("title") or raw.get("name"), str) or not (raw.get("title") or raw.get("name")):
        raise ValueError("finding title is required")
    if raw.get("severity") not in VALID_SEVERITY:
        raise ValueError("finding severity is invalid")
    if type(raw.get("severityScore")) is not int or raw["severityScore"] < 0:
        raise ValueError("finding severityScore is invalid")
    if raw.get("status") not in VALID_STATUS or raw.get("risk") not in VALID_RISK:
        raise ValueError("finding status or risk is invalid")
    if type(raw.get("derived")) is not bool:
        raise ValueError("finding derived flag is invalid")
    if "derivedFrom" not in raw:
        raise ValueError("finding derivedFrom is required")
    derived_from = raw["derivedFrom"]
    if not isinstance(derived_from, list) or not all(isinstance(item, str) and item for item in derived_from):
        raise ValueError("finding derivedFrom is invalid")
    evidence = _validate_evidence(raw, index)
    if "references" in raw and (not isinstance(raw["references"], list) or not all(isinstance(item, str) for item in raw["references"])):
        raise ValueError("finding references must be an array of strings")
    if "description" not in raw or not isinstance(raw["description"], str):
        raise ValueError("finding description is required and must be a string")
    for field in ("source",):
        if field in raw and raw[field] is not None and not isinstance(raw[field], str):
            raise ValueError(f"finding {field} must be a string")
    for field in ("remediation", "recommendation"):
        if field in raw and raw[field] is not None and not isinstance(raw[field], str):
            raise ValueError(f"finding {field} must be a string")
    title = raw.get("title") or raw.get("name")
    cve, cve_url, cves = extract_cve_info(raw)
    references = raw.get("references", [])
    return {
        "id": finding_id,
        "title": title,
        "severity": normalize_severity(raw["severity"]),
        "category": raw["category"],
        "description": raw["description"],
        "asset": {"assetId": target.get("assetId"), "hostname": target.get("hostname"), "ip": target.get("ip")},
        "evidence": evidence,
        "remediation": raw.get("remediation") or raw.get("recommendation"),
        "references": references,
        "cve": cve,
        "cveUrl": cve_url,
        "cves": cves,
        "source": raw.get("source") or raw.get("check") or "scanner",
        "scope": raw["scope"],
        "confidence": raw["confidence"],
        "reachability": raw["reachability"],
        "evidenceKind": raw["evidenceKind"],
        "derived": raw.get("derived", False),
        "derivedFrom": derived_from,
    }


def parse_scanner_output(run_id: str, scanner_output: dict[str, Any], *, expected_target_asset_id: str | None = None, expected_scanner: dict[str, str] | None = None, expected_subject_type: str | None = None) -> ParseResult:
    if not isinstance(run_id, str) or not run_id:
        raise ValueError("runId is required")
    if not isinstance(scanner_output, dict):
        raise ValueError("scannerOutput must be an object")
    if scanner_output.get("contractVersion") != CONTRACT_VERSION:
        raise ValueError(f"contractVersion must be {CONTRACT_VERSION}")
    scanner = scanner_output.get("scanner")
    target = scanner_output.get("target")
    if not isinstance(scanner, dict) or not isinstance(target, dict) or not isinstance(scanner_output.get("findings"), list):
        raise ValueError("scanner output requires scanner, target, and findings types")
    if not isinstance(scanner.get("name"), str) or not scanner["name"] or not isinstance(scanner.get("version"), str) or not scanner["version"]:
        raise ValueError("scanner output is missing required provenance metadata")
    if not isinstance(scanner.get("scriptSha256"), str) or not scanner["scriptSha256"]:
        raise ValueError("scanner scriptSha256 is invalid")
    if not isinstance(target.get("assetId"), str) or not target["assetId"]:
        raise ValueError("target assetId is required")
    for field in ("hostname", "ip", "subjectType"):
        if field in target and target[field] is not None and not isinstance(target[field], str):
            raise ValueError(f"target {field} must be a string")
    if expected_target_asset_id is not None and target["assetId"] != expected_target_asset_id:
        raise ValueError("scanner target asset identity mismatch")
    if expected_subject_type is not None and target.get("subjectType") != expected_subject_type:
        raise ValueError("scanner target subject type mismatch")
    if expected_scanner is not None and (scanner.get("name") != expected_scanner.get("name") or scanner.get("version") != expected_scanner.get("version")):
        raise ValueError("scanner producer identity mismatch")
    if not _valid_datetime(scanner_output.get("collectedAt")):
        raise ValueError("scanner collectedAt is not strict RFC3339")
    metadata = scanner_output.get("metadata")
    if not isinstance(metadata, dict):
        raise ValueError("scanner metadata envelope is required")
    if metadata.get("generated_utc") != scanner_output["collectedAt"] or not _valid_datetime(metadata.get("generated_utc")):
        raise ValueError("scanner metadata generated_utc is invalid or mismatched")
    if metadata.get("script_version") != scanner.get("version") or metadata.get("script_sha256") != scanner.get("scriptSha256"):
        raise ValueError("scanner metadata script provenance is invalid or mismatched")
    if metadata.get("target_asset_id") != target.get("assetId"):
        raise ValueError("scanner metadata target provenance is invalid or mismatched")
    if not isinstance(metadata.get("coverage"), dict):
        raise ValueError("scanner metadata coverage is required")
    _validate_coverage(metadata["coverage"])
    if metadata["coverage"] != scanner_output.get("coverage"):
        raise ValueError("scanner metadata coverage does not match canonical coverage")
    coverage = scanner_output.get("coverage")
    decision = scanner_output.get("decision")
    if not isinstance(coverage, dict) or not isinstance(decision, dict):
        raise ValueError("scanner output requires coverage and decision contracts")
    _validate_coverage(coverage)
    if type(decision.get("exit_code")) is not int or decision["exit_code"] < 0 or decision.get("status") not in {"PASS", "FAIL", "ERROR"}:
        raise ValueError("scanner output coverage and decision contracts are invalid")
    if coverage.get("security_relevant_incomplete") or coverage.get("scan_complete") is False or decision["exit_code"] != 0 or decision["status"] != "PASS":
        raise ValueError("scanner output has incomplete security-relevant coverage")
    normalized = [normalize_finding(item, index=i, target=target) for i, item in enumerate(scanner_output["findings"])]
    severity_counts: dict[str, int] = {}
    all_cves: list[str] = []
    for finding in normalized:
        severity_counts[finding["severity"]] = severity_counts.get(finding["severity"], 0) + 1
        for cve in finding.get("cves") or []:
            if cve not in all_cves:
                all_cves.append(cve)
    summary = {
        "runId": run_id, "contractVersion": CONTRACT_VERSION, "scanner": scanner, "target": target,
        "coverage": coverage, "decision": decision, "totalFindings": len(normalized),
        "findingsWithCve": sum(1 for finding in normalized if finding.get("cve")), "cves": all_cves,
        "severityCounts": severity_counts, "parsedAt": _now(),
    }
    return ParseResult(run_id, PARSER_VERSION, normalized, summary)
