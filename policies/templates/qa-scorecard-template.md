# Compact Operations QA Scorecard

## Hard-blocker gate

Any unresolved hard blocker is an automatic **FAIL**, regardless of points. A route can only receive **PASS** when all blockers are resolved and the total is at least **95/100**.

| Category | Maximum | Score | Evidence / notes |
|---|---:|---:|---|
| Visual Quality | 20 | /20 | |
| Simplicity & Usability | 20 | /20 | |
| Business Meaning | 15 | /15 | |
| Interaction Quality | 10 | /10 | |
| Responsive Behaviour | 10 | /10 | |
| Accessibility | 10 | /10 | |
| Technical Frontend Quality | 10 | /10 | |
| Performance & Polish | 5 | /5 | |
| Total | /100 | | |

## Decision

- Hard-blocker gate: PASS / FAIL
- Score threshold: 95/100
- Final result: PASS / FAIL

## Scoring guidance

- **Visual Quality (20):** compact hierarchy, restraint, visual consistency, and readable density.
- **Simplicity & Usability (20):** clear reading order, direct actions, minimal repetitive chrome, and understandable recovery paths.
- **Business Meaning (15):** status, risk, ownership, scope, and next actions are operationally meaningful.
- **Interaction Quality (10):** actions, filters, disclosures, feedback, busy states, and destructive confirmations behave predictably.
- **Responsive Behaviour (10):** the route works without horizontal overflow at desktop, tablet, and mobile breakpoints.
- **Accessibility (10):** semantic structure, visible focus, 44px targets, announcements, and non-colour status meaning are verified.
- **Technical Frontend Quality (10):** shared primitives, mounted-path behavior, route contracts, error handling, and regression coverage are sound.
- **Performance & Polish (5):** production build, reduced-motion behavior, console hygiene, and final visual refinements are complete.
