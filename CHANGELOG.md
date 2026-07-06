# Changelog

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
