# Managed Machine Compact Dossier Design

## Goal
Turn the managed-machine detail screen into a compact operational workspace where an operator can launch a scan immediately, understand machine posture at a glance, review recent reports, and inspect remediation guidance without leaving the page.

## Chosen approach
Use a **compact operations dossier**, not a card grid.

A card grid is appropriate when users compare peer objects. This page is about one machine and has a natural reading order, so a full-width dossier is more efficient:

1. Machine identity and primary scan action.
2. Compact operational summary.
3. Current scan progress, only when useful.
4. Remediation queue with inline disclosure.
5. Recent reports in dense rows.
6. Collapsed administrative settings and danger zone.

## Layout

### Machine header
- Keep machine name, platform/owner context, and status together.
- Place `Scan machine` as the primary action in the header.
- Disable the action while a launch is pending or a non-final scan is active.
- Show launch success/failure feedback near the action.

### Operational summary strip
Use one compact definition-list strip for:
- Environment
- Owner
- Connection
- Findings
- Open remediation
- Last scan

Do not expose implementation labels such as `managed_machine` or raw underscore-separated values.

### Scan progress
Show a compact progress band with status, percentage, elapsed/ETA, and progress bar. It should not become a large card.

### Remediation
Each item is a native `<details>` disclosure:
- Collapsed row: severity, title, status, and explicit `Expand details` affordance.
- Expanded body: concise recommended action and a secondary `Open full record` link.
- Clicking the row expands inline; navigation is no longer the only way to read details.
- Empty state explains that a new scan can generate findings.

### Reports
Use a compact list rather than cards:
- Human-readable label (`Managed machine scan`)
- completion time
- status
- artifact count
- explicit `Open report` link
- limit initial display to the most recent useful set already returned by the API

### Administration
- Place editable machine settings in a collapsed disclosure named `Machine settings`.
- Keep destructive controls in a separate collapsed `Danger zone` disclosure.
- Preserve permissions and existing API behavior.

## Responsive behavior
- Desktop/tablet: summary strip wraps into compact columns; sections remain full-width.
- Mobile: header actions stack, summary becomes two columns then one where necessary, disclosure controls remain at least 44px high, and no horizontal scrolling is permitted.

## Accessibility
- Use semantic headings, definition lists, buttons, links, `<details>`, and `<summary>`.
- Keep visible focus styles from the existing system.
- Progress uses `role="progressbar"` and value attributes.
- Action feedback uses `aria-live="polite"`.
- Disclosure affordances use visible text, not icon-only controls.

## Error handling
- Failed scan launch produces an inline message without removing existing content.
- Missing remediation guidance falls back to a safe, business-readable instruction.
- Missing dates and metadata render as `Not available`, not raw nulls or symbols.

## Acceptance criteria
- `Scan machine` is visible above the fold and posts to `/targets/:id/scan-jobs`.
- The route mounts `MachineDetailClient` and has no merge-conflict markers.
- The page does not use the generic `.grid`, `.cards`, or report-card layout.
- Remediation items expand inline using native disclosure controls.
- Admin settings and danger zone are collapsed by default.
- Desktop, tablet, and mobile have no horizontal overflow or console/page errors.
- Existing Users, managed-direction, and one-time-audit guards continue to pass.
