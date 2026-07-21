# Shore Sentinel Enterprise AI Security Modernization — Design

**Status:** Approved architecture lock for the single-container release — implementation is authorized under the approval record; unnamed external production deployment and destructive non-disposable operations remain excluded.

**Approval record:** Boss approved this architecture lock and the navigation deviation recorded in §8.2 on 2026-07-22 PHT. Boss also authorizes the implementation phases, dependency installs, local container builds/runs, disposable/local migrations, commits, pushes, review, and release actions needed to finish this repository. Deployment to an unnamed external production host and destructive operations on non-disposable data remain out of scope.

**Owner decisions**

- Deploy first as a self-hosted, single-tenant enterprise product with an explicit future multi-tenant path.
- Retain Docker as the runtime and deployment model. Kubernetes is not part of this design.
- Support LLM/RAG applications, agentic systems and MCP/tool servers, plus traditional ML models and ML pipelines.
- Preserve the proven managed-SSH scanner controls as a legacy execution adapter; do not treat them as the enterprise AI-security platform itself.

## 1. Executive direction

Shore Sentinel will become an evidence-first control plane for **authorized security testing of AI systems**. It will not run a test merely because an operator has a role. Every test must be tied to an active engagement, asset-owner authorization, scoped policy decision, bounded execution plan, and immutable evidence record.

The migration uses a controlled-strangler approach:

1. Retain the current safe execution primitives where they remain applicable: host-key pinning, CIDR/root restrictions, short-lived grants, bounded cancellation, artifact hashing, and private object storage.
2. Introduce enterprise control-plane capabilities around them: identity, approval, policy, audit, evidence, and query-shaped read models.
3. Execute AI tests in bounded, unprivileged OS-process/user/namespace sandboxes inside the application container.
4. Migrate the existing SSH scanner into the new execution contract instead of expanding the current controller monolith.

A full rewrite is rejected because it would discard meaningful safety work and delay feature parity. Incremental hardening alone is rejected because it cannot add enforceable engagement authorization, independent egress, or AI-specific execution safety quickly enough.

## 2. Current-state findings that define the design

The existing application is a coherent Docker Compose control plane:

```text
Next.js web → NestJS API → PostgreSQL / Redis / MinIO
                          ↓
                Node SSH worker → isolated Python parser
```

It has strong managed-SSH safeguards, bounded artifact handling, durable outbox recovery, private MinIO initialization, and a useful managed-machine/evidence UI. It is not yet an enterprise AI-security testing system because it lacks:

- immutable engagement and asset-owner authorization bound to execution;
- independently enforced default-deny egress;
- durable enterprise identity, MFA, step-up, and workload identity;
- tamper-evident audit/evidence retention;
- AI asset inventory, AI test policy, sandboxed runners, DLP, and test provenance;
- scalable query APIs, materialized findings ingestion, and performance evidence;
- complete enterprise workflows for saved views, report comparison, risk acceptance, verification, scheduling, and alerting.

## 3. Target product boundaries

### 3.1 Supported AI asset classes

| Asset class | Examples | Initial test categories |
|---|---|---|
| LLM/RAG application | chat applications, retrieval services, prompt gateways | prompt injection, data exposure, retrieval isolation, output handling, authorization bypass |
| Agentic application | autonomous workflows, tool-using assistants | tool abuse, goal drift, unsafe delegation, identity propagation, secret exposure |
| MCP/tool server | MCP servers, plugin tools, API connectors | capability overreach, confused deputy, SSRF/egress, schema validation, supply-chain trust |
| ML model service | inference endpoints, feature APIs | endpoint authz, model extraction exposure, poisoning indicators, model artifact provenance |
| ML pipeline | training, evaluation, registry, deployment CI/CD | data provenance, artifact signing, dependency risk, model registry controls, promotion policy |
| Legacy managed host | enrolled machine using existing scanner | posture, inventory, packaged scanner evidence |

### 3.2 Explicit non-goals for the first enterprise release

- Unbounded autonomous exploitation.
- Testing third-party assets without recorded owner authorization.
- Production destructive testing without a separately approved test plan and dual control.
- Direct control-plane Docker socket access.
- Multi-tenant SaaS operation before a dedicated tenant-isolation design and proof are approved.

### 3.3 Add-machine function and SSH connection methods

Adding a managed machine is a first-class, approval-gated function under **AI assets**. The operator must select exactly one connection method; the system must never silently fall back from one method to the other.

```text
Add machine
  → machine identity and owner
  → connection method selection
      ├── Option 1: Authentication method
      └── Option 2: SSH key
  → host-key verification and target scope
  → read-only connection test
  → owner/policy approval
  → managed-machine enrollment
```

#### Option 1 — Authentication method

Use a credential-based SSH authentication method selected by policy. The initial supported variants are password or keyboard-interactive authentication; the UI must label the selected variant explicitly.

Features:

- SSH username, hostname/IP, port, and selected authentication variant;
- credential entry or secret reference handled through the enterprise secret service;
- no raw password in PostgreSQL, browser logs, queue payloads, or normal application logs;
- one-time, attempt-bound secret delivery to the approved SSH adapter;
- explicit connection-test result without running a scanner;
- host-key fingerprint display and pinning before enrollment;
- no automatic fallback to an SSH key if authentication fails.

#### Option 2 — SSH key

Use a private-key credential held by the enterprise secret service. The preferred key type is Ed25519; other key types require an explicit policy allowance.

Features:

- SSH username, hostname/IP, port, private-key secret reference, and optional passphrase reference;
- immediate sealing of an uploaded or pasted key into the secret service; the application database stores only a reference and metadata;
- key algorithm, fingerprint, creation source, rotation state, and expiry metadata;
- one-time, attempt-bound key delivery to the approved SSH adapter;
- explicit connection-test result without running a scanner;
- host-key fingerprint display and pinning before enrollment;
- no automatic fallback to password or keyboard-interactive authentication.

#### Shared enrollment controls

Both methods produce the same canonical managed-machine connection profile and must enforce:

- non-root account and least-privilege remote-runner requirements;
- host-key pinning, approved CIDR/hostname scope, SSH port policy, and scanner root-directory scope;
- environment, owner/team, asset classification, data classification, and engagement association;
- credential/secret reference, connection method, and policy decision recorded as metadata, never as raw secret material;
- read-only handshake test before enrollment and bounded scanner execution only after approval;
- audit events for method selection, secret access, host-key approval, test result, enrollment, rotation, revocation, and removal;
- fail-closed behavior for expired, revoked, out-of-scope, or unapproved connection profiles.

The connection method is shown as a masked, auditable attribute on the machine detail page. Changing the method requires re-verification and the same approval controls as initial enrollment.

## 4. Docker-first target architecture

Docker Compose remains the deployment contract, and the enterprise application release is exactly one deployable Shore Sentinel container. The container is a supervised process boundary, not a claim that the processes share privileges: web, API, PostgreSQL, Redis, MinIO/object storage, Node orchestration/managed-SSH worker, and Python parser/normalization worker run as distinct supervised processes with separate Unix users, filesystem ownership, environment allowlists, and loopback/network permissions. Exactly one named application-data volume is mounted at `/var/lib/shore-sentinel`; its internal subdirectories are `/var/lib/shore-sentinel/postgres`, `/var/lib/shore-sentinel/redis`, `/var/lib/shore-sentinel/object-storage`, and `/var/lib/shore-sentinel/evidence`.

```text
Operator browser
  │ TLS / OIDC at the approved ingress boundary
  ▼
Single Shore Sentinel application container
  ├── supervisor (PID 1; fixed process graph and restart policy)
  ├── web process (published UI port)
  ├── API process (loopback API port; web proxy is the normal browser path)
  ├── PostgreSQL process → /var/lib/shore-sentinel/postgres
  ├── Redis process → /var/lib/shore-sentinel/redis
  ├── MinIO process → /var/lib/shore-sentinel/object-storage
  ├── Node orchestration/managed-SSH worker process
  └── Python parser/normalization worker process

Host/network integration boundary
  ├── default-deny container egress policy
  └── authenticated egress proxy or approved TCP gateway

Approved target machines
  └── managed-SSH adapter using existing fixed remote-runner controls
```

No second Shore Sentinel container, runner host, runner broker, or Docker socket is part of this release baseline. Disposable AI and managed-scan execution is isolated inside the application container with bounded unprivileged OS processes/users/namespaces. Host/network egress policy remains an external deployment integration and must not be represented as an additional application service. The existing pinned-host, restricted-root, bounded-cancellation managed-SSH controls remain mandatory, and application-level CIDR checks alone are not presented as live firewall proof.

### 4.1 Process groups and deployment profiles

The previous multi-service Compose profile table is retired for this release. The single application image has one fixed supervisor manifest; optional integrations are process configurations or external endpoints, not additional application containers.

| Group | Purpose | Supervised process or boundary |
|---|---|---|
| `application` | Required release plane | web, API, PostgreSQL, Redis, MinIO, Node worker, Python worker |
| `identity` | Enterprise identity and sessions | OIDC/SAML provider integration at the API boundary; no IdP process is bundled |
| `policy` | Authorization and egress decisions | OPA/policy bundle integration at the API and host/network boundaries; no policy socket is mounted |
| `observability` | Metrics, traces, and logs | OpenTelemetry-compatible API/worker exporters and host collector integration |
| `dev` | Local-only developer experience | Explicit Compose override and disposable local credentials; never the production default |

The application container must never mount `/var/run/docker.sock`, a broad host workspace, host SSH keys, or an unscoped host filesystem. Per-run isolation is provided by fixed unprivileged process users, namespaces, resource limits, bounded temporary directories, and explicit capability/drop policies inside this one container.

### 4.2 Container and process hardening requirements

- Unprivileged process users and user/mount/network namespaces provide per-run isolation inside the application container; the application has no Docker daemon authority.
- Read-only root filesystems, non-root users, dropped Linux capabilities, `no-new-privileges`, seccomp, AppArmor/SELinux profiles, PID limits, bounded CPU/memory, and tmpfs work areas for per-run sandboxes.
- No host bind mounts in per-run sandboxes; use immutable image layers and bounded temporary directories inside the application-data volume.
- `network: none` is the default per-run sandbox mode. Networked tests receive an explicit, short-lived, policy-approved namespace/egress path only after authorization.
- The single container uses loopback-only bindings for API, database, queue, and object-storage control ports; only the documented UI/API health endpoints are published through the deployment boundary.
- Supervisor starts each process with a fixed executable and environment allowlist, restarts only declared transient failures, and reports unhealthy dependencies instead of masking them with a hard-coded green state.
- Resource limits, restart policies, health checks, log rotation, image-digest pinning, SBOMs, and signed-image admission checks are mandatory production controls.

Because the release intentionally co-locates services in one container, loopback and a shared PID namespace are not authorization boundaries. The implementation must compensate with enforceable, testable controls: least-privilege PostgreSQL roles, Redis ACLs, MinIO service credentials, owner/mode-restricted Unix sockets where supported, and service-local authentication for every internal endpoint. Each disposable run must receive fresh user, mount, network, IPC, and UTS namespaces; cgroup v2 CPU/memory/PID/I/O limits; verified seccomp plus AppArmor or SELinux enforcement; masked `/proc`, `/sys`, and device paths; no setuid binaries or ptrace; only a fresh run directory; and deterministic PID-tree cleanup. Startup refuses to enter ready state when any mandatory primitive is unavailable, rather than silently degrading to shared namespaces or unrestricted access.

### 4.3 Independent egress enforcement

Application CIDR validation remains useful but is not sufficient. Docker Compose alone does not prove that a compromised worker cannot bypass policy.

- HTTP/S AI targets: in-container sandboxes use an authenticated egress proxy/gateway with a signed allowlist of approved hostnames, IPs, ports, methods, rate limits, and time windows.
- SSH or non-HTTP targets: use the approved host-enforced nftables/iptables policy or authenticated TCP gateway for the application container. Do not attach a sandbox directly to a broad internet-enabled network.
- The policy compiler produces a server-authoritative, signed export for the gateway/firewall. Application code cannot silently widen it.
- Release evidence must include positive and negative fixture tests proving that approved traffic works and all other destinations/ports fail.

## 5. Enterprise trust and authorization model

### 5.1 Identity

- Replace process-local sessions with OIDC/SAML federation and executable validation of issuer, JWKS signature, audience, nonce, state, and PKCE. Store only hashed durable session identifiers with idle and absolute TTLs, rotation, explicit revocation, device/session management, login throttling, Secure/HttpOnly/SameSite cookies, and CSRF protection.
- Require MFA and step-up authentication for engagement approval, target enrollment, credential access, high-impact test execution, evidence export, risk acceptance, and administrative policy changes. Accept only an approved ACR/AMR combination with a bounded step-up recency window; missing, stale, or downgraded claims fail closed.
- Add SCIM-ready lifecycle management and an emergency, audited break-glass process.

### 5.2 Engagement and approval object

Every test run requires an immutable engagement record containing:

- organization and asset owner;
- target asset/model/tool/pipeline scope;
- permitted test classes and forbidden actions;
- production/non-production classification;
- data classification and DLP requirements;
- runner network scope, rate/cost/time budgets, and expiry;
- approval chain, required dual control, revocation state, and justification;
- policy bundle hash and signer identity.

Execution grants fail closed on every request when the engagement is expired, revoked, out of scope, missing the immutable owner authorization or required dual approvers, outside the permitted test class, or inconsistent with the active policy-bundle hash and signer. Approval records cannot be edited in place; corrections create a new version and preserve the prior audit trail.

### 5.3 Workload identity and secrets

- Replace `INTERNAL_WORKER_TOKEN` with per-workload mTLS identities and short-lived audience-scoped credentials. Validate the issuing CA/trust store, certificate expiry/revocation, SAN/workload identity, and audience on every internal request; certificate/key ownership is separate for API, parser, broker, cleanup, and legacy SSH adapter identities.
- Store long-lived target credentials only as ciphertext envelopes containing a KMS/OpenBao/Vault key ID and version. Key rotation creates a new envelope version; stale keys, unavailable KMS, invalid wrapping, and cross-workload unwrap attempts fail closed without plaintext fallback.
- Never expose target secrets to browser clients, queue payloads, logs, or evidence. Deliver a one-time, attempt-bound lease only after the approved adapter presents its mTLS identity and grant; replay, second use, expired lease, and wrong audience are denied and audited without logging secret material.

### 5.4 Tamper-evident evidence

- Replace mutable audit-only records with an append-only event ledger.
- Hash-chain events per engagement/run and periodically emit signed, keyed sequence checkpoints to a separately administered external WORM/Object-Lock destination. Checkpoints include a monotonic sequence, previous checkpoint reference, candidate image/policy identity, and signer key version; verification rejects gaps, reordering, truncation, replay, clock-skew violations, and restore-time chain mismatches.
- Keep checkpoint signing keys and WORM administration outside the application-data volume and co-resident MinIO administrator domain. Use compliance-mode retention where supported; deletion tombstones, legal holds, retention policy, and immutable evidence exports are never bypassed by an application or container administrator.
- Every artifact package includes target snapshot, application image digest, sandbox/test bundle hash, policy decision, timestamps, artifact hashes, parser version, and findings provenance.

## 6. AI testing execution model

```text
Asset registration
  → engagement + owner authorization
  → policy simulation / dry-run plan
  → required approvals
  → supervisor creates a bounded in-container sandbox
  → sandbox executes bounded approved test bundle
  → redaction + quarantine + artifact finalization
  → normalized findings/read model
  → triage, exception, remediation, verification rerun
```

### 6.1 Test bundle contract

Every test bundle is versioned, signed, and declares:

- target adapter type and supported asset class;
- test method taxonomy and risk level;
- required permissions, network destinations, inputs, and secret references;
- runtime/memory/CPU/cost limits;
- expected output schema and evidence redaction rules;
- destructive-test indicator and required approval level.

Map coverage to OWASP LLM Top 10, OWASP agentic security guidance, MITRE ATLAS, and NIST AI RMF. These mappings support reporting; they never substitute for approved scope.

### 6.2 DLP and prompt-injection containment

- Test inputs, retrieval results, model outputs, tool outputs, and external content are treated as untrusted data, never as supervisor, shell, policy, or tool instructions. Typed tool schemas and fixed adapters reject instruction smuggling and caller-supplied command fields.
- Apply data classification, redaction, token/credential detectors, destination and secret-reference allowlists, output encoding, and size limits before evidence persistence or network egress. Detector failure, policy ambiguity, or parser uncertainty quarantines the result and fails closed.
- In-container sandboxes have no implicit filesystem, host, shell, cloud metadata, or unrestricted tool access.
- Tool calls require declared capability and explicit policy approval.

The adversarial contract covers indirect prompt injection, encoded secrets, malicious URLs and redirects, tool-argument smuggling, oversized payloads, retrieval poisoning, and detector outage. A model or retrieved document can influence only typed data fields; it can never extend supervisor commands, policy bundles, capabilities, destinations, or secret references.

## 7. Data and workflow modernization

### Keep

- PostgreSQL as authoritative operational data store.
- Redis for bounded queues, rate limits, and transient coordination.
- MinIO/S3-compatible private artifact storage.
- Existing durable outbox and cancellation/quarantine concepts.

### Change

- Use versioned migrations and a one-shot migration job with advisory locking; do not mutate schema or recompute seed password hashes on every API start.
- Split the controller into identity, inventory, engagement, scan-command, runner-control, evidence, findings, remediation, reporting, and administration modules.
- Add database-level tenant readiness: least-privilege DB roles, transaction-scoped tenant context, and PostgreSQL RLS before future multi-tenant activation.
- Introduce server-side cursor pagination, filters, sorting, compact list DTOs, full-text search, and explicit aggregate/read-model endpoints.
- Materialize findings, finding instances, remediation state, and dashboard summaries from signed normalized results; do not rely only on artifact files.
- Retain BullMQ initially, backed by the durable Postgres outbox. Introduce a dedicated workflow engine only if measured approval/workflow complexity exceeds the bounded state-machine design.

## 8. Material 3 + Tailwind CSS UI system

The product adopts **Material Design 3** as a semantic design language and implements it with **Tailwind CSS**. This keeps the UI system lightweight and consistent without adding a large component-library dependency. The UI remains a professional operations console: dense, calm, evidence-oriented, accessible, and word-label-first.

### 8.1 Visual principles

- Use Material 3 semantic color roles and surface hierarchy: `surface`, `surface-container`, `surface-container-high`, `primary`, `secondary`, `tertiary`, `error`, and explicit high-contrast states.
- Use a sober deep-navy/graphite neutral base with one restrained cyan-teal operational accent. Severity colors remain semantic and never act as the sole signal.
- Use a high-legibility sans-serif such as Geist or a locally licensed enterprise equivalent; use a tabular monospace face for hashes, IDs, timestamps, and metrics.
- Prefer Material 3 state layers, elevation, shape families, and motion tokens over generic border-and-shadow cards.
- Use no emoji, fake “AI” gradients, hard-coded operational claims, or decorative security metaphors.

### 8.2 Navigation and information architecture

Use an expanded Material 3 navigation rail / side navigation on desktop with **word labels**, preserving direct operator access. Boss approved the following deviation from the earlier Operations / Investigate / Admin grouping: the release navigation is grouped by the existing operator shell and must remain in this order:

```text
Dashboard
  Dashboard

AI Assets
  AI assets
  Add machine

Audit Reports
  Audit archive
  Reports
  Remediation
  Saved views

Knowledgebase
  Knowledgebase

System
  Display preferences
  System update

Users
  Users and access
```

This is a navigation-label and grouping deviation, not a security or authorization waiver. Route-level authorization, approval gates, audit logging, evidence retention, and least-privilege controls remain attached to the underlying API actions. Engagements, policies/approvals, identity/access, legal hold, search, and compare-run capabilities remain discoverable through the corresponding pages and contextual links until their dedicated release routes are implemented.

On tablet/mobile, transform the rail into a Material 3 navigation drawer. Global context stays visible: deployment, environment, evidence freshness, active time range, and active filters.

### 8.3 Application page functions and features

Each page has one primary operator function and a bounded feature set. Pages must expose loading, empty, error, degraded, and permission-denied states without leaking transport or secret data.

| Page | Primary function | Key features |
|---|---|---|
| Sign in and session | Establish an authenticated operator session | OIDC/SAML sign-in, MFA/step-up, session/device management, throttling, audited break-glass path |
| Fleet dashboard | Show current enterprise security posture | risk summary, queue age, evidence freshness, degraded dependencies, active engagements, offline assets, saved time range and filters |
| AI assets | Inventory AI and legacy managed assets | filterable asset table, asset class, owner, environment, classification, status, last evidence, bulk-safe actions, **Add machine** entry point |
| Add machine | Enroll a managed machine through a controlled SSH connection | machine identity, owner/team, environment, scanner root scope, **Option 1: Authentication method**, **Option 2: SSH key**, host-key pinning, read-only connection test, approval status, enrollment result |
| Machine detail | Operate one enrolled machine safely | health and reachability, connection method metadata, masked credential reference, host-key fingerprint, scope policy, scan history, schedules, artifacts, rotation/revoke/change-method actions behind approval |
| Engagements | Define and approve authorized testing work | asset-owner authorization, scope, permitted/forbidden tests, data classification, network and budget limits, expiry, dual approval, revocation, policy simulation |
| Test runs | Control and observe approved executions | dry-run plan, permitted actions, runner status, live events, bounded cancellation, retry/quarantine state, artifacts, provenance, failure reason |
| Findings and remediation | Triage risk and prove closure | normalized findings, severity, owner, SLA, remediation steps, exceptions, risk acceptance, tickets, verification reruns, closure evidence |
| Evidence library | Find and preserve security evidence | artifact search, manifests, hashes, redaction/quarantine state, provenance, retention, legal holds, export, access audit |
| Compare runs | Explain security posture changes | side-by-side run comparison, finding deltas, evidence differences, policy/test-bundle changes, regression indicators, exportable comparison record |
| Saved views | Preserve repeatable operator queries | named filters, role-scoped sharing, URL state, default views, ownership, archive, refresh timestamp |
| Search | Provide cross-product investigation | search assets, engagements, runs, findings, evidence, audit events, scoped filters, permission-aware results, deep links |
| Policies and approvals | Author and review control decisions | policy editor, signed bundle version, simulation, approval chain, expiry/revocation, egress scope, dual control, publication audit |
| Integrations | Connect enterprise systems at controlled boundaries | identity provider, secret service, ticketing, notification, SIEM, evidence export, health/test status, scoped credentials, rotation and disconnect |
| Identity and access | Govern human and workload access | users, groups, roles, MFA state, step-up policy, service/workload identities, session revocation, SCIM readiness, access audit |
| Retention and legal hold | Govern evidence lifecycle | retention policies, legal holds, deletion tombstones, immutable export status, access history, policy simulation, approval-gated changes |
| System health | Show operational truth | dependency health, queue/outbox status, sandbox supervisor status, storage capacity, telemetry/SLO status, policy compiler status, recent failures, no hard-coded green state |

### 8.4 Interaction, accessibility, and performance

- Every destructive or high-impact action uses a Material 3 dialog with clear consequence copy, keyboard focus management, Escape behavior, focus return, and approval context.
- Include loading skeletons, empty states, actionable inline errors, retry states, and offline/degraded states for every asynchronous view.
- Persist filters and search state in shareable URLs.
- Support keyboard-first navigation, visible focus, skip links, semantic tables with accessible alternatives, screen-reader announcements, reduced motion, and WCAG 2.2 AA contrast.
- Motion uses Material 3 duration/easing tokens and only `transform`/`opacity`; no continuous visual effects in high-density operator paths.
- Test authenticated UI flows at 1440×1050, 900×1050, and 390×844 with zero overflow, console errors, or inaccessible blocker paths.

## 9. Simplified technology stack

The enterprise design uses a deliberately small primary stack. Vendor-specific services remain integration boundaries and may be replaced by approved equivalents without changing the control model.

| Area | Selected stack | Brief purpose |
|---|---|---|
| Runtime | Docker Compose + supervised single application container | One application image contains the web/API/database/queue/object-storage/worker process graph with one persistent named volume rooted at `/var/lib/shore-sentinel`. |
| Web UI | Next.js + React + Tailwind CSS | Operator-facing console for assets, engagements, test runs, evidence, remediation, and administration. |
| UI system | Material 3 semantic tokens implemented in Tailwind CSS | Consistent accessible color, spacing, typography, state, and motion rules without a heavyweight component-library dependency. |
| API | NestJS + OpenAPI | Modular control-plane API with explicit contracts, validation, rate limiting, and domain boundaries. Use the default HTTP adapter initially; introduce Fastify only when measured performance requires it. |
| Database | PostgreSQL | Authoritative operational data, migrations, approval records, findings, remediation, audit ledger, and future RLS-ready tenant context. |
| Queue and recovery | Redis + BullMQ + PostgreSQL outbox | Bounded asynchronous work, rate limits, transient coordination, and durable recovery without adding a separate workflow engine initially. |
| Evidence storage | MinIO process in the application container or approved S3-compatible boundary | Private artifact storage with versioning, retention, and Object Lock/WORM-capable production configuration; data persists on a dedicated mounted volume. |
| Identity | OIDC/SAML provider integration + MFA | Enterprise login, step-up authentication, durable revocable sessions, and role-based access. SCIM can follow after the core identity path is proven. |
| Secrets | OpenBao/Vault-compatible service | Envelope encryption and short-lived, attempt-bound secret delivery; secrets never enter browser clients or queue payloads. |
| Policy | OPA + signed policy bundles | Server-authoritative authorization, engagement scope, approval, execution, and egress decisions. |
| AI execution | Managed worker process plus in-container sandbox | Executes signed, bounded test bundles through unprivileged process/user/namespace sandboxes; the application container never mounts the Docker socket. |
| Egress | Authenticated proxy plus host firewall policy | Enforces approved HTTP/S, SSH, and non-HTTP destinations independently of application validation. |
| Observability | OpenTelemetry + approved metrics/logs/traces backend | Common telemetry instrumentation with Prometheus/Grafana or an existing enterprise platform at the storage and visualization boundary. |
| Legacy execution | Existing managed-SSH adapter | Preserves the current pinned-host, restricted-root, bounded-cancellation scanner controls during migration. |
| Supply chain | SBOMs + signed images and test bundles | Establishes artifact provenance and admission checks for production execution. |

### Simplification rules

- Do not add Kubernetes, a dedicated workflow engine, a separate analytics warehouse, or a second primary database in the first enterprise release.
- Keep PostgreSQL authoritative; keep Redis bounded and non-authoritative.
- Keep external identity, policy, egress, and observability integrations at stable boundaries, but do not split the application delivery into multiple containers or unnecessary microservices.
- Treat identity, secrets, policy, egress, and observability as replaceable enterprise integration boundaries with stable internal contracts.
- Add infrastructure only when a measured security, scale, recovery, or compliance requirement justifies it.

### 9.1 Supply-chain and update trust contract

Base images, release images, test bundles, migrations, and deployment configuration must be identified by immutable digests or signed commits/tags. Admission verifies the pinned signer identities and trust roots, signature validity, provenance-to-SBOM linkage, revocation status, and anti-rollback version policy; unsigned, tampered, wrong-signer, revoked, stale, or older-than-approved candidates are rejected. Until the signed update integration and backup/restore evidence exist, the operator update path is explicitly unavailable; a mutable `main` pull followed by `--build` is not a permitted update procedure.

## 10. Phased delivery plan

### Phase 0 — Baseline and safety truth

- Isolate modernization work from the current local-bootstrap release branch.
- Publish supported/unsupported feature matrix; repair or remove misleading UI paths.
- Define canonical AI asset, engagement, policy, evidence, and finding contracts.
- Establish baseline tests, threat model, Docker hardening checklist, and candidate scorecard.

### Phase 1 — Authorization-gated enterprise core

- Engagement/approval objects, policy simulation, expiry/revocation, audit ledger.
- OIDC/SAML, MFA/step-up, durable sessions, workload identity, secret envelope encryption.
- Migration framework and controller modularization.

### Phase 2 — Docker-isolated AI execution plane

- In-container sandbox templates, enforced egress, dry-run planner, image/test-bundle signing.
- LLM/RAG adapter followed by agent/MCP and ML/pipeline adapters.

### Phase 3 — Evidence and remediation

- Signed provenance manifests, durable findings ingestion, comparison/delta, evidence packages, legal hold.
- Assignment, SLA, exception approval/expiry, tickets, verified closure.

### Phase 4 — Material 3 operator experience

- Navigation, global search/context, adaptive dashboards, policy studio, evidence dossier, accessible interaction states.
- Browser/keyboard/responsive QA evidence.

### Phase 5 — Scale, reliability, and release proof

- Query shaping, indexes justified by `EXPLAIN (ANALYZE, BUFFERS)`, load tests, failure injection, backup/restore and rollback drills.
- Exactly-one-container production image/profile, one-volume persistence, supervisor restart and dependency evidence, SLO dashboards, SIEM evidence, signed release process, external WORM checkpoint verification, and independent encrypted recovery drills.

## 11. 95+ quality gate

A static review may score no more than 50/100. A release can score 95+ only with fresh, candidate-specific staging evidence.

| Category | Points | Required threshold |
|---|---:|---|
| Functionality | 20 | 19+ |
| Material 3 UX and accessibility | 15 | 14+ |
| Security, identity, policy, tenancy | 25 | 24+ |
| Modern architecture and maintainability | 10 | 9+ |
| Performance and reliability | 15 | 14+ |
| Efficiency and operability | 15 | 14+ |
| **Total** | **100** | **95+** |

Mandatory release gates:

- zero unresolved Critical or High findings;
- 100% pass of engagement authorization, approval expiry/revocation, workload identity, egress-denial, evidence integrity, accessibility, backup/restore, and rollback controls;
- authenticated browser evidence and API/worker negative tests;
- load/recovery evidence tied to the exact commit and image digest;
- retained approval and release artifacts.

### Accepted deviation records

The following accepted deviations are explicit scope decisions with compensating controls; neither is a security or authorization waiver:

- **DEV-001 — Navigation grouping:** Boss approved the ordered `Dashboard`, `AI Assets`, `Audit Reports`, `Knowledgebase`, `System`, `Users` grouping in §8.2 on 2026-07-22 PHT. Route authorization, approval gates, audit logging, evidence retention, and contextual links remain unchanged.
- **DEV-002 — Single-container co-location:** Boss approved one application container and one application-data volume as the delivery boundary. Shared namespaces and loopback are not trusted boundaries; the mandatory process identities, service authentication, per-run namespaces, cgroup/seccomp/LSM enforcement, masked kernel interfaces, and startup refusal controls in §4.2 are required compensations.

These records are tracked in the machine-readable RTM `accepted_deviations` array and must be re-evaluated if the topology or navigation contract changes.

## 12. Approval boundary

This document records the approved architecture lock and Boss's authorization for the implementation phases, dependency installs, local container builds/runs, disposable/local migrations, commits, pushes, review, and release actions needed to finish this repository. It does not authorize deployment to an unnamed external production host or destructive operations on non-disposable data. Repository pushes and release actions are authorized when they are part of the reviewed completion flow; they do not authorize deployment to an unnamed external production host. The next artifact is `docs/plans/2026-07-22-enterprise-single-container-completion.md`, a detailed implementation plan broken into isolated, test-first increments. Installation Option 1 (one-time local audit) and Option 2 (single-container app deployment) remain supported; neither option is a waiver of the release gates above.
