# Shore Sentinel App-Wide Compact Operations Rollout Plan

> **For Hermes:** Use subagent-driven-development with TDD, spec review, code-quality review, and app-wide integration QA.

**Goal:** Apply the approved compact operations design to all authenticated operational/admin pages while preserving functions, retiring legacy audit creation, and restoring repository integrity.

**Architecture:** Establish shared compact primitives and route contracts first. Convert independent route groups in isolated worktrees, integrate commits into the verified feature branch, then run a single authenticated browser-quality loop across the whole app.

**Tech Stack:** Next.js App Router, React, vanilla CSS, NestJS API, Python regression guards, Node verifier scripts, Docker, Playwright local runner.

---

## Task 1: Restore source and API integrity

**Files:**
- Modify: `api/src/app.controller.ts`
- Modify: `api/test/controller-shapes.test.ts`
- Modify: `api/src/schema.ts` only if required for remediation status alignment
- Delete: `web/app/audits/new/page.jsx`
- Modify/delete: obsolete audit creation API proxies if present
- Test: `tests/test_remove_inapp_one_time_audit.py`
- Test: API controller/validation tests

**Steps:**
1. Add/strengthen failing regression tests for all merge markers, duplicate controller routes, audit creation/run routes, and remediation status compatibility.
2. Run them and verify expected failures.
3. restore the known-good controller shape, remove obsolete audit mutation paths, and align statuses at the boundary.
4. Run API tests/build and regression guards.
5. Commit the verified foundation.

## Task 2: Add shared compact operations primitives

**Files:**
- Modify: `web/components/ui.jsx`
- Create/modify: focused shared components under `web/components/`
- Modify: `web/app/globals.css`
- Create: `tests/test_compact_operations_system.py`

**Steps:**
1. Add failing structure/accessibility/responsive tests for compact headers, summary strips, operational sections, ledgers, disclosures, empty states, and functional-filter contracts.
2. Implement small semantic shared components without changing route behavior.
3. Add responsive CSS with 44px targets and reduced-motion handling.
4. Run tests and web build.
5. Commit the shared system.

## Task 3: Convert dashboard and inventory routes

**Files:**
- Modify: `web/app/dashboard/page.jsx`
- Modify: `web/app/inventory/page.jsx`
- Modify: `web/app/inventory/new/page.jsx`
- Modify: `web/app/scans/start/page.jsx`
- Test: route-group regression tests

**Requirements:**
- live dashboard severity proportions;
- no duplicate action cards/tables;
- compact machine registry;
- grouped enrollment form with progressive advanced fields;
- concise scan command center;
- preserve all links, form names, API actions, and empty states.

## Task 4: Convert reports and remediation routes

**Files:**
- Modify: `web/app/scans-reports/page.jsx`
- Modify: `web/app/scans-reports/reports/[id]/page.jsx`
- Modify: `web/app/remediation/page.jsx`
- Modify: `web/app/remediation/[id]/page.jsx`
- Create/modify: client filter/disclosure components as required
- Test: route-group regression tests

**Requirements:**
- functional evidence-ledger filters;
- compact report dossier and artifacts;
- expandable findings/remediation evidence;
- preserve downloads, links, mutation controls, and machine-first queue behavior.

## Task 5: Convert admin, preference, saved-view, knowledgebase, and legacy archive routes

**Files:**
- Modify: `web/app/users/**`
- Modify: `web/app/system/update/**`
- Modify: `web/app/preferences/page.jsx`
- Modify: `web/app/saved-views/**`
- Modify: `web/app/knowledgebase/page.jsx`
- Modify: `web/app/audits/page.jsx`
- Modify: `web/app/audits/[id]/page.jsx`
- Test: route-group regression tests

**Requirements:**
- preserve all user CRUD/access workflows;
- preserve update readiness, safety, output, and authorization states;
- preserve display preferences and saved-view behavior;
- make knowledgebase compact and navigable;
- legacy audits are read-only only.

## Task 6: Add canonical QA gate artifacts

**Files:**
- Create: `policies/templates/qa-checklist-template.md`
- Create: `policies/templates/qa-scorecard-template.md`
- Create: `docs/qa/app-wide-compact-operations-test-guide.md`
- Create: `tests/test_quality_gate_artifacts.py`

**Steps:**
1. Add failing artifact-presence/content tests.
2. Add blocker, scoring, route, breakpoint, interaction, and evidence requirements.
3. Verify artifacts and links.

## Task 7: Integration, security, and browser quality loop

**Validation:**
1. Run focused and full Python tests with baseline comparison.
2. Run web verifier scripts and API tests.
3. Build API and web production images.
4. Launch a synthetic authenticated QA stack without live data mutations.
5. Exercise every authenticated route at 1440×1050, 900×1050, and 390×844.
6. Verify primary actions, filters, disclosures, forms, mutations, downloads, empty/error states, 44px targets, and mounted paths.
7. Record screenshots, metrics, and a scorecard.
8. Fix obvious issues and repeat until 95+ with no blockers.
9. Run independent spec and code-quality review.
10. Commit and push the verified branch; do not deploy live without explicit approval.

## Rollback

- The rollout remains isolated on `fix/compact-managed-machine-dossier` until reviewed.
- The prior verified commit remains available as the rollback point.
- No schema migration or live deployment is part of this rollout.
