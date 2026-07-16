# Managed Machine Compact Dossier Implementation Plan

> **For Hermes:** Implement task-by-task using TDD and verify the live screen after every visual change.

**Goal:** Restore the intended managed-machine detail client and redesign it as a compact operational dossier with a visible scan action and inline remediation disclosures.

**Architecture:** The server route loads authenticated target and run data, normalizes it into one machine view model, and renders the existing client component. The client owns scan launch/progress and disclosure-based presentation. Existing API endpoints remain unchanged.

**Tech Stack:** Next.js App Router, React client component, CSS, Python source-regression tests, Docker build, Playwright browser QA.

---

### Task 1: Restore a compilable route baseline

**Files:**
- Modify: `web/app/inventory/machines/[id]/page.jsx`
- Modify as build prerequisites only: conflicted web route/CSS files identified in `origin/main`

1. Restore known-good conflict resolutions from commit `92fe9c2` for committed web conflict files.
2. Replace stale `getSessionUser` usage with current `getAuthenticatedUser`.
3. Load `/targets/:id` and `/targets/:id/scan-runs` with session-cookie forwarding through `apiGet`.
4. Pass findings, remediation, reports, and machine metadata to `MachineDetailClient`.
5. Verify no web conflict markers remain.

### Task 2: Add managed-machine dossier regression tests

**Files:**
- Create: `tests/test_managed_machine_dossier.py`

1. Write tests requiring the visible scan action and scan-job endpoint.
2. Write tests requiring native remediation disclosures with explicit expansion text.
3. Write tests rejecting generic grid/report-card layouts in the detail component.
4. Write tests requiring collapsed settings and danger-zone disclosures.
5. Run tests and verify they fail for missing behavior.

### Task 3: Implement compact dossier presentation

**Files:**
- Modify: `web/components/machine-detail-client.jsx`
- Modify: `web/app/globals.css`

1. Replace the large hero/card stack with a compact header and summary strip.
2. Keep `Scan machine` above the fold and disable it during active runs.
3. Replace progress card with a compact progress band.
4. Add remediation `<details>` rows with inline guidance and full-record links.
5. Replace report cards with compact report rows.
6. Wrap machine settings and danger controls in collapsed disclosures.
7. Add responsive, focus, and density CSS scoped to `.machine-dossier`.
8. Run the focused test until green.

### Task 4: Verify regressions and build

**Files:** no new production files

1. Run `python3 tests/test_managed_machine_dossier.py`.
2. Run existing focused Python regression tests.
3. Run `python3 scripts/validate_phase0.py`.
4. Run `git diff --check` and conflict-marker scan.
5. Build the web image with Docker.

### Task 5: Browser QA loop

1. Serve the built image against a controlled authenticated API stub containing one target, runs, and remediation records.
2. Capture desktop 1440px, tablet 900px, and mobile 390px with `/home/arx/.hermes/playwright-runner`.
3. Verify scan button visibility, disclosure expansion, route stability, 44px controls, no horizontal overflow, and zero console/page errors.
4. Refine until the UI scores at least 95/100 with no hard blockers.

### Task 6: Publish scoped branch

1. Review staged paths and exclude generated assets.
2. Commit the design, tests, route repair, client, and CSS.
3. Push `fix/compact-managed-machine-dossier`.
4. Fetch and verify local/remote commit equality.
5. Do not deploy to the live Shore360 stack without separate approval.
