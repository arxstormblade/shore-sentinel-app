# Changelog

## Unreleased

- Removed the in-app one-time audit runner entry points. Standalone local evidence collection remains documented as the GitHub scanner option.

## v3.5.0 - Approved scanner release (2026-07-22)

- Added the isolated Agent Security Selfcheck v3.5.0 scanner bundle with authoritative target scoping, explicit coverage accounting, fail-closed incomplete-scan decisions, provenance-aware evidence, stable finding IDs, conservative correlation, and normalized JSON/Markdown/SARIF/PDF output.
- Added scanner bundle manifest/schema validation, semantic fixtures, Node runner integration coverage, Python parser contract checks, and release documentation. The v3.4.0 scanner remains unchanged as the rollback/reference baseline.
- Completed independent Aegis security and Athena QA approval for the immutable scanner candidate; tagging, deployment, runtime promotion, and rollback execution remain separately approval-gated.

## v1.1.0 - Release candidate (unreleased)

- Added a least-privilege CI quality/security gate for locked dependency installation, tests, project checks, production dependency auditing, and repository secret scanning without cloud credentials.
- Added a release QA scorecard template that requires fixture, browser/viewport, security-review, staged deployment, and rollback evidence before promotion.
- Updated release and install guidance: the release tag is created only at promotion, so pre-promotion documentation uses the reviewed default branch or an approved immutable commit SHA instead of an uncreated tag.
- Added release-checklist gates for pinned SSH host verification, disposable SSH fixtures, independent SSH security review, and rollback rehearsal.

## v1.0.0 - 2026-07-16

- Promoted the compact operations rollout to the first major Shore Sentinel release, covering the dashboard, managed-machine inventory and enrollment, scan reports, remediation, audit archive, administration, preferences, saved views, knowledgebase, and system update workflows.
- Added authoritative API role enforcement for user administration, managed-machine mutations, scan launches, and remediation-status updates; public registration is deny-by-default.
- Added fail-closed same-origin authorization proxies and direct regression coverage for managed-machine enrollment and remediation-status mutations.
- Restricted browser-facing artifact and scan-run data to public DTOs and hardened artifact downloads with fixed content types, attachment delivery, `nosniff`, and a sandboxed content-security policy.
- Kept this release deployment-neutral: merging and staged/live deployment remain separately approval-gated.

## v0.3.10
- Repositioned Shore Sentinel around managed-machine monitoring as the primary product workflow, including updated scan-entry copy and main navigation labeling.
- Converted one-time audit into a GitHub-pulled local scanner workflow where reports and artifacts stay on the client machine by default.
- Updated GitHub README instructions with two clear options: One-Time Audit by pulling the scanner script, and App Deployment by installing Shore Sentinel with Docker Compose.
- Added regression tests to preserve the managed-monitoring-first product direction and local-audit instructions.

## v0.3.9
- Improved dashboard action affordance by converting secondary dashboard links and report-row open actions into compact pill controls with larger hit areas and clearer hover states.
- Released managed-machine credential enrollment refinements, including SSH username, port, and authentication method capture with sealed credential storage and non-secret inventory metadata display.
- Added reusable Shore Sentinel UI/UX QA loop guidance for future live quality-gate passes.

## v0.3.8
- Added a documented GitHub-to-Docker installation path for customers cloning the repository and running Shore Sentinel with Docker Compose.
- Added an admin-only System Update page and protected API endpoints for checking and applying fast-forward GitHub updates.
- Added a disabled-by-default self-update script with status/check/apply modes, dirty-tree protection, backup branch creation, and Docker Compose rebuild/restart flow.
- Added an optional Compose override example for trusted single-tenant installations that explicitly mount the Git checkout and Docker socket.
- Polished the Shore Sentinel UI hierarchy, navigation marks, sign-in password toggle, and live-data dashboard presentation while preserving the existing dark security palette.
- Changed logged-out protected deep links to redirect to the Shore Sentinel homepage instead of the sign-in page.

## v0.3.7
- Require authentication before exposing Shore Sentinel operational pages or protected API data.
- Restore generated scanner report artifacts on report detail pages, including PDF, Markdown, SARIF, raw scanner JSON, normalized findings, and CVE enrichment summaries.
- Keep the sign-in email/password fields blank by default and add a show/hide password toggle.

## v0.3.6
- Added visible CVE-bearing report and remediation output so the live UI can show canonical CVE badges and NVD links when scanner findings include framework CVE references.
- Supersedes v0.3.5 for the completed CVE report/remediation release verification.

## v0.3.5
- Added CVE extraction to normalized findings when a framework or scanner reference includes a CVE identifier.
- Surfaced CVE badges and NVD links in report and remediation output when applicable.
- Kept remediation machine-first with summary findings visible before drill-down evidence and actions.
- Expanded scanner-output schema and parser tests to preserve CVE metadata through enrichment.

## v0.1.1
- Added CVE extraction to normalized findings when a framework or scanner reference includes a CVE identifier.
- Surfaced CVE badges and NVD links in report and remediation output when applicable.
- Expanded scanner-output schema and parser tests to preserve CVE metadata through enrichment.

## v0.1.0
- Initial Shore Sentinel application scaffold
- Docker Compose baseline for web, API, Redis, PostgreSQL, and MinIO
- Placeholder service directories for web, API, worker-node, worker-python, and shared package
- Environment template with application, storage, queue, and SMTP placeholders
- Marked the web UI files as a later-phase prototype preview and kept them internally consistent while Phase 0 approval focuses on the repository/Docker scaffold
