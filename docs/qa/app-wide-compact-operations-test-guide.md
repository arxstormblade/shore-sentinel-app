# App-Wide Compact Operations Test Guide

This guide governs QA for the shared compact operations system and every route conversion. It uses the canonical [QA checklist](../../policies/templates/qa-checklist-template.md) and [100-point scorecard](../../policies/templates/qa-scorecard-template.md).

## Gate

Each test uses an authenticated session appropriate to the route role. A route passes only with zero page errors, zero console errors, zero horizontal overflow, no hard blockers, and a score of 95+ on the scorecard. No production Playwright dependency is permitted; browser automation is a development/QA tool only.

## Route matrix

| Route | Primary operational verification |
|---|---|
| `/dashboard` | Live fleet/risk summary, prioritized exceptions, and Add managed machine action. |
| `/inventory` | Registry rows, filters, direct dossier access, and empty state. |
| `/inventory/new` | Enrollment form names, progressive advanced controls, and mounted-path submission. |
| `/scans/start` | Enrollment primary action, report access, and concise workflow state. |
| `/scans-reports` | Evidence ledger totals, functional filters/reset, run rows, and report access. |
| `/remediation` | Machine-first groups, inline evidence disclosures, and queue navigation. |
| `/users` | Directory status/roles plus authorized create, edit, enable/disable, reset, and delete flows. |
| `/system/update` | Admin-only readiness, disabled/busy states, release metadata, and expandable output. |
| `/preferences` | Immediate display-preference behavior with focused settings layout. |
| `/saved-views` | Saved-view selection, preserved filters, result navigation, and empty state. |
| `/knowledgebase` | Structured reference index and keyboard-accessible disclosures. |
| `/audits` | Read-only legacy evidence and managed-machine promotion handoff; no creation/run actions. |

For detail-route coverage, include `/inventory/machines/[id]`, `/scans-reports/reports/[id]`, `/remediation/[id]`, `/saved-views/[slug]`, and `/audits/[id]` when fixture data permits.

## Viewport and interaction loop

At each viewport—1440×1050, 900×1050, and 390×844—verify:

1. The authenticated shell, word-only side navigation, and route heading retain a single readable order.
2. Primary actions are authorized, functional, visibly report busy/success/error state, and render at least 44px tall.
3. Filters retain a labelled value, visibly change results, reset cleanly, and remain keyboard accessible.
4. Native disclosures provide visible text, open and close with keyboard input, and retain their inline context.
5. Empty and error states are announced, explain the condition, and offer only valid recovery paths.
6. Mounted-path browser requests preserve same-origin routing/authentication; no route bypasses the mounted proxy.
7. There is zero horizontal overflow, zero page errors, and zero console errors.

## Evidence record

For every route, attach the completed checklist, scorecard, focused regression output, authenticated browser results, viewport screenshots, target-size/overflow findings, console output, and Production web Docker build log. Record each blocker with its resolution and rerun the full matrix after any behavior change.
