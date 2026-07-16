# Compact Operations QA Checklist

Use this checklist for every authenticated compact-operations route. Record evidence for each item; unresolved **Hard blockers** mean the route cannot be approved.

## Hard blockers

- [ ] The route is authenticated and preserves its authorization, mounted-path, and data boundaries.
- [ ] The side navigation remains word-only and usable; the auth layout remains narrow and focused.
- [ ] Primary actions remain functional, authorized, and have a rendered target of at least 44px.
- [ ] Filters have visible labels, retain values, change visible results, provide reset, and work with a keyboard.
- [ ] Native disclosures use `details`/`summary`, visible text labels, and keyboard operation.
- [ ] Empty and error states explain the current condition, announce status, and retain recovery actions where applicable.
- [ ] No horizontal overflow occurs at 1440×1050, 900×1050, or 390×844.
- [ ] There are zero page errors and zero console errors during the scenario.
- [ ] The Production web Docker build passes before final approval.

## Reviewer passes

- [ ] UX designer: hierarchy, density, visual focus, and reading order are fit for frequent operations.
- [ ] Business user: status, ownership, risk, and next action are understandable without implementation knowledge.
- [ ] Commercial SaaS: interaction language, responsive behavior, feedback, and error recovery meet professional-product expectations.
- [ ] Frontend architecture: shared primitives are composed without duplicating route behavior or changing shell/auth contracts.

## Interaction and breakpoint matrix

| Viewport | Primary actions | Filters | Native disclosures | Empty and error states | 44px targets | Mounted-path |
|---|---|---|---|---|---|---|
| 1440×1050 | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] |
| 900×1050 | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] |
| 390×844 | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] |

## Evidence

Attach or link the following Evidence to the route review:

- focused regression output and relevant full-suite output;
- screenshots or recordings at 1440×1050, 900×1050, and 390×844;
- authenticated primary-action, Filters, and Native disclosures interaction results;
- empty/error-state capture, mounted-path request evidence, and browser console result;
- rendered target and horizontal overflow checks;
- Production web Docker build log;
- completed reviewer findings, scorecard, and blocker disposition.
