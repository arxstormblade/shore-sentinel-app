# Shore Sentinel Enterprise AI Security Modernization — Design

**Status:** Proposed — architecture and UI/UX design only; no implementation authorized by this document.

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
3. Execute AI tests in disposable Docker runners isolated from the control plane.
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

Docker Compose remains the deployment contract. Production is a hardened multi-host Docker topology rather than a Kubernetes cluster.

```text
Operator browser
  │ TLS / OIDC
  ▼
Ingress proxy
  ├── Web UI
  └── Control-plane API
        ├── PostgreSQL
        ├── Redis
        ├── MinIO / S3-compatible evidence store
        ├── OPA policy service
        ├── Identity provider integration
        ├── OpenBao/Vault-compatible secret service
        └── observability collectors

Separate Docker runner host or VM
  ├── Runner broker (mTLS only)
  ├── constrained Docker socket proxy / remote Docker API boundary
  ├── disposable ai-test-runner containers
  └── egress gateway / host firewall policy

Optional legacy execution host
  └── managed-SSH adapter using existing fixed remote runner controls
```

### 4.1 Compose profiles

| Profile | Purpose | Services |
|---|---|---|
| `core` | Required application plane | web, api, postgres, redis, MinIO, parser, read-model workers |
| `identity` | Enterprise identity and secrets | OIDC/SAML provider integration, OpenBao/Vault-compatible service |
| `policy` | Authorization decisions | OPA, signed policy bundle publisher, policy audit sink |
| `observability` | Metrics, traces, logs | OpenTelemetry Collector, Prometheus, Grafana, Loki/Tempo or approved equivalents |
| `runner-broker` | Separate execution host only | broker, constrained Docker API boundary, runner image cache |
| `dev` | Local-only developer experience | local bootstrap, test fixtures, loopback bindings |

The control plane must never mount `/var/run/docker.sock`, a broad workspace path, or host SSH keys. The runner broker is the only component permitted to ask Docker Engine to create a runner, and it must run on a separate Docker host or VM from the control plane.

### 4.2 Docker hardening requirements

- Rootless Docker or user-namespace remapping on runner hosts.
- Read-only root filesystems, non-root users, dropped Linux capabilities, `no-new-privileges`, seccomp, AppArmor/SELinux profiles, PID limits, bounded CPU/memory, and tmpfs work areas for runners.
- No host bind mounts in test runners; use immutable image layers and bounded ephemeral volumes.
- `network: none` is the default runner mode. Networked tests receive an explicit, short-lived execution network only after policy approval.
- Docker Compose `internal: true` networks isolate control-plane services by default.
- Resource limits, restart policies, health checks, log rotation, image-digest pinning, SBOMs, and signed-image admission checks are mandatory production controls.

### 4.3 Independent egress enforcement

Application CIDR validation remains useful but is not sufficient. Docker Compose alone does not prove that a compromised worker cannot bypass policy.

- HTTP/S AI targets: runners use an authenticated egress proxy/gateway with a signed allowlist of approved hostnames, IPs, ports, methods, rate limits, and time windows.
- SSH or non-HTTP targets: use a separate runner host with host-enforced nftables/iptables policy, or a dedicated TCP egress broker. Do not attach a runner directly to a broad internet-enabled Docker network.
- The policy compiler produces a server-authoritative, signed export for the gateway/firewall. Application code cannot silently widen it.
- Release evidence must include positive and negative fixture tests proving that approved traffic works and all other destinations/ports fail.

## 5. Enterprise trust and authorization model

### 5.1 Identity

- Replace process-local sessions with OIDC/SAML federation, durable revocable session records, login throttling, device/session management, and MFA.
- Require step-up authentication for engagement approval, target enrollment, credential access, high-impact test execution, evidence export, risk acceptance, and administrative policy changes.
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

Execution grants fail closed when the engagement is expired, revoked, out of scope, missing required approvers, or inconsistent with the active policy bundle.

### 5.3 Workload identity and secrets

- Replace `INTERNAL_WORKER_TOKEN` with per-workload mTLS identity plus short-lived audience-scoped credentials.
- Separate API, parser, broker, cleanup, and legacy SSH adapter identities.
- Store long-lived target credentials with envelope encryption backed by OpenBao/Vault-compatible key management. Never expose them to browser clients or queue payloads.
- Use one-time, attempt-bound secret delivery only when a policy-approved adapter actually requires it.

### 5.4 Tamper-evident evidence

- Replace mutable audit-only records with an append-only event ledger.
- Hash-chain events per engagement/run and periodically checkpoint to a separately retained evidence location.
- Use deletion tombstones, legal holds, retention policy, and immutable evidence exports rather than destructive history erasure.
- Every artifact package includes target snapshot, runner image digest, test bundle hash, policy decision, timestamps, artifact hashes, parser version, and findings provenance.

## 6. AI testing execution model

```text
Asset registration
  → engagement + owner authorization
  → policy simulation / dry-run plan
  → required approvals
  → broker creates disposable runner
  → runner executes bounded approved test bundle
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

- Test inputs and model outputs are treated as untrusted data, never as runner instructions.
- Apply data classification, redaction, token/credential detectors, size limits, and quarantine before evidence persistence.
- Test runners have no implicit filesystem, host, shell, cloud metadata, or unrestricted tool access.
- Tool calls require declared capability and explicit policy approval.

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

Use an expanded Material 3 navigation rail / side navigation on desktop with **word labels**, preserving direct operator access:

```text
Operations
  Fleet dashboard
  AI assets
  Engagements
  Test runs
  Findings & remediation

Investigate
  Evidence library
  Compare runs
  Saved views
  Search

Admin
  Policies & approvals
  Integrations
  Identity & access
  Retention & legal hold
  System health
```

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
| System health | Show operational truth | dependency health, queue/outbox status, runner broker status, storage capacity, telemetry/SLO status, policy compiler status, recent failures, no hard-coded green state |

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
| Runtime | Docker Compose | One deployment contract for local and production environments. Production may place the runner plane on a separate Docker host or VM. |
| Web UI | Next.js + React + Tailwind CSS | Operator-facing console for assets, engagements, test runs, evidence, remediation, and administration. |
| UI system | Material 3 semantic tokens implemented in Tailwind CSS | Consistent accessible color, spacing, typography, state, and motion rules without a heavyweight component-library dependency. |
| API | NestJS + OpenAPI | Modular control-plane API with explicit contracts, validation, rate limiting, and domain boundaries. Use the default HTTP adapter initially; introduce Fastify only when measured performance requires it. |
| Database | PostgreSQL | Authoritative operational data, migrations, approval records, findings, remediation, audit ledger, and future RLS-ready tenant context. |
| Queue and recovery | Redis + BullMQ + PostgreSQL outbox | Bounded asynchronous work, rate limits, transient coordination, and durable recovery without adding a separate workflow engine initially. |
| Evidence storage | MinIO or S3-compatible storage | Private artifact storage with versioning, retention, and Object Lock/WORM-capable production configuration. |
| Identity | OIDC/SAML provider integration + MFA | Enterprise login, step-up authentication, durable revocable sessions, and role-based access. SCIM can follow after the core identity path is proven. |
| Secrets | OpenBao/Vault-compatible service | Envelope encryption and short-lived, attempt-bound secret delivery; secrets never enter browser clients or queue payloads. |
| Policy | OPA + signed policy bundles | Server-authoritative authorization, engagement scope, approval, execution, and egress decisions. |
| AI execution | Separate runner broker + disposable Docker runners | Executes signed, bounded test bundles away from the control plane; the control plane never mounts the Docker socket. |
| Egress | Authenticated proxy plus host firewall policy | Enforces approved HTTP/S, SSH, and non-HTTP destinations independently of application validation. |
| Observability | OpenTelemetry + approved metrics/logs/traces backend | Common telemetry instrumentation with Prometheus/Grafana or an existing enterprise platform at the storage and visualization boundary. |
| Legacy execution | Existing managed-SSH adapter | Preserves the current pinned-host, restricted-root, bounded-cancellation scanner controls during migration. |
| Supply chain | SBOMs + signed images and test bundles | Establishes artifact provenance and admission checks for production execution. |

### Simplification rules

- Do not add Kubernetes, a dedicated workflow engine, a separate analytics warehouse, or a second primary database in the first enterprise release.
- Keep PostgreSQL authoritative; keep Redis bounded and non-authoritative.
- Keep the control plane and runner plane separate, but do not split the application into unnecessary microservices.
- Treat identity, secrets, policy, egress, and observability as replaceable enterprise integration boundaries with stable internal contracts.
- Add infrastructure only when a measured security, scale, recovery, or compliance requirement justifies it.

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

- Runner broker on separate Docker host/VM.
- Sandbox templates, enforced egress, dry-run planner, image/test-bundle signing.
- LLM/RAG adapter followed by agent/MCP and ML/pipeline adapters.

### Phase 3 — Evidence and remediation

- Signed provenance manifests, durable findings ingestion, comparison/delta, evidence packages, legal hold.
- Assignment, SLA, exception approval/expiry, tickets, verified closure.

### Phase 4 — Material 3 operator experience

- Navigation, global search/context, adaptive dashboards, policy studio, evidence dossier, accessible interaction states.
- Browser/keyboard/responsive QA evidence.

### Phase 5 — Scale, reliability, and release proof

- Query shaping, indexes justified by `EXPLAIN (ANALYZE, BUFFERS)`, load tests, failure injection, backup/restore and rollback drills.
- Docker production profiles, SLO dashboards, SIEM evidence, signed release process.

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

## 12. Approval boundary

This document is a proposed architecture. It authorizes no code, Compose change, container startup, dependency installation, external test, migration, or release action. After review approval, the next artifact is a detailed implementation plan broken into isolated, test-first, approval-gated increments.
