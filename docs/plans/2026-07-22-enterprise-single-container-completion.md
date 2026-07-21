# Shore Sentinel Enterprise Single-Container Completion Plan

> **For Hermes:** Use subagent-driven-development with TDD, spec review, code-quality review, and release-evidence review. Do not deploy or run external target tests from this plan without the required approval gates.

**Goal:** Convert the approved Shore Sentinel rearchitecture into one buildable, test-first application-container release while preserving the one-time local audit and full app deployment installation paths.

**Architecture:** Docker Compose remains the installation contract, but Option 2 produces exactly one `shore-sentinel` application container. A fixed supervisor starts web, API, PostgreSQL, Redis, MinIO, Node orchestration/managed-SSH worker, and Python parser/normalization worker processes under separate Unix users and environment/filesystem boundaries. One named application-data volume rooted at `/var/lib/shore-sentinel` contains dedicated database, queue, object-storage, and evidence subdirectories. Disposable per-run isolation uses bounded unprivileged OS processes/users/namespaces inside that container; the application container never receives the Docker socket.

**Tech Stack:** Docker Compose v2, a pinned Linux base image, Supervisor, Next.js/React, NestJS/Node.js, PostgreSQL, Redis/BullMQ, MinIO/S3-compatible storage, Python parser worker, SQL migrations, JSON Schema, Python `unittest`, Node tests, npm checks, Graphify, and CI security gates.

---

## Locked decisions and constraints

1. Boss approved this architecture lock and the navigation deviation on 2026-07-22 PHT. This document is an implementation plan, not deployment approval.
2. Option 1 remains the standalone, one-time local scanner audit described in `README.md` and `scanner-bundle/README.md`; reports remain on the client unless explicitly shared.
3. Option 2 remains the managed application deployment, now delivered as exactly one application container with one persistent application-data volume. The current separate `api`, `web`, `worker-node`, `worker-python`, `postgres`, `redis`, `minio`, and `minio-init` delivery is the migration source, not the target release shape.
4. The approved authenticated navigation groups are, in order: `Dashboard`, `AI Assets`, `Audit Reports`, `Knowledgebase`, `System`, `Users`. This is a grouping/label decision, not an authorization waiver.
5. A single container is a delivery boundary, not a claim that every process shares authority. Supervisor entries, Unix users, directory ownership, environment allowlists, loopback bindings, capability drops, read-only paths, and network/host policy preserve least privilege.
6. No application code, migration, image, container startup, external target test, deployment, or release promotion is part of this planning card.
7. No Docker socket, host SSH keys, broad workspace bind mount, unbounded secret, or unverified egress policy may enter the application container.

## Current baseline used by this plan

The live branch is `feat/enterprise-single-container` at the reviewed documentation commit `4dd47b9`. The completion verification refreshed Graphify with `graphify update .`; Graphify `0.9.16` reported 2,061 nodes, 3,115 edges, and 179 communities. The focused query `graphify query "How are the single-container process boundaries, persistent volumes, migrations, and release gates verified?"` returned 160 nodes, including this plan, the machine-readable requirements register, the single-container delivery contract, the required supervised process list, the persistence subdirectories, the deployment hardening tests, and the release scorecard.

The current `docker-compose.yml` is a seven-service application topology with named `postgres-data`, `redis-data`, and `minio-data` volumes. `api/src/schema.ts` is an idempotent inline schema/migration sequence; `api/src/database.service.ts` currently owns schema startup. The current hardening tests prove pinned images, non-root application images, `no-new-privileges`, dropped capabilities, private parser networking, required production secrets, and explicit development override behavior. The current navigation contract is already encoded in `web/lib/data.js`, `web/components/ui.jsx`, `web/components/mobile-navigation.jsx`, and `tests/test_side_navigation_shell.py`.

## Requirement register

| ID | Requirement | Acceptance condition |
|---|---|---|
| SC-001 | Single deployable application container | Production Compose has one application service/image for web, API, database, queue, object storage, and both workers; no production app service depends on a sibling application container. |
| SC-002 | Fixed supervised process graph | PID 1 is the declared supervisor; every required process has a fixed executable, user, readiness check, restart policy, and log destination. |
| SC-003 | Persistent data | One named application-data volume rooted at `/var/lib/shore-sentinel` contains dedicated PostgreSQL, Redis, object-storage, and evidence subdirectories with documented backup/restore commands. |
| SC-004 | Logical least privilege | Processes use distinct users/ownership, minimal environment variables, loopback-only internal bindings, dropped capabilities, `no-new-privileges`, and read-only paths where compatible. |
| SC-005 | Option 1 preserved | Local audit instructions continue to run the scanner locally and do not imply app enrollment or upload. |
| SC-006 | Option 2 preserved | App deployment instructions build/start the single-container release and retain health verification. |
| SC-007 | Approved navigation deviation | Navigation order and labels match Dashboard, AI Assets, Audit Reports, Knowledgebase, System, Users, with subpages retained. |
| SC-008 | Migration discipline | Versioned SQL migrations run once under an advisory lock before application processes; API startup does not mutate schema or recompute seed hashes. |
| SC-009 | Migration compatibility | Upgrade, fresh install, restart, interrupted migration, and rollback/restore tests cover existing data and schema version state. |
| SC-010 | Secret boundaries | Secrets are required in production, never browser/queue/log payloads, and are allowlisted per process. |
| SC-011 | Worker authorization | Node and Python workers use separate workload identities and authenticated API paths; Python cannot reach managed-target egress. |
| SC-012 | Independent egress | Host/network policy or authenticated proxy enforces default deny; application CIDR validation is not presented as live firewall proof. |
| SC-013 | In-container sandbox isolation | Disposable AI test bundles run in bounded unprivileged OS process/user/namespace sandboxes inside the one application container; no second runner host/container or Docker socket is part of the release baseline. |
| SC-014 | SSH controls retained | Host-key pinning, approved scope, non-root remote runner, fixed ForceCommand, bounded cancellation, and one-time grants remain required. |
| SC-015 | Evidence integrity | Artifacts include hashes, provenance, policy decision, image/bundle identity, parser version, retention state, and append-only audit linkage. |
| SC-016 | Health truth | Health reports process/dependency state and fails closed; it never returns unconditional green status. |
| SC-017 | Safe updates | Update path validates clean/approved source, backs up persistent data, runs migrations once, records image/config identity, and supports rollback. |
| SC-018 | Build reproducibility | Runtime images and OS/package inputs are pinned; the root lockfile is used; SBOM and image digest are retained. |
| SC-019 | Navigation accessibility | Desktop side rail and mobile drawer preserve labels, keyboard focus, skip link, visible focus, reduced motion, and WCAG 2.2 AA evidence. |
| SC-020 | Test completeness | Unit, contract, structural, Compose, migration, security-negative, browser, backup/restore, and rollback tests are named and executable. |
| SC-021 | Observability | Supervisor, API, worker, migration, and storage events are structured, redacted, timestamped, and exportable for release review. |
| SC-022 | No hidden waiver | Any unmet control is recorded with owner, scope, expiry, compensating control, and approver before a candidate can score. |
| SC-023 | 95+ release gate | Candidate-specific evidence scores at least 95/100 and meets every category threshold and mandatory gate. |
| SC-024 | Reversible change | The prior multi-service image/config and volume backups remain usable until the single-container candidate passes staged rollback. |

## Dependency order and implementation tasks

### Task 1: Freeze contracts and write failing release guards

**Depends on:** none.

**Files:**
- Create: `tests/test_single_container_release_gate.py`
- Create: `tests/test_container_supervision_contract.py`
- Create: `tests/test_single_container_persistence_contract.py`
- Modify: `tests/test_production_compose_release_gate.py`
- Modify: `tests/test_deployment_hardening.py`
- Modify: `tests/test_side_navigation_shell.py` only if the approved labels need a stronger exact-order assertion
- Create: `docs/qa/2026-07-22-enterprise-single-container-requirements.json`

**TDD steps:**

1. Write failing structural tests that require exactly one production application service/container, the supervisor manifest, seven required process names, one named volume rooted at `/var/lib/shore-sentinel` with four required subdirectories, no Docker socket/host SSH bind, production secret requirements, and an explicit development override.
2. Write failing migration tests for version order, advisory locking, no schema mutation in API startup, interruption recovery, and compatibility with the current `api/src/schema.ts` table/enum contracts.
3. Write failing negative tests for process environment leakage, parser-to-egress reachability, missing host-key pin, traversal input, forged egress source, and unconditional health success.
4. Write failing traceability validation that every `SC-*` requirement has source, implementation files, test files, command, and retained-evidence fields.
5. Run `python3 -m unittest tests.test_single_container_release_gate tests.test_container_supervision_contract tests.test_single_container_persistence_contract`; expected result is failure because the target container and traceability files do not exist.
6. Keep these tests check-only: they must inspect files/config and disposable test doubles; they must not call `docker compose up`, connect to a customer target, or change a firewall.

**Exit evidence:** Red tests identify every target contract before implementation starts; traceability JSON validates as JSON and has no unowned requirement.

### Task 2: Build the single-container image and supervisor process graph

**Depends on:** Task 1.

**Files:**
- Create: `container/Dockerfile`
- Create: `container/supervisord.conf`
- Create: `container/entrypoint.sh`
- Create: `container/healthcheck.sh`
- Create: `container/process-environment-contract.json`
- Modify: `api/Dockerfile`, `web/Dockerfile`, `workers/worker-node/Dockerfile`, `workers/worker-python/Dockerfile` only to retain reusable build stages or retire them explicitly
- Modify: `tests/test_container_supervision_contract.py`

**TDD steps:**

1. Add assertions for a pinned base image, non-root process users (`shore-web`, `shore-api`, `shore-worker`, `shore-parser`, plus the database/queue/object-storage users), fixed executable paths, `stopasgroup=true`, `killasgroup=true`, bounded restart behavior, and separate stdout/stderr logs.
2. Add assertions that `container/entrypoint.sh` performs preflight and invokes the migration command before `exec`-ing Supervisor, and that `container/healthcheck.sh` checks every required process and dependency.
3. Add assertions that the environment contract gives browser-facing web values only to web, database credentials only to API/migration/database, worker identity only to the required worker/API paths, and no raw target secret to web or queue payloads.
4. Implement the multi-stage image with pinned Node/Python/PostgreSQL/Redis/MinIO/Supervisor inputs, copy only production artifacts, create process users/directories, and set `no-new-privileges`/capability restrictions in the runtime configuration.
5. Implement the supervisor graph with explicit dependency order: PostgreSQL and Redis, MinIO, migration command, API, Python worker, Node worker, and web. A failed prerequisite must keep dependent processes stopped or unhealthy.
6. Run `docker build --file container/Dockerfile --tag shore-sentinel-single:test .` and `docker image inspect shore-sentinel-single:test`; expected result is a successful build with the declared non-root runtime and no host socket in the image.
7. Run the supervision contract tests and `git diff --check`.

**Exit evidence:** Image digest, SBOM, process manifest, build log, and red/green contract-test output are retained under the candidate evidence directory; no image is pushed in this task.

### Task 3: Replace production Compose delivery with one application service

**Depends on:** Task 2.

**Files:**
- Modify: `docker-compose.yml`
- Modify: `docker-compose.dev.yml`
- Modify: `.env.example`
- Modify: `scripts/compose_smoke.py`
- Modify: `README.md`
- Modify: `tests/test_production_compose_release_gate.py`
- Modify: `tests/test_deployment_hardening.py`
- Modify: `.github/workflows/quality-security.yml`

**TDD steps:**

1. Extend structural tests to require exactly one service/container `shore-sentinel`, one image build, one named volume rooted at `/var/lib/shore-sentinel`, published UI/API health endpoints only, explicit healthcheck, resource limits, and no `postgres`, `redis`, `minio`, `worker-node`, or `worker-python` production service blocks.
2. Extend tests to require the production Compose file to fail without operator secrets, while the development override remains explicit and never becomes the production default.
3. Implement the single service and one volume mount. Bind internal process ports to loopback; publish only the documented host ports. Keep `docker-compose.previous.yml` as the rollback source and document its relation in the plan/runbook rather than composing it into production.
4. Update the smoke helper to validate the production file with an ephemeral env file and validate the explicit development override without starting services. It must continue to skip cleanly when Docker socket access is unavailable.
5. Update README Option 2 service/health/update/stop instructions to describe one application container, one named application-data volume rooted at `/var/lib/shore-sentinel`, the migration step, and the unchanged Option 1 local-audit path. State that `docker compose down -v` deletes data and is not a routine update command.
6. Update CI to build one application image without `up`, validate missing-secret failure, run tests/checks, audit production dependencies, and retain redacted logs.
7. Run `npm run compose:smoke`, `python3 -m unittest tests.test_production_compose_release_gate tests.test_deployment_hardening`, and `git diff --check`.

**Exit evidence:** `docker compose config --quiet` output for production with ephemeral input, development override output, service/volume contract test output, and updated installation text.

### Task 4: Introduce ordered, one-shot SQL migrations

**Depends on:** Task 1; Task 3 may consume the migration command after the contract is stable.

**Files:**
- Create: `api/migrations/0001_baseline.sql`
- Create: `api/migrations/0002_enterprise_authorization.sql`
- Create: `api/migrations/0003_evidence-findings-read-model.sql`
- Create: `api/migrations/0004_single-container-runtime.sql`
- Create: `api/src/migration-runner.ts`
- Modify: `api/src/database.service.ts`
- Modify: `api/src/schema.ts` to become a compatibility export or remove it only after all consumers use migration files
- Create: `api/test/migration-runner.test.ts`
- Modify: `api/test/migration-and-production-secrets.test.ts`
- Modify: `api/test/validation.test.ts`
- Modify: `container/entrypoint.sh`

**Migration contents:**

- `0001_baseline.sql` preserves the current enum, table, check constraint, index, artifact, outbox, cancellation, SSH grant, and target-scope contracts currently represented by `api/src/schema.ts`. It creates `schema_migrations` and records its own checksum.
- `0002_enterprise_authorization.sql` adds engagement scope, owner authorization, approval chain, revocation/expiry, policy bundle version/hash/signer, workload identity, and transaction-scoped tenant context. It adds constraints that an execution grant cannot outlive its engagement or policy decision.
- `0003_evidence-findings-read-model.sql` adds append-only/hash-chained audit events, provenance manifest metadata, normalized finding instances, remediation/verification state, retention/legal-hold fields, and indexes justified by query plans.
- `0004_single-container-runtime.sql` adds migration/runtime identity, supervisor process health samples, readiness/degraded state, and deployment evidence references without storing secrets or raw logs in the database.

**TDD steps:**

1. Write a failing test that discovers migrations in lexical order, rejects duplicate versions, checks SHA-256 checksums, and acquires a PostgreSQL advisory lock before applying any migration.
2. Write a failing test that a second runner waits/fails safely on the same lock, a failed migration leaves no version row, and a rerun applies the same migration exactly once.
3. Write a failing test that API startup invokes no DDL and no seed-password recomputation; only `shore-sentinel migrate`/the entrypoint migration phase may apply SQL.
4. Implement the runner using a transaction per migration, a durable version/checksum row, lock timeout, structured redacted events, and a non-zero exit on checksum drift.
5. Implement the migration command in the image entrypoint before Supervisor. Make migrations backward-compatible with the previous release for the rollback window; destructive/drop operations require a later approved migration and backup.
6. Run `npm --workspace @shore-sentinel/api test -- migration-runner` plus the existing schema tests. If no disposable PostgreSQL is available, run parser/SQL-shape tests only and record that live migration evidence is a staging gate, not a pass.

**Exit evidence:** Migration list and checksums, fresh-database run, upgrade-database run, interrupted-run recovery, lock contention, and rollback compatibility results.

### Task 5: Preserve logical least privilege and worker/data boundaries

**Depends on:** Tasks 2 and 4.

**Files:**
- Modify: `api/src/config.ts`
- Modify: `api/src/database.service.ts`
- Modify: `api/src/internal-worker-route.ts`
- Modify: `api/src/request-principal.ts`
- Modify: `api/src/ssh-security.ts`
- Modify: `api/src/artifact.service.ts`
- Modify: `workers/worker-node/src/config.js`
- Modify: `workers/worker-node/src/apiClient.js`
- Modify: `workers/worker-node/src/sshExecutor.js`
- Modify: `workers/worker-node/src/managedSshProcessor.js`
- Modify: `workers/worker-python/src/server.py`
- Modify: `workers/worker-python/src/parser.py`
- Create: `container/run-sandbox.sh`
- Create: `container/sandbox-policy.json`
- Modify: `api/test/internal-worker-route.test.ts`
- Modify: `api/test/worker-ssh-grant.test.ts`
- Modify: `api/test/ssh-security.test.ts`
- Modify: `api/test/artifact-cleanup.test.ts`
- Modify: `workers/worker-node/test/config.test.js`
- Modify: `workers/worker-node/test/sshExecutor.test.js`
- Modify: `workers/worker-python/test/test_server.py`

**TDD steps:**

1. Add failing tests proving the browser cannot obtain worker credentials, SSH credentials, grant payloads, MinIO root credentials, or parser internals.
2. Add failing tests proving every SSH execution requires tenant/run/grant/attempt/expiry/host-key/scope checks and that cancellation remains terminal under queue/worker races.
3. Add failing tests proving parser input/output limits, redaction/quarantine, artifact hash verification, and no direct target egress from Python.
4. Add failing sandbox tests proving every disposable per-run process uses a dedicated unprivileged user/namespace, a fixed allowlisted executable, a bounded temporary directory under `/var/lib/shore-sentinel`, `network: none` by default, resource limits, and a terminal timeout/cleanup path.
5. Implement separate process environment contracts and authenticated internal API routes. Keep long-lived secrets in the secret boundary; deliver only one-time attempt-bound references to the approved adapter.
6. Implement `container/run-sandbox.sh` and `container/sandbox-policy.json` as a checkable local process boundary; they must not invoke Docker or accept caller-supplied commands outside the signed/allowlisted bundle contract.
7. Run the focused Node, Python, API, and sandbox tests, then `npm run test`.

**Exit evidence:** Test output for positive and negative worker paths, redacted process environment inventory, and artifact provenance samples with no secret material.

### Task 6: Enforce host/network egress and in-container sandbox policy

**Depends on:** Task 5.

**Files:**
- Modify: `docs/security/worker-node-egress-acl-contract.md`
- Modify: `infra/egress-acl/server-authoritative-policy.example.json`
- Modify: `scripts/check_worker_node_egress_policy.py`
- Create: `infra/egress-acl/single-container-host-policy.example.nft`
- Create: `docs/security/single-container-egress-deployment.md`
- Modify: `infra/ssh-fixture/fixture-contract.json` only to identify the single-container adapter boundary
- Modify: `tests/test_infrastructure_release_evidence.py`
- Create: `tests/test_single_container_egress_contract.py`

**TDD steps:**

1. Add failing check-only tests requiring default deny, authenticated proxy/TCP gateway, explicit destination/port/time-window authorization, no caller-supplied CIDR authority, and an explicit statement that JSON validation is not live firewall proof.
2. Add failing tests proving the Python parser has no egress capability and that the Node worker is the only managed-SSH process path.
3. Implement the host policy example and deployment guide as non-applying reference artifacts. Applying nftables/iptables or changing a live host remains an approved operations action outside this plan.
4. Cross-reference the in-container sandbox policy from Task 5 and define host-level default-deny/evidence requirements for the one application container. No runner broker, second container, or second Docker host is included in this release baseline.
5. Run the check-only egress and infrastructure tests; do not run external SSH from the developer shell.

**Exit evidence:** Check-only policy output, host-policy review, external approved fixture command log, and negative destination/port evidence. A schema-only result must be marked `UNVERIFIED LOCAL SCHEMA INPUT`.

### Task 7: Complete navigation, documentation, and update/rollback runbooks

**Depends on:** Tasks 3 and 4.

**Files:**
- Modify: `web/lib/data.js`
- Modify: `web/components/ui.jsx`
- Modify: `web/components/mobile-navigation.jsx`
- Modify: `web/app/globals.css`
- Modify: `tests/test_side_navigation_shell.py`
- Modify: `README.md`
- Create: `docs/runbooks/single-container-update-and-rollback.md`
- Create: `docs/runbooks/single-container-backup-restore.md`
- Modify: `docs/qa/2026-07-20-v1.1.0-release-scorecard.md` only if the single-container evidence fields need a precise cross-reference

**TDD steps:**

1. Add failing tests for exact navigation group order, mobile drawer behavior, skip link/focus/reduced motion, and no orphaned route labels.
2. Implement only the approved navigation grouping; preserve existing route authorization and contextual links for engagements, policy, evidence, search, and comparison.
3. Add a runbook with preflight, backup, image/config identity, migration, health, log review, rollback trigger, prior-image restart, volume restore, and post-rollback verification commands. Use `docker compose down` without `-v` for routine rollback; never delete volumes as a rollback step.
4. Add a backup/restore runbook covering `pg_dump`, Redis persistence, MinIO/object-storage versioning/Object Lock, evidence hash inventory, restore order, and owner/approval records.
5. Run navigation tests and `python3 -m unittest discover -s tests`.

**Exit evidence:** Authenticated browser evidence at 1440×1050, 900×1050, and 390×844; reviewed update/rollback and backup/restore runbooks; no unrecorded waiver.

### Task 8: Staged integration, review, and release proof

**Depends on:** Tasks 1–7.

**Files:**
- Modify: `.github/workflows/quality-security.yml`
- Modify: `docs/qa/2026-07-22-enterprise-single-container-requirements.json`
- Create: `docs/qa/2026-07-22-enterprise-single-container-evidence-index.json`
- Create: `docs/qa/2026-07-22-enterprise-single-container-scorecard.md`

**Execution order:**

1. Run `npm ci`.
2. Run `python3 -m unittest discover -s tests`.
3. Run `npm run test`.
4. Run `npm run check`.
5. Create a `umask 077` file at `$RUNNER_TEMP/shore-sentinel-compose-ci.env` containing generated values, then run `npm run compose:smoke` and `docker compose --env-file "$RUNNER_TEMP/shore-sentinel-compose-ci.env" config --quiet`; never commit or print the file.
6. Build the pinned image, record `docker image inspect` digest, and generate an SBOM. Do not push the image until approval.
7. In isolated staging, start the single container, capture supervisor/API/web/DB/Redis/MinIO/worker health, exercise authenticated machine enrollment and report retrieval with synthetic data, and inspect redacted logs.
8. Run fresh/upgrade migration tests, backup/restore, failure injection, restart, queue recovery, and rollback rehearsal against the exact image/config identity.
9. Execute the approved external SSH/egress fixture only under the recorded operations approval. Retain host-key mismatch, invalid path, unauthorized destination, cancellation, and cleanup evidence.
10. Run browser QA at all three required viewports and record console/page/overflow/accessibility results.
11. Fill the evidence index and scorecard with immutable paths/IDs, reviewer, timestamp, candidate commit, image digest, and result. A missing field is a gate failure, not an empty or provisional value.
12. Run `git diff --check`, inspect `git diff --stat` and the full diff, request independent spec/security/code-quality review, and commit only the reviewed documentation/configuration/code set. Do not push or deploy from this plan.

## Migration and data-safety contract

- The previous multi-service Compose release and `docker-compose.previous.yml` remain the rollback reference until the single-container release passes staging rollback.
- Before an upgrade, capture the candidate commit, image digest, Compose revision, one-volume identity, `pg_dump --format=custom`, PostgreSQL schema version, Redis persistence state, object-storage version/object-lock state, and SHA-256 inventory of retained evidence.
- Apply migrations before starting dependent processes, under a PostgreSQL advisory lock. A migration checksum mismatch is a hard stop.
- Keep additive schema changes backward-compatible for the rollback window. If a later migration cannot be backward-compatible, require a complete database/object backup and restore to the prior image; never claim a binary rollback alone is safe.
- Rollback trigger examples are failed readiness for any required process, data-integrity/hash mismatch, unauthorized egress, secret-boundary failure, failed critical flow, or unresolved Critical/High finding.
- Rollback restores the prior image/config, restarts without deleting volumes, verifies prior health and critical flow, and restores the database/object data only when the recorded backup/restore test requires it.

## Threat-control matrix

| Threat | Control in this plan | Negative proof |
|---|---|---|
| T-01 Process compromise reaches all services | Separate users, fixed supervisor commands, read-only paths, capability drop, no-new-privileges, resource limits | Attempted unauthorized executable/env/path in supervision contract fails |
| T-02 Browser or queue leaks secrets | Per-process env allowlist, one-time adapter delivery, redacted logs, API-only credential references | Browser/queue payload tests assert no secret/token fields |
| T-03 Parser reaches targets or worker egress | Parser loopback/internal path only; Node worker is sole managed-SSH process | Parser egress and network policy negative tests |
| T-04 Application bypasses egress | Host default-deny plus authenticated proxy/TCP gateway; signed/server-authoritative policy | Unauthorized destination/port fixture fails; schema-only input is unverified |
| T-05 SSH command injection or scope escape | Fixed ForceCommand, sudoers regex, host-key pin, root/path/CIDR validation, bounded cancellation | Existing SSH fixture tests plus invalid command/path/host-key/cancel cases |
| T-06 Database corruption during startup | One-shot ordered migrations, advisory lock, checksums, transaction per migration | Concurrent, interrupted, checksum-drift, and restart tests |
| T-07 Evidence tampering or loss | Hashes, provenance, append-only events, retention/legal hold, one application-data volume, backups | Hash mismatch, restore, and evidence-chain tests |
| T-08 False health/availability claim | Supervisor readiness and dependency health, degraded state, redacted structured events | Kill/restart/dependency-failure tests must report non-ready |
| T-09 Unsafe update or rollback | Clean-source preflight, immutable image/config identity, backup, compatible migrations, prior image | Staged rollback rehearsal and post-rollback critical flow |
| T-10 UI hides approval/security state | Approved label grouping without authorization changes; accessible error/degraded/denied states | Browser route matrix, keyboard/focus, console, overflow, and negative API tests |

## Test command catalog

| Scope | Command | Pass condition |
|---|---|---|
| Markdown/structure | `python3 -m unittest discover -s tests` | All repository structural/release tests pass; no missing required artifact |
| Node/Python/API | `npm run test` | Worker, API, and web tests pass |
| Static quality | `npm run check` | Phase 0, scanner, Compose smoke, worker/API/web checks pass |
| Compose model | `npm run compose:smoke` | Explicit config validation passes or reports the documented Docker-socket skip |
| Image | `docker build --file container/Dockerfile --tag shore-sentinel-single:test .` | Build succeeds with pinned inputs and no deployment |
| Diff hygiene | `git diff --check` | No whitespace errors |
| Graphify | `npm run graphify:refresh` then `graphify query "How are the single-container process boundaries, persistent volumes, migrations, and release gates verified?"` | Graph metadata source HEAD equals the reviewed commit and query returns the target contract files |
| Staging | `docker compose --env-file "$RUNNER_TEMP/shore-sentinel-compose-ci.env" up -d` | Only after approval; all required processes/dependencies become healthy |
| Rollback | `docs/runbooks/single-container-update-and-rollback.md` command sequence | Prior image/config returns healthy without accidental volume deletion |

## 95+ evidence matrix

A candidate must score at least 95/100 and meet every threshold below. Evidence is candidate-specific: each record includes commit SHA, image digest, environment, command, UTC/PHT timestamp, reviewer, and retained redacted output path.

| Category | Points | Required threshold | Evidence required |
|---|---:|---:|---|
| Functionality | 20 | 19 | Authenticated dashboard, AI asset/machine enrollment, scan lifecycle, report/artifact retrieval, remediation, users, knowledgebase, and both installation options; API/worker/web tests green |
| Material 3 UX and accessibility | 15 | 14 | Navigation order, desktop rail/mobile drawer, keyboard/focus/skip-link, reduced motion, WCAG 2.2 AA, and three-viewport browser evidence with zero blocker/page/console/overflow failures |
| Security, identity, policy, tenancy | 25 | 24 | Secret scan/audit, process env boundaries, worker authorization, SSH negative matrix, egress-denial proof, engagement/approval expiry/revocation, evidence integrity, and zero unresolved Critical/High findings |
| Modern architecture and maintainability | 10 | 9 | One-service Compose contract, supervisor manifest, migration inventory/checksums, module/file ownership, Graphify freshness, SBOM, pinned image inputs, and review records |
| Performance and reliability | 15 | 14 | Process restart/dependency-failure behavior, queue/outbox recovery, migration lock test, resource-limit evidence, load/latency results tied to image digest, backup/restore, and rollback rehearsal |
| Efficiency and operability | 15 | 14 | Single-image build time/size record, volume capacity/retention review, structured redacted logs, health/SLO dashboard, update runbook, operator install validation, and evidence-index completeness |
| **Total** | **100** | **95** | All mandatory gates pass; no unrecorded waiver |

Mandatory gates are zero unresolved Critical/High findings; 100% pass of authorization/expiry/revocation, workload identity, egress denial, evidence integrity, accessibility, backup/restore, and rollback controls; authenticated browser and API/worker negative tests; load/recovery evidence tied to the exact commit/image digest; and retained approval/release artifacts.

## Rollback and review boundary

The prior verified multi-service commit/config and all volume backups remain available until staged rollback passes. Boss authorizes repository pushes, review, and release actions needed for the completion flow, but this plan does not authorize deployment to an unnamed external production host or destructive operations on non-disposable data. Credential changes, live firewall application, and external target tests remain separately controlled operations even when local/disposable equivalents are authorized. After implementation, an independent reviewer must inspect the full diff, the security evidence, migration compatibility, and the scorecard before the branch is promoted.
