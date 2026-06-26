# Changelog

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
