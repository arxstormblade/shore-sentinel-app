# Managed Machine Compact Dossier — UI/UX Quality Gate

**Date:** 2026-07-16

**Route:** `/shore-sentinel/inventory/machines/[id]`

**Decision:** PASS

## Hard blockers

None.

## Soft refinements

- Dates currently follow the browser locale; relative-time support could improve rapid scanning later.
- Mobile retains the existing compact navigation and account rails; a future shell-wide navigation review could reduce the combined vertical footprint.
- Remediation defaults to one expanded item only in QA evidence; production items correctly start collapsed.

## Score

| Category | Score |
|---|---:|
| Visual Quality | 19/20 |
| Simplicity & Usability | 20/20 |
| Business Meaning | 15/15 |
| Interaction Quality | 10/10 |
| Responsive Behaviour | 10/10 |
| Accessibility | 10/10 |
| Technical Frontend Quality | 9/10 |
| Performance & Polish | 4/5 |
| **Total** | **97/100** |

## Verified outcomes

- The primary `Scan machine` action is visible in the machine header.
- Scan launch traverses the mounted same-origin proxy and returns HTTP `201` in authenticated browser QA.
- The action locks as `Scan in progress` after launch to prevent duplicate submissions.
- Remediation uses native inline disclosures with `Expand details` / `Hide details` labels.
- Reports use compact rows instead of repeated dashboard cards.
- Machine settings and destructive controls use progressive disclosure.
- No raw identifiers, database structures, or implementation details are exposed in the primary layout.

## Breakpoint evidence

| Viewport | Summary structure | Overflow | Browser errors | Rendered targets below 44px |
|---|---|---:|---:|---:|
| 1440×1050 | 6 columns | none | 0 | 0 |
| 900×1050 | 3 columns | none | 0 | 0 |
| 390×844 | 1 column | none | 0 | 0 |

## Technical gates

- `tests/test_managed_machine_dossier.py`: passed.
- Users proxy and side-navigation focused regressions: passed.
- Phase 0 validation: passed.
- Web production Docker build: passed.
- Playwright authenticated interaction/responsive gate: passed.
- Added-line static security scan: clean.

## Baseline note

Untouched `origin/main` and this branch both report the same three unrelated repository-test failures caused by existing API merge markers and a reintroduced one-time-audit route. The managed-machine work introduces no additional test failure.
