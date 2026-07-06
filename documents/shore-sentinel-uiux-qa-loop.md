# Shore Sentinel UI/UX QA Loop

> **Purpose:** Reusable Hermes prompt and checklist for iterative UI/UX QA on Shore Sentinel.

**Target product:** Shore Sentinel

**UI standard:**
- dark SaaS dashboard default
- glassmorphism panels
- subtle neon accents
- layered cards
- soft shadows
- faint grid texture
- premium, high-contrast typography
- polished, dense, operational presentation
- desktop-first with graceful tablet scaling

---

## 1) Copy/paste Hermes prompt

Use this prompt when you want Hermes to loop UI/UX QA on the live Shore Sentinel app:

```text
You are doing iterative UI/UX QA for Shore Sentinel.

Goal:
Find only real, reproducible UI/UX issues in the live app, fix them, and re-verify until the screen passes the Shore Sentinel UX standard.

Reference standard:
- dark SaaS dashboard default
- glassmorphism panels
- subtle neon accents
- layered cards
- soft shadows
- faint grid texture
- premium, high-contrast typography
- polished, dense, operational presentation
- desktop-first layout with graceful tablet scaling

QA loop:
1. Open the target screen in the live app.
2. Inspect layout, hierarchy, spacing, typography, contrast, states, and interaction clarity.
3. Compare against the Shore Sentinel UI standard.
4. Report only issues that are visible, reproducible, and actionable.
5. For each issue, include:
   - screen / route
   - exact problem
   - severity: low / medium / high
   - why it matters
   - the smallest fix
   - what to recheck after the fix
6. After fixes are applied, re-open the same screen and verify the original issue is gone.
7. Then do a small regression sweep on the neighboring screens.
8. Repeat the loop until no new UI/UX issues are found.

Important rules:
- Do not guess.
- Do not report style preferences as bugs unless they break clarity or usability.
- Do not stop after one screen if the adjacent screens are likely affected.
- Prefer concrete evidence over vague feedback.
- Keep the report concise and structured.

Return output in this format:

# QA Summary
- Pass/Fail status
- Screens reviewed
- Issues found

# Issues
1. Screen:
   Severity:
   Problem:
   Evidence:
   Fix:
   Recheck:

# Retest Plan
- What should be checked after the fix
- Which nearby screens should be revisited
```

---

## 2) QA checklist

Use this checklist for every loop cycle.

### App-level checks
- [ ] App shell loads cleanly
- [ ] Navigation is obvious and consistent
- [ ] Dark palette feels intentional, not washed out
- [ ] Primary actions stand out clearly
- [ ] Empty states explain what to do next
- [ ] Loading states are present and not jarring
- [ ] Error states are readable and actionable
- [ ] Text contrast is comfortable
- [ ] Cards and panels have clear separation
- [ ] No visual clutter in operational views

### Screen-level checks
- [ ] Dashboard hierarchy makes sense at a glance
- [ ] One-time audit flow is easy to start and finish
- [ ] Managed machine flow is easy to understand
- [ ] Reports list is scannable
- [ ] Report detail emphasizes findings and remediation
- [ ] Knowledgebase content is discoverable
- [ ] Contextual help links point to the right articles
- [ ] Buttons have clear labels and states
- [ ] Tables are readable without effort
- [ ] Forms have enough spacing and clear validation

### Interaction checks
- [ ] Hover states are visible and useful
- [ ] Disabled states look disabled
- [ ] Destructive actions are unmistakable
- [ ] Success states confirm the action
- [ ] Error messages explain the next step
- [ ] Focus states are visible for keyboard use
- [ ] Long content wraps cleanly
- [ ] Mobile/tablet fallbacks do not break layout

### Regression sweep after fixes
- [ ] Re-open the fixed screen
- [ ] Confirm the issue is actually gone
- [ ] Check adjacent screens for regressions
- [ ] Verify the shell/nav still looks consistent
- [ ] Verify empty/loading/error states still work
- [ ] Re-run the checklist on any affected flow

---

## 3) Issue log template

Use this table while looping:

| Screen | Severity | Issue | Evidence | Fix status | Retest needed |
|---|---|---|---|---|---|
| Dashboard | medium | CTA hierarchy is weak | screenshot / note | pending | yes |
| Reports | high | Empty state does not explain next step | screenshot / note | fixed | yes |

---

## 4) Loop discipline

### Observe
- Inspect one screen at a time.
- Compare it against the UX standard.
- Record only concrete issues.

### Fix
- Make the smallest viable change.
- Avoid unrelated refactors.
- Keep the UI aligned with the dashboard style.

### Verify
- Re-open the exact screen.
- Confirm the issue is resolved.
- Check nearby screens.

### Continue
- Move to the next flow.
- Repeat until the app feels coherent across the full journey.

---

## 5) Suggested review order

1. App shell / home dashboard
2. One-time audit flow
3. Managed machine flow
4. Reports list
5. Report detail
6. Remediation guidance
7. Knowledgebase / how-to articles
8. Empty states
9. Loading states
10. Error states

---

## 6) Acceptance bar

Shore Sentinel passes a UI/UX QA loop when:
- the main screens feel consistent and polished
- primary actions are obvious
- empty/loading/error states are helpful
- reports are easy to scan
- remediation is easy to understand
- no screen feels visually unfinished or ambiguous

---

## 7) Short prompt version

If you want a shorter version for quick runs:

```text
Loop UI/UX QA on Shore Sentinel. Inspect each screen against the dark SaaS dashboard standard, report only reproducible issues, include severity/evidence/fix/retest notes, and keep iterating until the reviewed flow is clean.
```
