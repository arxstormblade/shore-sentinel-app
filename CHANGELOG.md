# Changelog

## v0.3.2 - 2026-06-26

### Security
- Removed undo-delete tokens from user deletion audit payloads and redacts token/secret/password/key fields from audit-log API payloads.
- Tenant-scoped undo-delete token validation and token consumption.
- Preserved password hashes during soft delete so successful undo restores the account without leaving `password_hash=DELETED`.
- Added tenant validation for remediation owner, evidence artifact, and comment author references.

### Fixed
- Prevented browser form navigation during user delete confirmation submit.
- Added validation for generic remediation status updates to return a controlled 400 instead of database constraint errors.

### Verification
- API build/tests passed: 47/47.
- Web verifier and production build passed.

## v0.3.1 - 2026-06-26

### Fixed
- Fixed live remediation page runtime crash by correcting the shared `SEVERITY_LEVELS` filter constant.
- Fixed live `/remediations/status-counts` API route ordering so Nest does not route `status-counts` through the parameterized remediation-id handler.

### Verification
- API build/tests passed: 45/45.
- Web regression verifier and production build passed.
- Live Tailnet verification rerun after deployment.

## v0.3.0 - 2026-06-25

### Added
- Product-roadmap epic release covering the full scan-to-remediation activation path, operator guidance, remediation operations, saved views, display preferences, notifications planning, and trend analytics.
- Guided scan entry flow at `/scans/start` so operators can choose one-time audit or managed-machine enrollment from a single Start scan path and land on progress/report surfaces.
- Next-best-action guidance on dashboard, scan/report, and remediation surfaces so each security state tells operators what to do next.
- Remediation workflow states and API support for `needs_review`, `in_progress`, `fixed`, and `accepted_risk`, including status counts and status transitions.
- Remediation teamwork model with owner, due date, evidence attachments, threaded comments, and activity history.
- Report-to-remediation continuity from scan reports, evidence views, and remediation detail pages.
- Saved operational views for high findings, unreviewed remediation, failed scans, and recently completed scans.
- Display preferences for comfortable/compact density, standard/high contrast, and full/reduced visual effects.
- Dashboard trend analytics contract and panel covering severity history, risk-score movement, fixed-vs-new findings, and internal posture benchmarking.
- Notification planning for failed scans, critical/high findings, weekly posture summaries, and Telegram/Teams/email channel routing.

### Changed
- Dashboard, Scans & Reports, Remediation, Inventory, Audits, Users, Knowledgebase, and navigation were updated for clearer operator flow and stronger accessibility affordances.
- Filters now provide applied result summaries, clear-filter affordances, URL-state behavior, and screen-reader status announcements.
- Severity and score explanations are visible inline so operators do not need hover-only help to understand prioritization.
- Admin delete flows now use safer confirmation, soft-delete/undo semantics where applicable, affected-resource detail, and audit trail coverage.
- Remediation queue can group findings by severity and machine to speed triage.
- Architecture and release documentation now reflect the product roadmap additions and operational workflow expectations.

### Fixed
- Fixed remediation detail runtime import coverage and expanded verifier checks around dynamic remediation detail pages.
- Fixed integration gaps found during the Kanban epic sequencing/release process, including build-cache ownership and release metadata drift.

### Verification
- Phase 0 scaffold validation passed.
- Scanner bundle validation passed.
- Docker Compose smoke validation passed.
- Worker Python tests passed.
- Worker Node tests passed: 7/7.
- API build and tests passed: 44/44.
- Web regression verifier passed: 18 routes.
- Web production build passed: 28 generated routes.

## v0.2.0 - 2026-06-25

### Added
- Bundled scanner execution now produces raw JSON, Markdown, PDF, SARIF, normalized findings, and enrichment artifacts for completed scans.
- Scan runs and findings API endpoints now back live Scans & Reports, Remediation, and dashboard metrics.
- Dashboard now shows live severity counts, recent scans, highest-severity posture, and action-oriented scan/remediation links.
- User Management was restored with text-labeled admin actions, role controls, loading/status announcements, and accessible dialog semantics.
- Same-origin auth status probing and normalized session cookie paths improve admin permission detection behind the Tailnet-mounted app.

### Changed
- Reworked primary UX flows around task clarity: start scan, review progress, open reports/artifacts, and move from findings to remediation.
- Replaced internal implementation labels and API notes with plain-language managed-machine enrollment choices and contextual knowledgebase links.
- Improved visual/accessibility design tokens for operational screens: stronger surfaces and borders, larger minimum operational text, 44px target sizing, persistent action affordances, reduced-motion, and reduced-transparency support.
- Managed-machine detail pages now dynamically refresh admin permissions and keep the admin danger zone visible while gating destructive actions.

### Fixed
- Fixed static rendering/cookie issues that hid admin controls or caused detail-route failures after redirects.
- Fixed managed-machine deletion cleanup and surfaced inline delete status/errors.
- Fixed scanner artifact bucket self-healing and report download handling.
- Fixed dashboard severity aggregation so completed scan findings update metrics.
- Fixed remediation rendering for scanner object guidance so object values no longer appear as `[object Object]`.
- Fixed dashboard severity row layout and responsive table/screen-reader labeling for key data tables.

### Verification
- Verified with full project checks, API tests, web build/verifier, Docker Compose smoke checks, live Tailnet route checks, and Athena-style QA passes during the release cycle.

## v0.1.0
- Initial Shore Sentinel application scaffold
- Docker Compose baseline for web, API, Redis, PostgreSQL, and MinIO
- Placeholder service directories for web, API, worker-node, worker-python, and shared package
- Environment template with application, storage, queue, and SMTP placeholders
- Marked the web UI files as a later-phase prototype preview and kept them internally consistent while Phase 0 approval focuses on the repository/Docker scaffold
