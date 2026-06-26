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
- Guided scan entry flow (`/scans/start`) with one-time audit vs managed-machine guidance, target-detail collection, scan kickoff, and progress/report redirect.
- Display preferences page and global chrome entry point for comfortable/compact density, standard/high contrast, and full/reduced-effects modes.
- Saved operational views pages and cards for high findings, unreviewed remediation, failed scans, and recently completed scans.
- Remediation detail pages now load live data dynamically and surface plan owner, due date, evidence attachments, comments, and activity history.
- Result-summary and filter affordances across filterable operational views.
- Dashboard next-best-action, trend analysis, severity/score explanation, and saved-view panels.

### Changed
- Dashboard and Scans & Reports Start scan CTAs now use the guided `/scans/start` entry.
- Remediation, scans, reports, users, inventory, audits, and knowledgebase pages were updated for clearer operator flow and accessibility.
- Regression verifier now covers 18 routes, guided scan flow, display preferences, saved views, filters, remediation teamwork, and trend/notification markers.

### Verification
- Web regression verifier passed.
- Web production build passed.
