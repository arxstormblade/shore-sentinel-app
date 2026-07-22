# Graph Report - github-shore-sentinel-app  (2026-07-22)

## Corpus Check
- 232 files · ~285,272 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 2144 nodes · 3195 edges · 189 communities (139 shown, 50 thin omitted)
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 95 edges (avg confidence: 0.77)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `c511a423`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- AppController
- index.js
- Agent_Security_Selfcheck_v3.4.0.py
- appPath
- Shore Sentinel Enterprise AI Security Modernization — Design
- Agent Security Self-Check Version History
- sshExecutor.js
- ProxyHandler
- Route treatment
- dependencies
- MachineDetailClient
- queue.service.ts
- /graphify
- scripts
- app.controller.ts
- scanner-manifest.schema.json
- routePath
- ArtifactService
- 2026-07-22-enterprise-single-container-requirements.json
- Option 2 — App Deployment (install Shore Sentinel into Docker)
- properties
- entrypoint.sh
- envdetect.py
- Shore Sentinel Enterprise Single-Container Completion Plan
- Shore Sentinel v1.1 SSH-Push Security Decision (Historical)
- RemoteRunnerProtocolTests
- Changelog
- CompactOperationsComponentTests
- apiGet
- users-api.js
- saved-views.jsx
- package.json
- App-Wide Compact Operations Test Guide
- Key fields
- Shore Sentinel UI/UX QA Loop
- SingleContainerRuntimeContractTests
- Shore Sentinel Control Plane Architecture Proposal
- Shore Sentinel Release Checklist
- Managed Machine Compact Dossier Design
- Feature Update and DevOps Release Workflow
- ARX_Agent_Security_Remediation.py
- getAuthenticatedUser
- filters.js
- ParserServerTests
- Archon Protocol Telegram Coordination Policy
- compilerOptions
- Changelog
- Shore Sentinel v1.1.0 — Managed Machine Scan Controls and Hardware Summary
- Agent Security Self-Check
- ManagedMachineDossierTests
- proxyUsers
- package.json
- DatabaseService
- check_worker_node_egress_policy.py
- ArchitectureDocumentInvariantTests
- read
- display-preferences.js
- verify-mvp.mjs
- AuthService
- migration-runner.ts
- ssh-security.ts
- Shore Sentinel v1.1.0 Release QA Scorecard — Template
- UI/UX Review and Simplification Plan
- API Surface Overview
- Shore Sentinel Change Request Form
- collect_hardware_info
- scanner
- test_infrastructure_release_evidence.py
- test_production_compose_release_gate.py
- app.module.ts
- Shore Sentinel App-Wide Compact Operations Rollout Plan
- SSH Managed-Machine Scan Controls Implementation Plan
- properties
- V110ReleaseGateTests
- UpdateService
- Managed Machine Compact Dossier — UI/UX Quality Gate
- load_and_validate
- SingleContainerComposeTests
- SingleContainerPersistenceContractTests
- middleware.js
- request-principal.ts
- Managed Machine Compact Dossier Implementation Plan
- Disposable SSH fixture contract and evidence harness
- Worker-node egress ACL contract (operator evidence)
- MVP Phases
- properties
- CompactCoreOperationsPageTests
- CompactEvidenceWorkflowPageTests
- ManagedMachineV11CopyAndControlsTests
- ManagedMonitoringDirectionTests
- Shore Sentinel Token Efficiency Tracking
- Recommended Architecture
- Security Model and Threat Boundaries
- Shore Sentinel scanner bundle contract
- scanner-output.schema.json
- compose_smoke.py
- read
- CompactAdminAndArchivePageTests
- RemoveInAppOneTimeAuditTests
- data.js
- Local Compose runbook
- package.json
- schema.placeholder.json
- items
- UsersPageApiProxyTests
- route.js
- route.js
- page.jsx
- RemediationQueue
- worker-ssh-grant.test.ts
- run-process.sh
- v0.3.0 - Product-roadmap epic release
- Single-container backup, restore, and rollback
- Product Logic and Operating Modes
- Docker Deployment Topology
- shore-sentinel-update.sh
- read
- TokenEfficiencyTests
- V11ManagedMachineReleaseTests
- page.jsx
- Report
- page.jsx
- ReportsLedger
- compilerOptions
- update-api.js
- scan-run-cancel-proxy.test.mjs
- backup-restore.sh
- Dashboard / Analytics Model
- Report Ingestion and Artifact Flow
- SSH Push Flow
- single_container_runtime_smoke.sh
- InventoryRegistry
- verify-machine-data.mjs
- verify-machine-dossier.mjs
- machine-stop-scan.test.mjs
- healthcheck.sh
- Chosen Technology Stack
- Pull-Agent / Check-in Flow
- route.js
- page.jsx
- filters.tsx
- async-cookie-server-helpers.test.mjs
- machine-directory-selection.test.mjs
- machine-hardware-summary.test.mjs
- README.md
- capability-check.sh
- object-storage-bootstrap.mjs
- README.md
- refresh_graphify.sh
- next.config.js
- README.md
- verify-machine-status.mjs
- new-machine-enrollment.test.mjs
- README.md
- README.md
- DEFAULT_REMOTE_OUTPUT_MAX_BYTES
- DEFAULT_REMOTE_STDERR_MAX_BYTES
- sshExecutor.test.js
- index.js
- dependencies
- devDependencies
- QueueService
- scannerBundleContractVersion
- ProxyHandler
- run-scan-supervisor
- index.js
- payloadContract.test.js
- Body
- controller-shapes.test.ts
- force-command-dispatch
- .createJob
- required
- scanner
- target
- config.js
- @aws-sdk/client-s3
- bcryptjs
- bullmq
- cookie-parser
- ioredis
- reflect-metadata
- shore-sentinel
- @aws-sdk/s3-request-presigner

## God Nodes (most connected - your core abstractions)
1. `AppController` - 80 edges
2. `routePath()` - 34 edges
3. `Shore Sentinel Control Plane Architecture Proposal` - 24 edges
4. `ArtifactService` - 21 edges
5. `scripts` - 20 edges
6. `MachineDetailClient()` - 20 edges
7. `main()` - 19 edges
8. `write_simple_pdf()` - 18 edges
9. `SingleContainerRuntimeContractTests` - 18 edges
10. `RemoteRunnerProtocolTests` - 18 edges

## Surprising Connections (you probably didn't know these)
- `SystemUpdatePage()` --calls--> `apiGet()`  [INFERRED]
  web/app/system/update/page.jsx → web/lib/api-data.js
- `bootstrap()` --indirect_call--> `AuthService`  [INFERRED]
  api/src/main.ts → api/src/auth.service.ts
- `lifecycleEvent()` --calls--> `buildRunEvent()`  [EXTRACTED]
  workers/worker-node/src/lifecycle.js → packages/shared/src/index.js
- `normalizeJobData()` --calls--> `scannerBundleContractVersion()`  [EXTRACTED]
  workers/worker-node/src/payload.js → packages/shared/src/index.js
- `toContract()` --calls--> `scannerBundleContractVersion()`  [EXTRACTED]
  workers/worker-node/src/scannerRunner.js → packages/shared/src/index.js

## Import Cycles
- None detected.

## Communities (189 total, 50 thin omitted)

### Community 0 - "AppController"
Cohesion: 0.27
Nodes (3): Get, Param, Req

### Community 1 - "index.js"
Cohesion: 0.24
Nodes (15): handleManagedSshFailure(), retryDecision(), assertActive(), emit(), emitManagedSshFailure(), monitorCancellation(), processManagedSshJob(), processManagedSshJobSteps() (+7 more)

### Community 2 - "Agent_Security_Selfcheck_v3.4.0.py"
Cohesion: 0.11
Nodes (52): add(), _add_pdf_section_inline(), as_list(), contains_secret_like_literal(), correlate(), count_known_config_dirs(), discover_context(), draw_hardware_summary() (+44 more)

### Community 3 - "appPath"
Cohesion: 0.09
Nodes (33): forwardAuth(), normalizeAuthCookie(), POST(), redirectTo(), serverApiBase(), forwardAuth(), normalizeAuthCookie(), POST() (+25 more)

### Community 4 - "Shore Sentinel Enterprise AI Security Modernization — Design"
Cohesion: 0.05
Nodes (43): 10. Phased delivery plan, 11. 95+ quality gate, 12. Approval boundary, 1. Executive direction, 2. Current-state findings that define the design, 3.1 Supported AI asset classes, 3.2 Explicit non-goals for the first enterprise release, 3.3 Add-machine function and SSH connection methods (+35 more)

### Community 5 - "Agent Security Self-Check Version History"
Cohesion: 0.05
Nodes (43): Agent Security Self-Check Version History, Current status, Fixed Issues, Fixed Issues, Fixed Issues, Fixed Issues, Fixed Issues, Fixed Issues (+35 more)

### Community 6 - "sshExecutor.js"
Cohesion: 0.18
Nodes (20): boundedRemoteCancellation(), createPinnedSshTransport(), executePinnedScan(), fixedRemoteCancellationCommand(), fixedRemoteRequestCommand(), fixedRemoteStageCommand(), FORBIDDEN_QUEUE_FIELDS, ipv4ToUint32() (+12 more)

### Community 7 - "ProxyHandler"
Cohesion: 0.09
Nodes (13): extract_cve_info(), normalize_finding(), normalize_severity(), _now(), parse_scanner_output(), ParseResult, Any, _reference_texts() (+5 more)

### Community 8 - "Route treatment"
Cohesion: 0.06
Nodes (32): Accessibility and responsive requirements, `/audits` and `/audits/[id]`, `/auth/login` and `/auth/register`, `/dashboard`, Data rows, Design principles, Filters, Goal (+24 more)

### Community 9 - "dependencies"
Cohesion: 0.20
Nodes (9): name, private, scripts, build, check, start, test, type (+1 more)

### Community 10 - "MachineDetailClient"
Cohesion: 0.12
Nodes (29): enrichRemediations(), Machine(), deriveProgressMessage(), ensureArray(), formatDuration(), hardwareSummaryIsStale(), hardwareSummaryState(), hardwareValue() (+21 more)

### Community 11 - "queue.service.ts"
Cohesion: 0.12
Nodes (12): positiveInteger(), QUEUE_NAMES, QueueName, ScanDispatchDeliveryFailure, scanDispatchJobOptions(), scanRetryPolicy, WorkerRetryEnvironment, workerRetryPolicyFromEnv() (+4 more)

### Community 12 - "/graphify"
Cohesion: 0.07
Nodes (29): For --cluster-only, For git commit hook, For /graphify add, For /graphify explain, For /graphify path, For /graphify query, For native CLAUDE.md integration, For --update (incremental re-extraction) (+21 more)

### Community 13 - "scripts"
Cohesion: 0.06
Nodes (31): api, web, name, overrides, postcss, private, scripts, api:build (+23 more)

### Community 14 - "app.controller.ts"
Cohesion: 0.10
Nodes (24): ARTIFACT_CONTENT_TYPES, assertSshEnrollment(), assertSshGrantControls(), parseSshPort(), PUBLIC_SCAN_RUN_EVENT, SshEnrollment, sshFingerprint(), sshSeal() (+16 more)

### Community 15 - "scanner-manifest.schema.json"
Cohesion: 0.06
Nodes (32): bundle, entrypoint, outputSchema, additionalProperties, properties, required, type, const (+24 more)

### Community 16 - "routePath"
Cohesion: 0.07
Nodes (15): Register(), KB(), SavedViewsPage(), StartScanRedirect(), MobileNavigation(), NewMachineForm(), SavedViewContent(), Brand() (+7 more)

### Community 17 - "ArtifactService"
Cohesion: 0.11
Nodes (8): ArtifactService, CleanupSummary, CleanupWork, Injectable, CleanupSummary, RecoverableArtifactService, CleanupService, CleanupSummary

### Community 18 - "2026-07-22-enterprise-single-container-requirements.json"
Cohesion: 0.04
Nodes (44): accepted_deviations, approval_scope, authorized, excluded, approved_by, approved_on, architecture_spec, baseline_commit (+36 more)

### Community 19 - "Option 2 — App Deployment (install Shore Sentinel into Docker)"
Cohesion: 0.08
Nodes (23): 1. Clone the repository, 2. Configure environment values, 3. Validate the Compose model, 4. Start Shore Sentinel, 5. Check application health, 6. Stop the stack, Application process wiring, Data protection before an approved update (+15 more)

### Community 20 - "properties"
Cohesion: 0.07
Nodes (33): crit, critical, high, info, informational, low, medium, moderate (+25 more)

### Community 21 - "entrypoint.sh"
Cohesion: 0.11
Nodes (20): API_URL, cleanup_bootstrap(), cleanup_bootstrap_password(), ensure_postgres_database(), MINIO_BUCKET, MINIO_DATA_DIR, MINIO_ENDPOINT, PGDATA (+12 more)

### Community 22 - "envdetect.py"
Cohesion: 0.16
Nodes (20): _cgroup_indicates_container(), _cpuinfo_hypervisor_flag(), detect_environment(), detect_environment_detail(), _dmi_indicates_vm(), _dmi_product_name_vm(), _is_container(), _is_vm() (+12 more)

### Community 23 - "Shore Sentinel Enterprise Single-Container Completion Plan"
Cohesion: 0.10
Nodes (19): 95+ evidence matrix, Accepted deviation records, Current baseline used by this plan, Dependency order and implementation tasks, Locked decisions and constraints, Migration and data-safety contract, Requirement register, Rollback and review boundary (+11 more)

### Community 24 - "Shore Sentinel v1.1 SSH-Push Security Decision (Historical)"
Cohesion: 0.11
Nodes (17): Allowed data flow, Bundle and command integrity, Control mapping, Decision, Evidence attribution, Limits and cancellation, Non-negotiable controls, Release acceptance gates (+9 more)

### Community 26 - "Changelog"
Cohesion: 0.11
Nodes (18): Added, Changed, Changed, Changelog, Fixed, Fixed, Security, Security (+10 more)

### Community 27 - "CompactOperationsComponentTests"
Cohesion: 0.12
Nodes (3): CompactOperationsComponentTests, CompactOperationsQualityArtifactTests, read()

### Community 28 - "apiGet"
Cohesion: 0.16
Nodes (9): Audit(), Audits(), Inventory(), Remediation(), Scans(), apiGet(), publicApiBase(), serverApiBase() (+1 more)

### Community 29 - "users-api.js"
Cohesion: 0.24
Nodes (13): EMPTY_FORM, formatDate(), UsersPage(), apiBase(), createUser(), deleteUser(), disableUser(), enableUser() (+5 more)

### Community 30 - "saved-views.jsx"
Cohesion: 0.19
Nodes (16): ALL_VIEW_SLUGS, FailedScansView(), formatTime(), getJson(), HighFindingsView(), readableText(), RecentlyCompletedView(), remediationText() (+8 more)

### Community 31 - "package.json"
Cohesion: 0.09
Nodes (22): eslint, eslint-config-next, next, react, react-dom, dependencies, next, react (+14 more)

### Community 32 - "App-Wide Compact Operations Test Guide"
Cohesion: 0.12
Nodes (14): App-Wide Compact Operations Test Guide, Evidence record, Gate, Route matrix, Viewport and interaction loop, Compact Operations QA Checklist, Evidence, Hard blockers (+6 more)

### Community 33 - "Key fields"
Cohesion: 0.12
Nodes (17): artifacts, Core tables, Key fields, knowledgebase_articles, knowledgebase_categories, one_time_audits, remediation_item_activity, remediation_item_comments (+9 more)

### Community 34 - "Shore Sentinel UI/UX QA Loop"
Cohesion: 0.12
Nodes (16): 1) Copy/paste Hermes prompt, 2) QA checklist, 3) Issue log template, 4) Loop discipline, 5) Suggested review order, 6) Acceptance bar, 7) Short prompt version, App-level checks (+8 more)

### Community 36 - "Shore Sentinel Control Plane Architecture Proposal"
Cohesion: 0.12
Nodes (15): 1. Web UI — Next.js, Component Breakdown, Conclusion, Decisions Captured, Executive Summary, Full Dockerized System Diagram, MVP Definition, MVP excludes (+7 more)

### Community 37 - "Shore Sentinel Release Checklist"
Cohesion: 0.12
Nodes (15): 10) Rollback readiness, 11) Closeout, 1) Intake and scope, 2) Product and design review, 3) Kanban and planning, 4) Implementation, 5.5) Final QA gate (Athena), 5) Validation (+7 more)

### Community 38 - "Managed Machine Compact Dossier Design"
Cohesion: 0.13
Nodes (14): Acceptance criteria, Accessibility, Administration, Chosen approach, Error handling, Goal, Layout, Machine header (+6 more)

### Community 39 - "Feature Update and DevOps Release Workflow"
Cohesion: 0.13
Nodes (15): Archon Protocol visibility and approval layer, Branch and release model, CI/CD target state, Database migration rules, Docker validation checklist, Feature flags, Feature Update and DevOps Release Workflow, Kanban basis (+7 more)

### Community 40 - "ARX_Agent_Security_Remediation.py"
Cohesion: 0.39
Nodes (14): config_path(), env_path(), _fallback_yaml(), file_mode(), get(), hermes_bin(), load_yaml(), main() (+6 more)

### Community 41 - "getAuthenticatedUser"
Cohesion: 0.14
Nodes (8): Login(), NewMachine(), metadata, RootLayout(), Landing(), RemediationDetail(), getAuthenticatedUser(), serverApiBase()

### Community 42 - "filters.js"
Cohesion: 0.22
Nodes (13): ENV_VALUES, FILTER_DEFAULTS, filterAudits(), filterFindings(), filterRuns(), FINDING_STATUS_VALUES, normalizeSeverity(), parseTimeRangeParam() (+5 more)

### Community 43 - "ParserServerTests"
Cohesion: 0.09
Nodes (7): AppController, crossTenantAdmin, viewerRequest, EventEndpoint, tenantRequest, Controller, Res

### Community 44 - "Archon Protocol Telegram Coordination Policy"
Cohesion: 0.14
Nodes (13): Approval request format, Archon Protocol Telegram Coordination Policy, Delivery rules, Do not send to Archon Protocol, Mention rule, Operating rules, Purpose, Scope (+5 more)

### Community 45 - "compilerOptions"
Cohesion: 0.14
Nodes (13): compilerOptions, emitDecoratorMetadata, esModuleInterop, experimentalDecorators, module, moduleResolution, outDir, rootDir (+5 more)

### Community 46 - "Changelog"
Cohesion: 0.15
Nodes (12): Changelog, Unreleased, v0.1.0, v0.1.1, v0.3.10, v0.3.5, v0.3.6, v0.3.7 (+4 more)

### Community 47 - "Shore Sentinel v1.1.0 — Managed Machine Scan Controls and Hardware Summary"
Cohesion: 0.15
Nodes (12): Authorization and API contracts, Clearer navigation and language, Directory to scan safely, Goal, Hardware summary, Out of scope, Scan controls, Scope (+4 more)

### Community 48 - "Agent Security Self-Check"
Cohesion: 0.15
Nodes (12): 1) Run the self-check, 2) Review the outputs, 3) Interpret the exit code, 4) Know the guardrails, Agent Security Self-Check, Frameworks and control lenses used, How framework mapping is applied, How the script works (+4 more)

### Community 50 - "proxyUsers"
Cohesion: 0.32
Nodes (11): DELETE(), GET(), PATCH(), POST(), segmentsFromContext(), GET(), hopByHopHeaders, POST() (+3 more)

### Community 51 - "package.json"
Cohesion: 0.12
Nodes (16): ssh2, dependencies, bullmq, ioredis, @shore-sentinel/shared, ssh2, bullmq, ioredis (+8 more)

### Community 52 - "DatabaseService"
Cohesion: 0.28
Nodes (4): isWeakSecret(), REQUIRED_PRODUCTION_SECRETS, validateProductionSecrets(), productionSecrets

### Community 53 - "check_worker_node_egress_policy.py"
Cohesion: 0.55
Nodes (11): load_and_validate(), main(), Any, Path, reject(), require_exact_keys(), require_network(), require_port() (+3 more)

### Community 54 - "ArchitectureDocumentInvariantTests"
Cohesion: 0.18
Nodes (3): ArchitectureDocumentInvariantTests, Path, read()

### Community 56 - "display-preferences.js"
Cohesion: 0.24
Nodes (8): applyPreferences(), DisplayPreferencesPanel(), readStoredPreferences(), describeDisplayPreferences(), DISPLAY_PREFERENCE_DEFAULTS, DISPLAY_PREFERENCE_OPTIONS, normalizeChoice(), normalizeDisplayPreferences()

### Community 57 - "verify-mvp.mjs"
Cohesion: 0.17
Nodes (10): failures, landing, loginPage, navigationData, navigationGroups, navigationPositions, nextConfig, root (+2 more)

### Community 58 - "AuthService"
Cohesion: 0.16
Nodes (5): AuthService, Session, Injectable, DatabaseService, Injectable

### Community 59 - "migration-runner.ts"
Cohesion: 0.31
Nodes (9): discoverMigrations(), main(), Migration, migrationChecksum(), MigrationClient, migrationDirectory(), MigrationPool, QueryResult (+1 more)

### Community 60 - "ssh-security.ts"
Cohesion: 0.38
Nodes (7): assertSshLaunchRequirements(), canonicalHost(), deny(), LaunchInput, validCidr(), validIpv4(), validRoot()

### Community 61 - "Shore Sentinel v1.1.0 Release QA Scorecard — Template"
Cohesion: 0.18
Nodes (10): Deployment evidence, Final decision, Fixture evidence, Gate summary, Release promotion rule, Rollback evidence, Security-review evidence, Shore Sentinel v1.1.0 Release QA Scorecard — Template (+2 more)

### Community 62 - "UI/UX Review and Simplification Plan"
Cohesion: 0.18
Nodes (11): 2. Backend API — Node.js, 3. Node Orchestrator Worker, 4. Python Data/AI Worker, 5. PostgreSQL, 6. Redis, 7. MinIO / Artifact Storage, Recommended changes, UI/UX Review and Simplification Plan (+3 more)

### Community 63 - "API Surface Overview"
Cohesion: 0.18
Nodes (11): Analytics and notifications, API Surface Overview, Artifacts and reports, Auth and settings, Jobs and runs, Knowledgebase and how-to articles, Logs, alert rules, and email delivery, Managed machines, targets, and environments (+3 more)

### Community 64 - "Shore Sentinel Change Request Form"
Cohesion: 0.18
Nodes (10): Bug report section, Current behavior, Desired behavior, Feature request section, Implementation notes, Request metadata, Review and approval, Shore Sentinel Change Request Form (+2 more)

### Community 65 - "collect_hardware_info"
Cohesion: 0.27
Nodes (10): collect_hardware_info(), _fallback_memory_info(), _fallback_network_adapters(), _human_readable_bytes(), Any, Hardware data collection module for the agent security selfcheck.  Collects CPU,, Convert bytes to a human-readable string (e.g. '1.2 GB')., Return best-effort memory stats without psutil. (+2 more)

### Community 66 - "scanner"
Cohesion: 0.29
Nodes (7): minLength, type, name, version, properties, minLength, type

### Community 67 - "test_infrastructure_release_evidence.py"
Cohesion: 0.20
Nodes (4): DisposableSshFixtureEvidenceTests, ForceCommandProtocolDispatchTests, CompletedProcess, WorkerNodeEgressEvidenceTests

### Community 68 - "test_production_compose_release_gate.py"
Cohesion: 0.20
Nodes (4): ContinuousIntegrationReleaseGateTests, ProductionComposeEnvironmentTests, ProductionSecurityPostureTests, service_block()

### Community 69 - "app.module.ts"
Cohesion: 0.20
Nodes (12): AppModule, isInternalWorkerServiceRoute(), WORKER_SERVICE_ROUTES, bootstrap(), PUBLIC_PATHS, attachSessionPrincipal(), principalFrom(), RequestPrincipal (+4 more)

### Community 70 - "Shore Sentinel App-Wide Compact Operations Rollout Plan"
Cohesion: 0.20
Nodes (9): Rollback, Shore Sentinel App-Wide Compact Operations Rollout Plan, Task 1: Restore source and API integrity, Task 2: Add shared compact operations primitives, Task 3: Convert dashboard and inventory routes, Task 4: Convert reports and remediation routes, Task 5: Convert admin, preference, saved-view, knowledgebase, and legacy archive routes, Task 6: Add canonical QA gate artifacts (+1 more)

### Community 71 - "SSH Managed-Machine Scan Controls Implementation Plan"
Cohesion: 0.20
Nodes (9): SSH Managed-Machine Scan Controls Implementation Plan, Task 1: Lock the version and release contract, Task 2: Add safe managed-scan request validation and public context projection, Task 3: Add host-key pinning and internal worker authentication, Task 4: Make queue cancellation reliable and terminal, Task 5: Implement secure SSH-push scanner execution, Task 6: Add browser-safe hardware summary projection, Task 7: Complete scan controls, copy, and typography (+1 more)

### Community 72 - "properties"
Cohesion: 0.33
Nodes (6): format, type, const, properties, collectedAt, contractVersion

### Community 74 - "UpdateService"
Cohesion: 0.16
Nodes (6): Injectable, UpdateMode, UpdateResult, UpdateService, Delete, Post

### Community 75 - "Managed Machine Compact Dossier — UI/UX Quality Gate"
Cohesion: 0.22
Nodes (8): Baseline note, Breakpoint evidence, Independent QA blockers and resolution, Managed Machine Compact Dossier — UI/UX Quality Gate, Score, Soft refinements, Technical gates, Verified outcomes

### Community 76 - "load_and_validate"
Cohesion: 0.47
Nodes (8): load_and_validate(), main(), Any, Path, reject(), require_object(), require_string_list(), validate_force_command_assets()

### Community 77 - "SingleContainerComposeTests"
Cohesion: 0.25
Nodes (3): MigrationAndRecoveryTests, service_block(), SingleContainerComposeTests

### Community 79 - "middleware.js"
Cohesion: 0.36
Nodes (8): authPageToApi, basePath(), config, homeUrl(), isPublicPath(), middleware(), PUBLIC_PATH_PREFIXES, withoutBasePath()

### Community 80 - "request-principal.ts"
Cohesion: 0.25
Nodes (14): run-scan script, cancel_request(), is_uuid(), mark_cleanup_failed_state(), mark_stale_authority_state(), mark_state_status(), process_group_running(), process_identity_matches() (+6 more)

### Community 81 - "Managed Machine Compact Dossier Implementation Plan"
Cohesion: 0.25
Nodes (7): Managed Machine Compact Dossier Implementation Plan, Task 1: Restore a compilable route baseline, Task 2: Add managed-machine dossier regression tests, Task 3: Implement compact dossier presentation, Task 4: Verify regressions and build, Task 5: Browser QA loop, Task 6: Publish scoped branch

### Community 82 - "Disposable SSH fixture contract and evidence harness"
Cohesion: 0.25
Nodes (7): Check-only local command, Disposable SSH fixture contract and evidence harness, Evidence gap, External evidence commands (do not execute here), Required approved-fixture test matrix, Required immutable fixture layout, Scope and fixed trust boundary

### Community 83 - "Worker-node egress ACL contract (operator evidence)"
Cohesion: 0.25
Nodes (7): Atomic update and rollback contract, DNS and HTTPS, Evidence gap, Local schema input is not provenance evidence, Required traffic identity and default-deny boundary, Safe local checks and approved external evidence, Worker-node egress ACL contract (operator evidence)

### Community 84 - "MVP Phases"
Cohesion: 0.25
Nodes (8): MVP Phases, Phase 0: Repository and Docker skeleton, Phase 1: Core inventory, auth, app entry paths, and knowledgebase foundation, Phase 2: One-time audit and SSH push scan vertical slice, Phase 3: Artifact processing and report viewer, Phase 4: Dashboard, status monitoring, scheduling, and informational notifications, Phase 5: Pull-agent/check-in support, Phase 6: Hardening and scale

### Community 85 - "properties"
Cohesion: 0.25
Nodes (8): minLength, type, type, type, assetId, hostname, ip, properties

### Community 90 - "Shore Sentinel Token Efficiency Tracking"
Cohesion: 0.29
Nodes (6): Check current Graphify metadata, Interpretation rules, Log a task, Shore Sentinel Token Efficiency Tracking, Summarize the data, What it tracks

### Community 91 - "Recommended Architecture"
Cohesion: 0.29
Nodes (7): Authentication, roles, and permissions, Baseline role permission matrix, Control plane, Data plane, Key principles, Recommended Architecture, Scanner bundle contract

### Community 92 - "Security Model and Threat Boundaries"
Cohesion: 0.29
Nodes (7): Core controls, MVP local authentication requirements, MVP sealed-secret requirements, Owner decisions reflected, Security goals, Security Model and Threat Boundaries, Trust boundaries

### Community 93 - "Shore Sentinel scanner bundle contract"
Cohesion: 0.29
Nodes (6): Bundle manifest, Canonical managed-machine artifact flow, Lifecycle and retry behavior, One-time local audit from GitHub, Runtime interface for managed-machine scans, Shore Sentinel scanner bundle contract

### Community 94 - "scanner-output.schema.json"
Cohesion: 0.33
Nodes (5): additionalProperties, $id, $schema, title, type

### Community 95 - "compose_smoke.py"
Cohesion: 0.57
Nodes (6): has_socket_access(), main(), CompletedProcess, run(), run_compose_via_sg(), user_in_group()

### Community 96 - "read"
Cohesion: 0.43
Nodes (3): AppRolloutFoundationTests, Path, read()

### Community 99 - "data.js"
Cohesion: 0.29
Nodes (5): audits, machines, navGroups, remediations, reports

### Community 100 - "Local Compose runbook"
Cohesion: 0.33
Nodes (5): Bootstrap behavior, Health expectations, Local Compose runbook, Shore Sentinel docs, Validation commands

### Community 101 - "package.json"
Cohesion: 0.33
Nodes (5): exports, name, private, type, version

### Community 102 - "schema.placeholder.json"
Cohesion: 0.33
Nodes (5): description, $id, $schema, title, type

### Community 103 - "items"
Cohesion: 0.25
Nodes (8): severity, title, items, type, additionalProperties, required, type, findings

### Community 105 - "route.js"
Cohesion: 0.60
Nodes (5): authorizeCancellation(), EDIT_ROLES, forwardedHeaders(), POST(), serverApiBase()

### Community 106 - "route.js"
Cohesion: 0.60
Nodes (5): allowedPath(), GET(), READ_ROLES, READ_SUBRESOURCES, serverApiBase()

### Community 107 - "page.jsx"
Cohesion: 0.47
Nodes (5): Dashboard(), formatDate(), severityColors, severityOrder, statusLabel()

### Community 108 - "RemediationQueue"
Cohesion: 0.60
Nodes (5): groupByMachine(), normalized(), RemediationQueue(), titleCase(), valuesFor()

### Community 110 - "run-process.sh"
Cohesion: 0.70
Nodes (4): run-process.sh script, wait_for_postgres(), wait_for_redis(), wait_for_url()

### Community 111 - "v0.3.0 - Product-roadmap epic release"
Cohesion: 0.40
Nodes (4): Shore Sentinel Product Roadmap Release Notes, User-facing changes, v0.3.0 - Product-roadmap epic release, Validation expectations

### Community 112 - "Single-container backup, restore, and rollback"
Cohesion: 0.40
Nodes (4): Backup, Restore drill, Rollback primitive, Single-container backup, restore, and rollback

### Community 113 - "Product Logic and Operating Modes"
Cohesion: 0.40
Nodes (5): Core product capabilities, Mode 1: GitHub scanner option, Mode 2: Add Managed Machine, Product Logic and Operating Modes, Promotion path

### Community 114 - "Docker Deployment Topology"
Cohesion: 0.40
Nodes (5): Docker Compose services for MVP, Docker Deployment Topology, MVP runtime requirements, Production evolution, Runtime characteristics

### Community 115 - "shore-sentinel-update.sh"
Cohesion: 0.80
Nodes (4): err(), log(), need(), shore-sentinel-update.sh script

### Community 117 - "TokenEfficiencyTests"
Cohesion: 0.18
Nodes (18): ArgumentParser, Namespace, add_common_data_arg(), append_record(), build_record(), build_summary(), graph_metadata(), load_records() (+10 more)

### Community 119 - "page.jsx"
Cohesion: 0.40
Nodes (3): SavedViewSlugPage(), STATIC_SLUGS, VIEW_TITLES

### Community 120 - "Report"
Cohesion: 0.70
Nodes (4): artifactDescription(), artifactLabel(), renderFinding(), Report()

### Community 122 - "ReportsLedger"
Cohesion: 0.70
Nodes (4): normalized(), optionsFor(), ReportsLedger(), titleCase()

### Community 123 - "compilerOptions"
Cohesion: 0.50
Nodes (3): compilerOptions, baseUrl, paths

### Community 124 - "update-api.js"
Cohesion: 0.80
Nodes (4): applyUpdate(), checkUpdate(), parseResponse(), publicApiBase()

### Community 126 - "backup-restore.sh"
Cohesion: 0.83
Nodes (3): set_redis_appendonly(), backup-restore.sh script, usage()

### Community 127 - "Dashboard / Analytics Model"
Cohesion: 0.50
Nodes (4): Core metrics, Dashboard / Analytics Model, MVP analytics decision, Recommended charts

### Community 128 - "Report Ingestion and Artifact Flow"
Cohesion: 0.50
Nodes (4): Error handling, Flow, Report Ingestion and Artifact Flow, Supported artifacts

### Community 129 - "SSH Push Flow"
Cohesion: 0.50
Nodes (4): Flow, Intent, Notes, SSH Push Flow

### Community 131 - "InventoryRegistry"
Cohesion: 0.83
Nodes (3): formatDate(), InventoryRegistry(), readableStatus()

### Community 132 - "verify-machine-data.mjs"
Cohesion: 0.50
Nodes (3): fallbackReports, remediations, root

### Community 134 - "machine-stop-scan.test.mjs"
Cohesion: 0.50
Nodes (3): cancelScan, component, runStatus

### Community 136 - "Chosen Technology Stack"
Cohesion: 0.67
Nodes (3): Canonical job, run, and artifact path, Chosen Technology Stack, Important stack decision

### Community 137 - "Pull-Agent / Check-in Flow"
Cohesion: 0.67
Nodes (3): Flow, Intent, Pull-Agent / Check-in Flow

### Community 163 - "sshExecutor.test.js"
Cohesion: 0.11
Nodes (3): CommandClient, ReadyClient, StageClient

### Community 164 - "index.js"
Cohesion: 0.17
Nodes (12): createApiClient(), getJson(), postJson(), api, artifactCleanupWorker, config, connection, events (+4 more)

### Community 165 - "dependencies"
Cohesion: 0.13
Nodes (15): dependencies, @aws-sdk/client-s3, @nestjs/common, @nestjs/core, @nestjs/platform-express, pg, rxjs, @shore-sentinel/shared (+7 more)

### Community 166 - "devDependencies"
Cohesion: 0.13
Nodes (15): devDependencies, tsx, @types/bcryptjs, @types/cookie-parser, @types/express, @types/node, @types/pg, typescript (+7 more)

### Community 167 - "QueueService"
Cohesion: 0.23
Nodes (3): QueueService, scanDispatchRetryDelayMs(), Injectable

### Community 168 - "scannerBundleContractVersion"
Cohesion: 0.30
Nodes (8): scannerBundleContractVersion(), normalizeJobData(), artifactTypeFor(), contentTypeFor(), execFileAsync, runBundledScanner(), severityFromRisk(), toContract()

### Community 169 - "ProxyHandler"
Cohesion: 0.27
Nodes (3): ProxyHandler, BaseHTTPRequestHandler, upstream_path()

### Community 170 - "run-scan-supervisor"
Cohesion: 0.25
Nodes (9): run-scan-supervisor script, has_group_member_other_than_self(), is_uuid(), MAX_STARTUP_WAIT_SECONDS, reject(), REQUEST_ROOT, SCAN_IMPLEMENTATION, state_authorizes_self() (+1 more)

### Community 171 - "index.js"
Cohesion: 0.47
Nodes (5): buildRunEvent(), JOB_STATUS, RUN_EVENT_TYPE, artifactUploadPayload(), lifecycleEvent()

### Community 172 - "payloadContract.test.js"
Cohesion: 0.33
Nodes (4): createParserClient(), serializeParserRequest(), grant, job

### Community 174 - "controller-shapes.test.ts"
Cohesion: 0.25
Nodes (5): adminRequest, analystRequest, controller(), operatorRequest, viewerRequest

### Community 175 - "force-command-dispatch"
Cohesion: 0.29
Nodes (7): force-command-dispatch script, CANCEL_REGEX, reject(), REQUEST_REGEX, RUNNER, STAGE_REGEX, UUID_REGEX

### Community 177 - "required"
Cohesion: 0.33
Nodes (6): collectedAt, findings, scanner, target, contractVersion, required

### Community 178 - "scanner"
Cohesion: 0.33
Nodes (6): name, version, scanner, additionalProperties, required, type

### Community 179 - "target"
Cohesion: 0.40
Nodes (5): assetId, target, additionalProperties, required, type

### Community 180 - "config.js"
Cohesion: 0.70
Nodes (3): positiveInteger(), readConfig(), sshWorkerConcurrency()

## Knowledge Gaps
- **785 isolated node(s):** `name`, `version`, `private`, `type`, `build` (+780 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **50 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `AppController` connect `ParserServerTests` to `AppController`, `app.module.ts`, `QueueService`, `scannerBundleContractVersion`, `UpdateService`, `queue.service.ts`, `Body`, `app.controller.ts`, `controller-shapes.test.ts`, `.createJob`, `ArtifactService`, `worker-ssh-grant.test.ts`?**
  _High betweenness centrality (0.045) - this node is a cross-community bridge._
- **Why does `Header()` connect `routePath` to `ParserServerTests`?**
  _High betweenness centrality (0.036) - this node is a cross-community bridge._
- **Why does `routePath()` connect `routePath` to `InventoryRegistry`, `appPath`, `getAuthenticatedUser`, `MachineDetailClient`, `page.jsx`, `RemediationQueue`, `@aws-sdk/client-s3`, `page.jsx`, `display-preferences.js`, `ReportsLedger`, `apiGet`, `saved-views.jsx`?**
  _High betweenness centrality (0.034) - this node is a cross-community bridge._
- **Are the 33 inferred relationships involving `routePath()` (e.g. with `Audit()` and `Audits()`) actually correct?**
  _`routePath()` has 33 INFERRED edges - model-reasoned connections that need verification._
- **What connects `name`, `version`, `private` to the rest of the system?**
  _785 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Agent_Security_Selfcheck_v3.4.0.py` be split into smaller, more focused modules?**
  _Cohesion score 0.10752688172043011 - nodes in this community are weakly interconnected._
- **Should `appPath` be split into smaller, more focused modules?**
  _Cohesion score 0.08527131782945736 - nodes in this community are weakly interconnected._