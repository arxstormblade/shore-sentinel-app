# Agent Security Self-Check Version History

Merged changelog preserving the full lineage from v1 through the approved v3.5.0 release and v3.4.0 reference release.

Last updated: 2026-07-22 00:00:00 UTC

## Current status

| Version | Status | Summary |
|---|---|---|
| v3.5.0 | Approved release | Fail-closed exact scope, structured evidence, host-versus-target separation, stable IDs, contract validation, and false-positive regression coverage. |
| v3.4.0 | Reference release | Hardware Summary section above category score cards, with minimized host telemetry in the approved PDF report. |
| v3.3.0 | Prior release | Inline remediation tasks appear directly under finding evidence, remediation paths are more precise, and PDF spacing has been tightened. |
| v3.0.1-rc1 | Prior release | Portable read-only auditor for Hermes/ARX and OpenClaw agent meshes, with consumer-ready PDF evidence refinement. |
| v3.0.0-rc1 | Prior release | Portable read-only auditor for Hermes/ARX and OpenClaw agent meshes, with executive reporting, severity-sorted findings, methodology/tools, frameworks, Hermes security best practices, JSON, Markdown, SARIF, and presentation-grade PDF outputs. |
| v3.0.0-test | Prior release | Portable read-only auditor for Hermes/ARX and OpenClaw agent meshes, with JSON, Markdown, and SARIF outputs. |
| v2.1.0 | Legacy stable release | Enhanced Hermes-specific scanner pack retained under the legacy ARX folder. |
| v2.0.1 | Prior release | Report presentation release with higher-resolution JPG/SVG output, wrapped labels, and full attention-finding display. |
| v2.0.0 | Prior release | Hardened candidate with 12 security domains, SARIF, JSON, Markdown, SVG, JPG, and traceability metadata. |
| v1.1 | Historical baseline | DOCX-aligned expanded draft that grew the self-check from 7 to 12 domains. |
| v1 | Original baseline | First read-only ARX/Hermes operational security scorecard covering 7 core domains. |

## v3.5.0 — correctness and contract-hardening release

### Release status

Approved after implementation validation, independent Aegis security review, Athena QA, and immutable-candidate verification on 2026-07-22.

### What's New?

- Adds exact target scope with explicit runtime scope modes.
- Reports incomplete coverage, unreadable paths, truncation, and symlink decisions instead of silently passing.
- Separates host Docker state from target Compose declarations and active/example variants.
- Classifies secret references, placeholders, fixtures, documentation examples, and confirmed literals without emitting values.
- Adds stable finding IDs, scope, confidence, reachability, evidence kind, and derived relationships.
- Prevents low-confidence lexical matches from creating Critical correlations.
- Emits and validates the canonical `shore-sentinel.scanner-output/v1` envelope directly.
- Preserves v3.4.0 unchanged as a rollback/reference baseline.

## v3.4.0 — hardware summary reference release

### Release date

2026-06-15

### What's New?

- Adds a Hardware Summary section above the category score cards in the PDF report.
- Captures environment type, CPU cores, memory, disk, and network adapters in the approved release PDF.
- Approves and releases the v3.4 report artifact from Kanban task `t_0696d0ea`.

### Fixed Issues

- Tightens PDF presentation by surfacing hardware context before the scorecards.
- Preserves the existing remediation-plan history and all prior release notes below this new entry.


## v3.3.0 — inline remediation task release

### Release date

2026-06-13

### What's New?

- Moves remediation tasks directly under each finding's evidence line in the Markdown and PDF reports.
- Tightens remediation-task file paths so they resolve to the most relevant repo policy or docs file.
- Adds a release note entry for the inline task layout change.

### Fixed Issues

- Fixed overlapping recommendation text in the PDF findings cards by increasing the card-height allowance.
- Fixed the missing release history note in the script by moving version history into this docs file.
- Keeps the v3.3.0 runtime version unchanged while improving report presentation.

## v3.0.1-rc1 — consumer-ready PDF evidence refinement

### Release date

2026-06-03

### What's New?

- Promotes the portable auditor from `3.0.0-rc1` to `3.0.1-rc1`.
- Adds finding evidence to each WARN/FAIL finding card in the PDF so business reviewers can immediately see what is wrong without opening Markdown.
- Keeps Markdown, JSON, and SARIF as the complete detailed outputs while positioning the PDF as the consumer-ready presentation report.

### Fixed Issues

- Removes the cover-page header text `CONSUMER-READY SECURITY REPORT` from the PDF.
- Removes the report-version label from the PDF cover while retaining version metadata in Markdown, JSON, SARIF, and the script output.
- Keeps the PDF cover title as `AI Agent Security Audit Report` with the full script filename as subtitle.
- Fixes finding-card text layout so title, evidence, and recommendation blocks are spaced dynamically and do not overlap.
- Preserves the no-audit-scope PDF behavior while retaining scope/detail in Markdown, JSON, and SARIF.

## v3.0.0-rc1 — report-ready portable audit candidate

### Release date

2026-06-03

### What's New?

- Promotes the portable auditor from `3.0.0-test` to `3.0.0-rc1`.
- Adds an Executive Summary section to Markdown output.
- Adds Category Scorecards with check counts and status totals.
- Sorts findings by risk/severity/status so critical and high-risk issues appear first.
- Adds Methodology / Tools Used to explain the read-only audit process.
- Adds Frameworks Used, including Hermes security guidance, OWASP LLM, NIST AI RMF, CIS, SOC 2, ISO, MITRE ATLAS, SLSA, and SSDF.
- Embeds Hermes security best practices from `https://hermes-agent.nousresearch.com/docs/user-guide/security` into report metadata and Markdown output.
- Adds executive summary and framework/methodology/security-practice metadata to JSON output.
- Adds a dependency-free, presentation-grade PDF report on every script run in the same reports folder as JSON, Markdown, and SARIF outputs.
- Refines the PDF as the consumer-ready report view: title `AI Agent Security Audit Report`, subtitle as the full script filename, compact section flow, and no audit-scope block in the PDF while retaining scope/detail in Markdown, JSON, and SARIF.

### Fixed Issues

- Improves report readability for executive and audit review.
- Keeps generated findings sorted consistently in JSON and Markdown.
- Generates a polished formal PDF without external dependencies so the portable auditor still runs in minimal environments.
- Fixes PDF executive-summary spacing so wrapped summary text does not overlap the scorecard area.
- Reduces large PDF whitespace by flowing methodology, framework, best-practice, and safety-note sections onto available page space instead of forcing a new page for every section.
- Refines non-secret config secret scanning to reduce false positives from environment-variable lookups, scanner regex definitions, and redacted/token placeholder code.
- Verifies generated reports do not expose obvious token/key patterns.

## v3.0.0-test — portable Hermes/OpenClaw auditor

### Release date

2026-06-03

### What's New?

- Introduces a portable agent-mesh auditor focused on Hermes/ARX and OpenClaw.
- Removes unsupported agent frameworks from v3.0.0 scope.
- Adds universal discovery before framework-specific adapter checks.
- Adds Hermes adapter checks for model routing, fallbacks, approvals, terminal backend, lazy installs, redaction, environment passthrough, OAuth/auth metadata posture, private URL access, dashboard exposure, Telegram/Slack boundaries, Discord attachment handling, gateway file trust, platform tool breadth, MCP inventory, skill/plugin inventory, cron inventory, cron script boundaries, delegation limits, subagent approvals, and runtime mounts.
- Adds OpenClaw adapter heuristics for model/provider markers, approval policy markers, instruction boundaries, tool exposure, deployment posture, and persistence hooks.
- Expands all major audit categories beyond single-check coverage, including prompt-injection defenses, secrets/privacy, container/runtime, tools/plugins/MCP, subagents, persistence/deployment, execution/approvals, supply chain, and risk correlation.
- Adds compound mesh-risk correlation and cross-category coverage correlation for app-building/deployment-capable agents.
- Generates JSON, Markdown, and SARIF outputs.

### Fixed Issues

- Avoids mutating or overwriting the stable ARX/Hermes v2.1.0 script.
- Avoids self-detecting OpenClaw from this auditor's own plan/script files.
- Handles Hermes YAML parsing without PyYAML by skipping list bodies so fallback model keys do not overwrite the primary model block.
- Keeps secret-file checks metadata-only and redacts evidence fields.

## v2.1.0 — enhanced scanner pack release

### Release date

2026-05-29

### What's New?

- Adds the read-only enhanced scanner pack for optional CVE/dependency, GitHub, and Supabase posture checks.
- Adds `SKIP` findings so missing tools, missing cloud auth, or absent project context do not fail the self-check.
- Adds Python package inventory capture without exposing secret values.
- Adds optional local and tool-backed dependency/security scanners when installed:
  - `pip-audit`
  - `safety`
  - `npm audit`
  - `trivy`
  - `grype`
  - `bandit`
  - `semgrep`
  - `gitleaks`
- Adds GitHub local repository hygiene and optional `gh` cloud posture checks.
- Adds Supabase project detection, metadata-only environment checks, static SQL posture review, and optional CLI/database read-only checks.

### Fixed Issues

- Fixed missing scanner/tool handling so absent optional tools are reported as skipped rather than failures or runtime errors.
- Fixed the v2.0.1 baseline divergence by checking `approvals.mcp_reload_confirm`, `approvals.destructive_slash_confirm`, and tighter subagent concurrency expectations.
- Preserves read-only behavior for the scanner pack and avoids auto-installing or mutating external scanner tools.

## v2.0.1 — report presentation release

### Release date

2026-05-27

### What's New?

- Increases visual report JPG output resolution for zoom-friendly review.
- Expands the SVG/JPG canvas to support longer reports.
- Adds reusable SVG text wrapping helpers for long labels and findings.
- Shows all FAIL/WARN findings requiring attention in the visual report instead of only priority findings.
- Keeps JSON, Markdown, SVG, SARIF, and JPG outputs aligned to the same result data.

### Fixed Issues

- Fixed framework header text running off the edge of the image by wrapping it across lines.
- Fixed category scorecard text overlap by widening the layout and wrapping remarks.
- Fixed visual report truncation of findings by rendering all findings requiring attention.
- Fixed Markdown warning summary truncation so all warnings are listed, not only the first 10.

## v2.0.0 — hardened candidate

### Release date

2026-05-27

### What's New?

- Promotes the expanded DOCX/v1.1 design into the current hardened candidate.
- Keeps the 12-domain security model:
  - Access Control
  - Approvals & Execution
  - Secrets & Privacy
  - Network & SSRF
  - Skills / Plugins / MCP
  - Subagents
  - Cron & Persistence
  - Prompt Injection Defenses
  - Container Hardening
  - Supply Chain
  - Multi-Agent Trust
  - OAuth & Auth Lifecycle
- Adds/keeps compliance-style outputs:
  - JSON
  - Markdown
  - SVG
  - SARIF
  - JPG
- Keeps per-check framework control mapping.
- Keeps dynamic compound-risk correlation.
- Keeps SOUL.md guardrail validation.
- Keeps configurable scoring weights with `--weights`.
- Adds traceability metadata:
  - script SHA256
  - Git repo root
  - Git commit hash
  - Git dirty state
  - policy baseline version

### Fixed Issues

- Fixed fragile config value normalization for `None`, strings, lists, tuples, sets, dictionaries, and scalar values.
- Added `string_list()` to prevent unsafe `set(...)` operations on unhashable values.
- Fixed the gateway toolset parsing crash path.
- Added per-domain exception isolation through `run_domain()`.
- Converted check-domain crashes into WARN findings instead of aborting the whole report.
- Hardened OAuth expiry parsing for dict, list, and nested credential schemas.
- Added traceability details to Markdown output.

## v1.1 — DOCX-aligned expanded draft

### Release date

2026-05-27

### What's New?

- Expands the self-check from 7 domains to 12 domains.
- Adds prompt-injection and instruction-boundary checks.
- Adds container hardening checks.
- Adds supply-chain checks.
- Adds multi-agent trust checks.
- Adds OAuth/auth lifecycle checks.
- Adds per-check framework control IDs.
- Adds SARIF v2.1 output.
- Adds dynamic compound-risk correlation.
- Adds SOUL.md guardrail validation.
- Adds configurable scoring weights with `--weights`.

### Fixed Issues

- Addresses v1's lack of per-check framework control mapping.
- Addresses v1's lack of SARIF output.
- Addresses v1's lack of explicit SOUL.md guardrail checks.
- Addresses v1's lack of OAuth/auth lifecycle coverage.
- Addresses v1's lack of dynamic compound-risk correlation.
- Adds broader container, supply-chain, and multi-agent coverage.

## v1 — original operational baseline

### Release date

2026-05-27

### What's New?

- Establishes the first read-only ARX/Hermes operational security scorecard.
- Covers 7 core domains:
  - Access Control
  - Approvals & Execution
  - Secrets & Privacy
  - Network & SSRF
  - Skills / Plugins / MCP
  - Subagents
  - Cron & Persistence
- Produces JSON, Markdown, SVG, and JPG.
- Supports dynamic agent naming.
- Includes category remarks and risk labels.
- Designed for weekly operational hygiene checks.

### Fixed Issues

- Initial release; no prior self-check version issues to resolve.

## Maintenance rules

- Keep the newest version at the top of this file.
- Keep the newest release script under an exact versioned filename in `scripts/security-tools/agent-security-selfcheck/`, e.g. `scripts/security-tools/agent-security-selfcheck/ARX_Agent_Security_Selfcheck_v2.0.1.py`.
- Keep the prior released script as a historical reference under its previous version filename in the same folder, e.g. `scripts/security-tools/agent-security-selfcheck/ARX_Agent_Security_Selfcheck_v2.py`.
- Keep validation and remediation separate.
- Never print token values or secret contents in reports.