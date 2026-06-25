# Changelog

## v0.3.0 (unreleased)

### Added

- Guided scan entry flow (`/scans/start`): single Start scan entry from the dashboard and Scans & Reports that explains one-time audit vs managed machine in plain language, collects target details, creates the audit, kick offs the run, and redirects to the live progress / completed report page.
- New web API route `POST /api/scans/start` that provisions a one-time audit, enqueues the scan run, and 303-redirects to the report page so the guided flow lands on progress + artifacts in one shot.
- Dashboard hero CTAs consolidated to "Start scan" (guided entry) and "Add & scan machine" (managed enrollment) — both reach the managed machine fleet workflow; audit flow is now driven through the guided entry.
- Scans & Reports header CTA relabeled to "Start scan" and pointed at `/scans/start` so there is a single guided entry across the app.
- Accessible heading hierarchy (h1 > h2 per step), `role="status"` for the progress/report explainer, focus-visible preserved, plain-language link affordances throughout.
- Regression verifier updated: asserts the new route, dashboard/scans-reports entry links, one-time audit / managed machine plain-language labels, progress/report reachability, ARIA regions, and heading order.
