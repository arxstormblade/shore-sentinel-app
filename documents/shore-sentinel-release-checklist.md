# Shore Sentinel Release Checklist

Use this checklist for every feature release, bug fix, UI change, or operational update after the app is built.

## 1) Intake and scope
- [ ] Confirm the change request is written down
- [ ] State the problem or feature in one sentence
- [ ] Identify the user impact
- [ ] Classify the change:
  - [ ] Feature
  - [ ] Bug fix
  - [ ] UI / UX change
  - [ ] Backend / API change
  - [ ] Database change
  - [ ] Worker / scanner change
  - [ ] Infra / deployment change
- [ ] Identify the affected area:
  - [ ] Web UI
  - [ ] API
  - [ ] Worker-node
  - [ ] Worker-python
  - [ ] Scanner bundle
  - [ ] Database
  - [ ] MinIO / artifacts
  - [ ] Docs / knowledgebase

## 2) Product and design review
- [ ] Confirm the change matches Shore Sentinel’s scope
- [ ] Verify the change fits the two primary modes:
  - [ ] Add Managed Machine
- [ ] Review UI impact for clarity and restraint
- [ ] Confirm the change does not add unnecessary clutter or motion
- [ ] Confirm navigation and filters remain simple and scoped
- [ ] Update the architecture doc if the design changes

## 3) Kanban and planning
- [ ] Create or update the Kanban task
- [ ] Add acceptance criteria
- [ ] Note any dependencies
- [ ] Note any schema or API contract changes
- [ ] Note any rollout risks
- [ ] Note whether a rollback path is required

## 4) Implementation
- [ ] Create a feature branch
- [ ] Make the smallest correct code change
- [ ] Update related config if needed
- [ ] Update docs if behavior changes
- [ ] Update tests alongside code
- [ ] Keep secrets and credentials out of code and logs

## 5) Validation
- [ ] Run targeted tests for the changed area
- [ ] Run broader app validation if behavior crosses boundaries
- [ ] Verify the real user flow, not just mocks
- [ ] If the database changed, run migrations locally
- [ ] If the API changed, verify request and response shapes
- [ ] If the UI changed, open the affected screen and review the layout
- [ ] If the UI is served through Tailnet or a subpath, verify the final browser URL and confirm CSS/JS assets load correctly
- [ ] If artifacts changed, verify MinIO upload/download flow
- [ ] If scheduling changed, verify at least one live job path

## 5.5) Final QA gate (Athena)
- [ ] Athena or the designated QA reviewer opens the final release URL in a browser
- [ ] Confirm the page is styled and usable, not raw HTML or an unstyled shell
- [ ] Confirm fonts, spacing, colors, and navigation match the intended UI
- [ ] Confirm Tailnet/proxy routes and asset paths work on the final URL
- [ ] Block release if the final browser experience is not correct

## 6) Docker and environment validation
- [ ] Build the app image(s)
- [ ] Start the stack with Docker Compose
- [ ] Confirm all required services are healthy
- [ ] Confirm Postgres is reachable and migrations apply
- [ ] Confirm Redis queue processing works
- [ ] Confirm MinIO bucket access works
- [ ] Confirm the web app loads successfully
- [ ] Confirm worker processes start cleanly

## 7) Security and operational checks
- [ ] Confirm no secrets were added or exposed
- [ ] Confirm authentication and authorization still work
- [ ] Confirm file uploads and artifact downloads are safe
- [ ] Confirm logs do not expose sensitive data
- [ ] Confirm the change does not weaken tenant or asset isolation
- [ ] Confirm the change does not create an unnecessary public surface

## 8) Review and release
- [ ] Get code review
- [ ] Get product/UX review if the UI changed
- [ ] Get database or ops review if infra changed
- [ ] Athena QA signoff is recorded for any UI / route / Tailnet exposure change
- [ ] Bump version if the release is user-visible
- [ ] Update the changelog
- [ ] Update the knowledgebase if operator behavior changed
- [ ] Create the release candidate if needed

## 9) Deploy and verify
- [ ] Deploy to staging or a safe test environment first
- [ ] Re-run the critical workflow in staging
- [ ] Deploy to production only after verification passes
- [ ] Verify the live app after deployment
- [ ] Confirm error logs are clean
- [ ] Confirm core flows still work end to end
- [ ] If the app is exposed through Tailnet, verify the final tailnet URL after deployment and re-open it in a browser

## 10) Rollback readiness
- [ ] Document the rollback path
- [ ] Keep the prior version available
- [ ] Identify the data recovery plan if the change touches storage
- [ ] Know the trigger for immediate rollback

## 11) Closeout
- [ ] Mark the Kanban item complete
- [ ] Add final notes to the release record
- [ ] Update the architecture doc if anything materially changed
- [ ] Update runbooks or knowledgebase entries if needed

## Quick release gate
Before calling a release ready, confirm:
- [ ] Code works
- [ ] Tests pass
- [ ] Docker Compose works
- [ ] Final browser QA passed on the real release URL
- [ ] UI looks correct
- [ ] Data is safe
- [ ] Rollback is known
- [ ] Docs are updated
