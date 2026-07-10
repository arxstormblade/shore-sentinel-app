# Graph Report - .  (2026-07-07)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 1051 nodes · 1620 edges · 83 communities (72 shown, 11 thin omitted)
- Extraction: 96% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 70 edges (avg confidence: 0.78)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `cfc799e5`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- [[_COMMUNITY_Community 0|Community 0]]
- [[_COMMUNITY_Community 1|Community 1]]
- [[_COMMUNITY_Community 2|Community 2]]
- [[_COMMUNITY_Community 3|Community 3]]
- [[_COMMUNITY_Community 4|Community 4]]
- [[_COMMUNITY_Community 5|Community 5]]
- [[_COMMUNITY_Community 6|Community 6]]
- [[_COMMUNITY_Community 7|Community 7]]
- [[_COMMUNITY_Community 8|Community 8]]
- [[_COMMUNITY_Community 9|Community 9]]
- [[_COMMUNITY_Community 10|Community 10]]
- [[_COMMUNITY_Community 11|Community 11]]
- [[_COMMUNITY_Community 12|Community 12]]
- [[_COMMUNITY_Community 13|Community 13]]
- [[_COMMUNITY_Community 14|Community 14]]
- [[_COMMUNITY_Community 15|Community 15]]
- [[_COMMUNITY_Community 16|Community 16]]
- [[_COMMUNITY_Community 17|Community 17]]
- [[_COMMUNITY_Community 18|Community 18]]
- [[_COMMUNITY_Community 19|Community 19]]
- [[_COMMUNITY_Community 20|Community 20]]
- [[_COMMUNITY_Community 21|Community 21]]
- [[_COMMUNITY_Community 22|Community 22]]
- [[_COMMUNITY_Community 23|Community 23]]
- [[_COMMUNITY_Community 24|Community 24]]
- [[_COMMUNITY_Community 25|Community 25]]
- [[_COMMUNITY_Community 26|Community 26]]
- [[_COMMUNITY_Community 27|Community 27]]
- [[_COMMUNITY_Community 28|Community 28]]
- [[_COMMUNITY_Community 29|Community 29]]
- [[_COMMUNITY_Community 30|Community 30]]
- [[_COMMUNITY_Community 31|Community 31]]
- [[_COMMUNITY_Community 32|Community 32]]
- [[_COMMUNITY_Community 33|Community 33]]
- [[_COMMUNITY_Community 34|Community 34]]
- [[_COMMUNITY_Community 35|Community 35]]
- [[_COMMUNITY_Community 36|Community 36]]
- [[_COMMUNITY_Community 37|Community 37]]
- [[_COMMUNITY_Community 38|Community 38]]
- [[_COMMUNITY_Community 39|Community 39]]
- [[_COMMUNITY_Community 40|Community 40]]
- [[_COMMUNITY_Community 41|Community 41]]
- [[_COMMUNITY_Community 42|Community 42]]
- [[_COMMUNITY_Community 43|Community 43]]
- [[_COMMUNITY_Community 44|Community 44]]
- [[_COMMUNITY_Community 45|Community 45]]
- [[_COMMUNITY_Community 46|Community 46]]
- [[_COMMUNITY_Community 47|Community 47]]
- [[_COMMUNITY_Community 48|Community 48]]
- [[_COMMUNITY_Community 49|Community 49]]
- [[_COMMUNITY_Community 50|Community 50]]
- [[_COMMUNITY_Community 51|Community 51]]
- [[_COMMUNITY_Community 52|Community 52]]
- [[_COMMUNITY_Community 53|Community 53]]
- [[_COMMUNITY_Community 54|Community 54]]
- [[_COMMUNITY_Community 55|Community 55]]
- [[_COMMUNITY_Community 56|Community 56]]
- [[_COMMUNITY_Community 57|Community 57]]
- [[_COMMUNITY_Community 58|Community 58]]
- [[_COMMUNITY_Community 59|Community 59]]
- [[_COMMUNITY_Community 60|Community 60]]
- [[_COMMUNITY_Community 61|Community 61]]
- [[_COMMUNITY_Community 62|Community 62]]
- [[_COMMUNITY_Community 63|Community 63]]
- [[_COMMUNITY_Community 64|Community 64]]
- [[_COMMUNITY_Community 65|Community 65]]
- [[_COMMUNITY_Community 66|Community 66]]
- [[_COMMUNITY_Community 67|Community 67]]
- [[_COMMUNITY_Community 68|Community 68]]
- [[_COMMUNITY_Community 69|Community 69]]
- [[_COMMUNITY_Community 70|Community 70]]
- [[_COMMUNITY_Community 71|Community 71]]
- [[_COMMUNITY_Community 72|Community 72]]
- [[_COMMUNITY_Community 73|Community 73]]
- [[_COMMUNITY_Community 74|Community 74]]
- [[_COMMUNITY_Community 76|Community 76]]
- [[_COMMUNITY_Community 77|Community 77]]
- [[_COMMUNITY_Community 78|Community 78]]
- [[_COMMUNITY_Community 79|Community 79]]

## God Nodes (most connected - your core abstractions)
1. `AppController` - 50 edges
2. `routePath()` - 27 edges
3. `Shore Sentinel Control Plane Architecture Proposal` - 24 edges
4. `main()` - 19 edges
5. `write_simple_pdf()` - 18 edges
6. `get()` - 17 edges
7. `AuthService` - 15 edges
8. `DatabaseService` - 15 edges
9. `scripts` - 15 edges
10. `PdfCanvas` - 15 edges

## Surprising Connections (you probably didn't know these)
- `SystemUpdatePage()` --calls--> `apiGet()`  [INFERRED]
  web/app/system/update/page.jsx → web/lib/api-data.js
- `SavedViewContent()` --calls--> `routePath()`  [INFERRED]
  web/components/saved-views.jsx → web/lib/paths.js
- `lifecycleEvent()` --calls--> `buildRunEvent()`  [EXTRACTED]
  workers/worker-node/src/lifecycle.js → packages/shared/src/index.js
- `parseWithPython()` --calls--> `scannerBundleContractVersion()`  [EXTRACTED]
  workers/worker-node/src/index.js → packages/shared/src/index.js
- `normalizeJobData()` --calls--> `scannerBundleContractVersion()`  [EXTRACTED]
  workers/worker-node/src/payload.js → packages/shared/src/index.js

## Import Cycles
- None detected.

## Communities (83 total, 11 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.05
Nodes (30): parseSshPort(), sshFingerprint(), sshSeal(), trimText(), AppModule, ArtifactService, Injectable, AuthService (+22 more)

### Community 1 - "Community 1"
Cohesion: 0.11
Nodes (12): AppController, requireString(), Body, Controller, Delete, Get, Header, Param (+4 more)

### Community 2 - "Community 2"
Cohesion: 0.11
Nodes (52): add(), _add_pdf_section_inline(), as_list(), contains_secret_like_literal(), correlate(), count_known_config_dirs(), discover_context(), draw_hardware_summary() (+44 more)

### Community 3 - "Community 3"
Cohesion: 0.05
Nodes (43): Agent Security Self-Check Version History, Current status, Fixed Issues, Fixed Issues, Fixed Issues, Fixed Issues, Fixed Issues, Fixed Issues (+35 more)

### Community 4 - "Community 4"
Cohesion: 0.07
Nodes (34): forwardAuth(), normalizeAuthCookie(), POST(), redirectTo(), serverApiBase(), forwardAuth(), normalizeAuthCookie(), POST() (+26 more)

### Community 5 - "Community 5"
Cohesion: 0.11
Nodes (28): ARTIFACT_KIND, buildRunEvent(), JOB_STATUS, QUEUES, RUN_EVENT_TYPE, scannerBundleContractVersion(), createApiClient(), postJson() (+20 more)

### Community 6 - "Community 6"
Cohesion: 0.10
Nodes (14): BaseHTTPRequestHandler, ProxyHandler, upstream_path(), extract_cve_info(), normalize_finding(), normalize_severity(), _now(), parse_scanner_output() (+6 more)

### Community 7 - "Community 7"
Cohesion: 0.06
Nodes (31): dependencies, @aws-sdk/client-s3, @aws-sdk/s3-request-presigner, bcryptjs, bullmq, cookie-parser, ioredis, @nestjs/common (+23 more)

### Community 8 - "Community 8"
Cohesion: 0.07
Nodes (26): additionalProperties, properties, required, type, const, description, type, $id (+18 more)

### Community 9 - "Community 9"
Cohesion: 0.09
Nodes (23): type, type, type, type, type, type, type, properties (+15 more)

### Community 10 - "Community 10"
Cohesion: 0.10
Nodes (20): name, private, scripts, api:build, api:check, api:test, check, compose:config (+12 more)

### Community 11 - "Community 11"
Cohesion: 0.16
Nodes (20): _cgroup_indicates_container(), _cpuinfo_hypervisor_flag(), detect_environment(), detect_environment_detail(), _dmi_indicates_vm(), _dmi_product_name_vm(), _is_container(), _is_vm() (+12 more)

### Community 12 - "Community 12"
Cohesion: 0.12
Nodes (9): NewAudit(), Register(), SavedViewsPage(), StartScan(), SignInForm(), Brand(), Empty(), Shell() (+1 more)

### Community 13 - "Community 13"
Cohesion: 0.20
Nodes (14): EMPTY_FORM, formatDate(), getInitials(), UsersPage(), createUser(), deleteUser(), disableUser(), enableUser() (+6 more)

### Community 14 - "Community 14"
Cohesion: 0.11
Nodes (17): dependencies, next, react, react-dom, devDependencies, eslint, eslint-config-next, name (+9 more)

### Community 15 - "Community 15"
Cohesion: 0.12
Nodes (17): artifacts, Core tables, Key fields, knowledgebase_articles, knowledgebase_categories, one_time_audits, remediation_item_activity, remediation_item_comments (+9 more)

### Community 16 - "Community 16"
Cohesion: 0.12
Nodes (16): 1) Copy/paste Hermes prompt, 2) QA checklist, 3) Issue log template, 4) Loop discipline, 5) Suggested review order, 6) Acceptance bar, 7) Short prompt version, App-level checks (+8 more)

### Community 17 - "Community 17"
Cohesion: 0.20
Nodes (16): ALL_VIEW_SLUGS, FailedScansView(), formatTime(), getJson(), HighFindingsView(), readableText(), RecentlyCompletedView(), remediationText() (+8 more)

### Community 18 - "Community 18"
Cohesion: 0.12
Nodes (15): 1. Clone the repository, 2. Configure environment values, 3. Validate the Compose model, 4. Start Shore Sentinel, 5. Check service health, 6. Stop the stack, Install from GitHub with Docker, Option A: Manual command-line update, recommended default (+7 more)

### Community 19 - "Community 19"
Cohesion: 0.13
Nodes (15): Archon Protocol visibility and approval layer, Branch and release model, CI/CD target state, Database migration rules, Docker validation checklist, Feature flags, Feature Update and DevOps Release Workflow, Kanban basis (+7 more)

### Community 20 - "Community 20"
Cohesion: 0.13
Nodes (14): 10) Rollback readiness, 11) Closeout, 1) Intake and scope, 2) Product and design review, 3) Kanban and planning, 4) Implementation, 5.5) Final QA gate (Athena), 5) Validation (+6 more)

### Community 21 - "Community 21"
Cohesion: 0.39
Nodes (14): config_path(), env_path(), _fallback_yaml(), file_mode(), get(), hermes_bin(), load_yaml(), main() (+6 more)

### Community 22 - "Community 22"
Cohesion: 0.16
Nodes (9): Audits(), Machine(), Inventory(), RemediationDetail(), Scans(), apiGet(), publicApiBase(), serverApiBase() (+1 more)

### Community 23 - "Community 23"
Cohesion: 0.22
Nodes (13): ENV_VALUES, FILTER_DEFAULTS, filterAudits(), filterFindings(), filterRuns(), FINDING_STATUS_VALUES, normalizeSeverity(), parseTimeRangeParam() (+5 more)

### Community 24 - "Community 24"
Cohesion: 0.14
Nodes (13): Approval request format, Archon Protocol Telegram Coordination Policy, Delivery rules, Do not send to Archon Protocol, Mention rule, Operating rules, Purpose, Scope (+5 more)

### Community 25 - "Community 25"
Cohesion: 0.15
Nodes (12): compilerOptions, emitDecoratorMetadata, esModuleInterop, experimentalDecorators, module, moduleResolution, outDir, rootDir (+4 more)

### Community 26 - "Community 26"
Cohesion: 0.15
Nodes (12): 1. Web UI — Next.js, Component Breakdown, Conclusion, Decisions Captured, Executive Summary, Flow, Full Dockerized System Diagram, Intent (+4 more)

### Community 27 - "Community 27"
Cohesion: 0.15
Nodes (12): 1) Run the self-check, 2) Review the outputs, 3) Interpret the exit code, 4) Know the guardrails, Agent Security Self-Check, Frameworks and control lenses used, How framework mapping is applied, How the script works (+4 more)

### Community 28 - "Community 28"
Cohesion: 0.15
Nodes (12): Added, Changed, Changelog, Fixed, Fixed, Security, v0.3.0 - 2026-06-25, v0.3.1 - 2026-06-26 (+4 more)

### Community 29 - "Community 29"
Cohesion: 0.24
Nodes (8): applyPreferences(), DisplayPreferencesPanel(), readStoredPreferences(), describeDisplayPreferences(), DISPLAY_PREFERENCE_DEFAULTS, DISPLAY_PREFERENCE_OPTIONS, normalizeChoice(), normalizeDisplayPreferences()

### Community 30 - "Community 30"
Cohesion: 0.17
Nodes (11): dependencies, bullmq, ioredis, @shore-sentinel/shared, name, private, scripts, start (+3 more)

### Community 31 - "Community 31"
Cohesion: 0.18
Nodes (11): 2. Backend API — Node.js, 3. Node Orchestrator Worker, 4. Python Data/AI Worker, 5. PostgreSQL, 6. Redis, 7. MinIO / Artifact Storage, Recommended changes, UI/UX Review and Simplification Plan (+3 more)

### Community 32 - "Community 32"
Cohesion: 0.18
Nodes (11): Analytics and notifications, API Surface Overview, Artifacts and reports, Auth and settings, Jobs and runs, Knowledgebase and how-to articles, Logs, alert rules, and email delivery, Managed machines, targets, and environments (+3 more)

### Community 33 - "Community 33"
Cohesion: 0.18
Nodes (10): Bug report section, Current behavior, Desired behavior, Feature request section, Implementation notes, Request metadata, Review and approval, Shore Sentinel Change Request Form (+2 more)

### Community 34 - "Community 34"
Cohesion: 0.27
Nodes (10): collect_hardware_info(), _fallback_memory_info(), _fallback_network_adapters(), _human_readable_bytes(), Any, Hardware data collection module for the agent security selfcheck.  Collects CPU,, Convert bytes to a human-readable string (e.g. '1.2 GB')., Return best-effort memory stats without psutil. (+2 more)

### Community 35 - "Community 35"
Cohesion: 0.18
Nodes (11): minLength, type, name, scanner, version, additionalProperties, properties, required (+3 more)

### Community 36 - "Community 36"
Cohesion: 0.20
Nodes (6): Login(), metadata, RootLayout(), Landing(), getAuthenticatedUser(), serverApiBase()

### Community 37 - "Community 37"
Cohesion: 0.20
Nodes (10): format, type, const, properties, collectedAt, contractVersion, target, additionalProperties (+2 more)

### Community 38 - "Community 38"
Cohesion: 0.20
Nodes (7): Audit(), audits, byId(), machines, navItems, remediations, reports

### Community 39 - "Community 39"
Cohesion: 0.22
Nodes (8): Changelog, v0.1.0, v0.1.1, v0.3.5, v0.3.6, v0.3.7, v0.3.8, v0.3.9

### Community 40 - "Community 40"
Cohesion: 0.36
Nodes (8): authPageToApi, basePath(), config, homeUrl(), isPublicPath(), middleware(), PUBLIC_PATH_PREFIXES, withoutBasePath()

### Community 41 - "Community 41"
Cohesion: 0.22
Nodes (7): failures, landing, loginPage, nextConfig, root, routes, source

### Community 42 - "Community 42"
Cohesion: 0.25
Nodes (8): MVP Phases, Phase 0: Repository and Docker skeleton, Phase 1: Core inventory, auth, app entry paths, and knowledgebase foundation, Phase 2: One-time audit and SSH push scan vertical slice, Phase 3: Artifact processing and report viewer, Phase 4: Dashboard, status monitoring, scheduling, and informational notifications, Phase 5: Pull-agent/check-in support, Phase 6: Hardening and scale

### Community 43 - "Community 43"
Cohesion: 0.25
Nodes (8): minLength, type, type, type, assetId, hostname, ip, properties

### Community 44 - "Community 44"
Cohesion: 0.57
Nodes (6): CompletedProcess, has_socket_access(), main(), run(), run_compose_via_sg(), user_in_group()

### Community 45 - "Community 45"
Cohesion: 0.29
Nodes (7): Authentication, roles, and permissions, Baseline role permission matrix, Control plane, Data plane, Key principles, Recommended Architecture, Scanner bundle contract

### Community 46 - "Community 46"
Cohesion: 0.29
Nodes (7): Core controls, MVP local authentication requirements, MVP sealed-secret requirements, Owner decisions reflected, Security goals, Security Model and Threat Boundaries, Trust boundaries

### Community 47 - "Community 47"
Cohesion: 0.29
Nodes (6): additionalProperties, $id, required, $schema, title, type

### Community 48 - "Community 48"
Cohesion: 0.43
Nodes (6): Dashboard(), formatDate(), pct(), severityOrder, severityTone, statusLabel()

### Community 49 - "Community 49"
Cohesion: 0.33
Nodes (5): Bootstrap behavior, Health expectations, Local Compose runbook, Shore Sentinel docs, Validation commands

### Community 50 - "Community 50"
Cohesion: 0.33
Nodes (5): exports, name, private, type, version

### Community 51 - "Community 51"
Cohesion: 0.33
Nodes (5): description, $id, $schema, title, type

### Community 52 - "Community 52"
Cohesion: 0.33
Nodes (5): Bundle manifest, Canonical artifact flow, Lifecycle and retry behavior, Runtime interface, Shore Sentinel scanner bundle contract

### Community 53 - "Community 53"
Cohesion: 0.33
Nodes (6): items, type, additionalProperties, required, type, findings

### Community 54 - "Community 54"
Cohesion: 0.40
Nodes (4): Shore Sentinel Product Roadmap Release Notes, User-facing changes, v0.3.0 - Product-roadmap epic release, Validation expectations

### Community 55 - "Community 55"
Cohesion: 0.40
Nodes (5): Core product capabilities, Mode 1: Run One-Time Audit, Mode 2: Add Managed Machine, Product Logic and Operating Modes, Promotion path

### Community 56 - "Community 56"
Cohesion: 0.40
Nodes (5): Docker Compose services for MVP, Docker Deployment Topology, MVP runtime requirements, Production evolution, Runtime characteristics

### Community 57 - "Community 57"
Cohesion: 0.80
Nodes (4): err(), log(), need(), shore-sentinel-update.sh script

### Community 58 - "Community 58"
Cohesion: 0.40
Nodes (3): SavedViewSlugPage(), STATIC_SLUGS, VIEW_TITLES

### Community 59 - "Community 59"
Cohesion: 0.70
Nodes (4): artifactDescription(), artifactLabel(), renderFinding(), Report()

### Community 61 - "Community 61"
Cohesion: 0.40
Nodes (4): compilerOptions, baseUrl, paths, @/*

### Community 62 - "Community 62"
Cohesion: 0.80
Nodes (4): applyUpdate(), checkUpdate(), parseResponse(), publicApiBase()

### Community 63 - "Community 63"
Cohesion: 0.50
Nodes (4): Core metrics, Dashboard / Analytics Model, MVP analytics decision, Recommended charts

### Community 64 - "Community 64"
Cohesion: 0.50
Nodes (4): Error handling, Flow, Report Ingestion and Artifact Flow, Supported artifacts

### Community 65 - "Community 65"
Cohesion: 0.50
Nodes (4): Flow, Intent, Notes, SSH Push Flow

### Community 66 - "Community 66"
Cohesion: 0.67
Nodes (3): Canonical job, run, and artifact path, Chosen Technology Stack, Important stack decision

### Community 67 - "Community 67"
Cohesion: 0.67
Nodes (3): MVP Definition, MVP excludes, MVP includes

### Community 68 - "Community 68"
Cohesion: 0.67
Nodes (3): Offline Resilience Best Practice, Pull-agent behavior, SSH push behavior

## Knowledge Gaps
- **420 isolated node(s):** `name`, `version`, `private`, `type`, `build` (+415 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **11 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `routePath()` connect `Community 12` to `Community 4`, `Community 38`, `Community 71`, `Community 48`, `Community 17`, `Community 22`, `Community 58`, `Community 29`?**
  _High betweenness centrality (0.015) - this node is a cross-community bridge._
- **Why does `AppController` connect `Community 1` to `Community 0`, `Community 5`?**
  _High betweenness centrality (0.010) - this node is a cross-community bridge._
- **Why does `Shore Sentinel Control Plane Architecture Proposal` connect `Community 26` to `Community 32`, `Community 64`, `Community 66`, `Community 67`, `Community 68`, `Community 65`, `Community 42`, `Community 45`, `Community 46`, `Community 15`, `Community 19`, `Community 55`, `Community 56`, `Community 31`, `Community 63`?**
  _High betweenness centrality (0.008) - this node is a cross-community bridge._
- **Are the 26 inferred relationships involving `routePath()` (e.g. with `Audit()` and `NewAudit()`) actually correct?**
  _`routePath()` has 26 INFERRED edges - model-reasoned connections that need verification._
- **What connects `name`, `version`, `private` to the rest of the system?**
  _441 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.05478750640040963 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.10752688172043011 - nodes in this community are weakly interconnected._