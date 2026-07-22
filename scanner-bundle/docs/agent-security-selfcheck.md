# Agent Security Self-Check

## What this script does

`Agent_Security_Selfcheck_v3.5.0.py` is a **portable, read-only security auditor** for AI agent meshes that can use tools, schedule work, delegate to subagents, and influence application delivery. v3.4.0 remains available as the rollback/reference baseline.

From the live source, the script:

- Discovers the target repo/runtime context before scanning.
- Activates only the adapters that apply to the target:
  - `core` — generic agent-project checks
  - `runtime` — runtime/config checks when an agent runtime is detected
  - `framework` — framework-specific checks when framework markers are detected
- Stays validation-only:
  - no remediation
  - no package installs
  - no config mutation
  - no cron changes
  - no secret printing
- Reviews posture across these categories:
  - Framework Discovery
  - Access Control
  - Execution & Approvals
  - Secrets & Privacy
  - Prompt Injection Defenses
  - Tools / Plugins / MCP
  - Agent Mesh / Subagents
  - Persistence & Deployment
  - Container & Runtime
  - Supply Chain
  - Risk Correlation
- Produces findings with:
  - status (`PASS`, `WARN`, `FAIL`, `SKIP`)
  - risk level (`Info`, `Low`, `Medium`, `High`, `Critical`)
  - evidence
  - recommendation
  - mapped control IDs
  - an inline remediation task suggestion
- Generates four report formats:
  - JSON
  - Markdown
  - SARIF 2.1.0
  - PDF

## Shore Sentinel integration

This scanner remains the portable source bundle that Shore Sentinel consumes.

- Shore Sentinel packages the scanner into its `scanner-bundle/` directory.
- Shore Sentinel stores generated reports in MinIO through its Dockerized control plane.
- The legacy scripts tree remains the source/history area unless a specific file is intentionally promoted into the app.
- The scanner stays read-only and does not depend on the Shore Sentinel UI or backend at runtime.

## How the script works

At a high level, the script:

1. Finds the effective repo root and inventories relevant files.
2. Detects whether an agent runtime and/or framework surface is present.
3. Runs deterministic static checks against files, configs, metadata, and runtime posture.
4. Avoids reading secret-file contents directly; secret-file handling is metadata-only.
5. Redacts secret-like values from captured evidence.
6. Correlates compound risks across findings.
7. Scores categories, assigns an overall grade, and writes reports.

`--scope-mode exact` is the fail-closed default and scans only the authoritative `--target` tree; it does not make host-runtime claims. Use `--scope-mode runtime` or `full` when host/runtime evidence is explicitly in scope. Use repeatable `--compose-file path/to/file.yml` to mark a development, override, or profile-controlled Compose file as explicitly selected and active for exposure classification.

## Frameworks and control lenses used

The live `FRAMEWORKS_USED` list in the script includes:

- Agent security guide
- OWASP Top 10 for LLM Applications
- OWASP Agentic AI threat lens
- NIST AI RMF 1.0
- NIST SP 800-53 / 800-171
- CIS Controls v8
- SOC 2 Trust Services Criteria
- ISO/IEC 27001, 27002, and 42001
- MITRE ATLAS
- SLSA / SSDF supply-chain practices

## How framework mapping is applied

The script does not just list frameworks globally. It also maps each named check to specific control references through `FRAMEWORK_CONTROLS`.

Examples from the live source:

- `Agent instruction boundaries present`
  - `OWASP-LLM-A1`
  - `ATLAS-AML.T0051`
  - `NIST-SI-10`
- `Runtime approvals reviewed`
  - `OWASP-AGT-A2`
  - `NIST-AC-3`
  - `CIS-v8-6.3`
- `MCP/plugin inventory reviewed`
  - `OWASP-LLM-A3`
  - `OWASP-LLM-A6`
  - `NIST-CM-8`
- `Container image hardening reviewed`
  - `CIS-Docker-4`
  - `NIST-CM-7`
  - `CSA-CCC`
- `CI/CD workflows reviewed`
  - `SLSA-L2`
  - `SSDF-PW.7.2`
  - `CIS-v8-16.11`
- `Compound mesh risk correlated`
  - `NIST-SI-4`
  - `OWASP-AGT-A1`

In practice, that means each finding is already tied to a control lens that can be used for audit review, remediation planning, or executive reporting.

## Quick How To

### 1) Run the self-check

From this directory or by absolute path:

```bash
python3 Agent_Security_Selfcheck_v3.5.0.py --target /path/to/target-repo --scope-mode exact
```

Optional output directory:

```bash
python3 Agent_Security_Selfcheck_v3.5.0.py \
  --target /path/to/target-repo \
  --scope-mode exact \
  --out-dir ./reports
```

If you want report generation without a non-zero exit code:

```bash
python3 Agent_Security_Selfcheck_v3.5.0.py \
  --target /path/to/target-repo \
  --out-dir ./reports \
  --exit-zero
```

### 2) Review the outputs

Each run writes:

- `*.json` — structured machine-readable findings
- `*.md` — executive summary and detailed findings
- `*.sarif` — security-tooling interchange format for pipelines
- `*.pdf` — presentation-ready audit report

### 3) Interpret the exit code

From the live source:

- `0` — no `FAIL`, and no `WARN` with `High` or `Critical` risk
- `1` — at least one `WARN` with `High` or `Critical` risk
- `2` — at least one `FAIL`
- `--exit-zero` overrides the above and always returns `0`

### 4) Know the guardrails

This script is designed to be safe for validation runs because it is read-only.

It does **not**:

- remediate findings
- install scanners automatically
- mutate config
- change cron/scheduled jobs
- print discovered secret values

## Live CLI usage verified

The current script help output exposes these flags:

- `--target`
- `--out-dir`
- `--scope-mode {exact,discover,runtime,full}`
- `--runtime-root`
- `--compose-file` (repeatable)
- `--exit-zero`
