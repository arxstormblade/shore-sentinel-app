# Shore Sentinel App-Wide Compact Operations Design

## Status

Approved by the product owner on 2026-07-16.

## Goal

Apply the managed-machine compact dossier concept across Shore Sentinel's authenticated operational and administrative pages while preserving each page's purpose, actions, data dependencies, mounted-path behavior, and security boundaries.

## Product direction

- Managed machines remain the primary product workflow.
- One-time audits remain a GitHub-pulled local scanner workflow.
- `/audits` remains a secondary read-only legacy evidence archive.
- `/audits/new` and in-app audit creation/run endpoints are retired.
- Authentication pages remain narrow and focused rather than becoming operational dossiers.
- The side navigation remains word-only and persistent on desktop/tablet, with the existing compact mobile shell.

## Design principles

1. **Operations before presentation.** Put status, risk, and the primary action above the fold.
2. **One object, one reading order.** Use full-width dossiers for detail pages; grids are reserved for genuine comparison.
3. **Compact, not cramped.** Reduce card chrome and repeated headings without reducing readable typography or 44px interaction targets.
4. **Progressive disclosure.** Use native disclosures for evidence, guidance, settings, advanced controls, and destructive actions.
5. **Business language.** Do not expose database fields, enum syntax, raw identifiers as titles, or implementation details.
6. **Live meaning.** Dashboard visualizations and counts must derive from live values rather than hard-coded geometry.
7. **Functional controls.** Filters must change visible results or be removed; decorative controls are not acceptable.
8. **Mounted-path safety.** Browser mutations use same-origin mounted proxy routes and preserve authentication headers/cookies.

## Shared compact operations system

### Page header

A compact header contains:
- eyebrow/context;
- page title and one concise explanation;
- current status where applicable;
- one primary action and restrained secondary actions.

### Summary strip

A semantic `dl` presents three to six operational values. It collapses from six columns on desktop to three on tablet and one on mobile.

### Operational section

A full-width section uses:
- a compact section heading;
- optional count/status;
- dense rows, grouped work objects, or disclosures;
- a composed empty/error state.

### Data rows

Rows prioritize the work object and show only the information needed to choose an action. Secondary evidence and guidance opens inline.

### Settings and destructive actions

Settings and danger zones remain collapsed until requested. Destructive actions retain explicit confirmation and authorization.

### Filters

Filters are implemented as real query-driven or client-side controls. They must:
- have labels;
- preserve current values;
- visibly change results;
- provide a clear reset path;
- remain keyboard accessible.

## Route treatment

### `/dashboard`

Replace the marketing-style card dashboard with an operator briefing:
- live fleet/risk summary strip;
- prioritized exceptions grouped by machine;
- recent operational activity;
- one primary `Add managed machine` action;
- no repeated tables and no hard-coded severity chart geometry.

### `/inventory`

Use a compact managed-machine registry with status, owner, environment, latest scan, open remediation, and direct dossier access. Preserve enrollment and filters.

### `/inventory/new`

Keep a focused enrollment workflow. Group identity, ownership, connection, and security fields; hide advanced options until expanded. Preserve field names and form submission behavior.

### `/scans/start`

Use a concise monitoring command center: enrollment as the primary action, report review as secondary, and a compact workflow timeline.

### `/scans-reports`

Use a managed evidence ledger with functional filters, live totals, compact run rows, status, subject, environment, completion time, severity, finding count, and direct report access.

### `/scans-reports/reports/[id]`

Use a report dossier with a summary strip, compact artifact ledger, expandable findings/remediation evidence, and secondary compare/export disclosures. Preserve downloads and anchors.

### `/remediation`

Retain machine-first grouping. Compact closed group summaries and reveal findings, recommended actions, evidence, and deep links inline.

### `/remediation/[id]`

Use an action dossier with current workflow state, business impact, guidance, evidence, related machine/report context, and activity in reading order.

### `/users`

Use a compact user directory with status and roles visible in rows. Preserve create, edit, enable/disable, reset-password, and delete flows with clear authorization and confirmation.

### `/system/update`

Use a readiness band and concise update controls. Preserve disabled-by-default and admin-only behavior, busy states, release metadata, warnings, and expandable console output.

### `/preferences`

Use one compact settings sheet with grouped controls and immediate display behavior.

### `/saved-views` and `/saved-views/[slug]`

Use a compact saved-view ledger and result workspace. Preserve view selection, filter state, and result navigation.

### `/knowledgebase`

Use a structured reference index and concise expandable operational sections rather than equal card grids.

### `/audits` and `/audits/[id]`

Retain as read-only legacy evidence. Use compact ledger/detail patterns and an intentional `Promote to managed machine` handoff. Do not offer create or run actions.

### `/auth/login` and `/auth/register`

Keep the current narrow, focused authentication experience. Only shared typography, tokens, and accessibility corrections apply.

## Repository integrity and API contracts

Before UI rollout:
- remove committed merge markers and duplicate controller/test blocks;
- preserve the known-good managed-machine, user, artifact, report, remediation, and update APIs;
- remove in-app one-time-audit creation/run endpoints and routes;
- align remediation statuses with the database contract or map them at the boundary;
- add regression tests for route order, audit removal, and mounted proxy behavior.

## Accessibility and responsive requirements

- Visible keyboard focus.
- Semantic headings, lists, tables/definition lists, and native disclosures.
- `aria-live` for mutation status.
- At least 44px rendered interaction targets where applicable.
- No horizontal page or internal-section overflow at 1440×1050, 900×1050, and 390×844.
- No reliance on color alone for status or severity.
- Respect reduced-motion preferences.

## Quality gate

Every authenticated route must pass:
- UX designer review;
- business-user review;
- commercial SaaS review;
- frontend architecture review;
- no hard blockers;
- 95+ score;
- production web build;
- focused regression tests;
- authenticated Playwright desktop/tablet/mobile capture;
- zero page errors, console errors, and horizontal overflow.

## Non-goals

- No framework or CSS-library migration.
- No new product capabilities unrelated to the current routes.
- No deployment to the live Shore360 stack without a separate explicit approval.
- No production dependency on Playwright.
