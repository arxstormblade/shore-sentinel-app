# Changelog

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
