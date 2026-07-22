# Agent Security Selfcheck v3.5.0 implementation plan

## Approval and boundary

- Initial Aegis decision: approve with conditions; final independent release approval remains required after corrective controls.
- Scope: scanner correctness, evidence provenance, fail-closed coverage, contract integrity, and regression validation.
- Preserve `Agent_Security_Selfcheck_v3.4.0.py` unchanged as the rollback/reference baseline.
- Do not modify target application code, production Compose files, deployment scripts, credentials, host configuration, remediation tooling, API/UI behavior, or add new framework adapters.
- Work in the isolated release candidate worktree; do not commit or push until final independent approval.

## Compatibility decision

Retain the existing managed-machine contract version `shore-sentinel.scanner-output/v1` for v3.5. Add backward-compatible top-level metadata and finding extensions. The canonical output must validate directly against the existing schema after the schema is extended. The Node worker and Python parser must preserve the new fields and reject malformed/incomplete security-relevant output.

## Vertical implementation slices (TDD)

### Slice 1 — Versioned entrypoint and canonical envelope

- Add `scanner-bundle/bin/Agent_Security_Selfcheck_v3.5.0.py` from the v3.4 baseline without changing v3.4.
- Add canonical `contractVersion`, `scanner`, `target`, `findings`, `collectedAt`, `coverage`, and `decision` output fields.
- Add deterministic scanner version/path metadata.
- First write tests that fail because v3.5 entrypoint/envelope is absent; then implement and run the bundle smoke test.

### Slice 2 — Exact scope and coverage accounting

- Treat `--target` as authoritative by default; provide explicit legacy discovery mode only if required.
- Record effective root, scope mode, include/exclude classes, file counts, unreadable paths, parse failures, truncation, and symlink decisions.
- Remove silent first-N behavior or convert limits into explicit incomplete coverage.
- Ensure incomplete security-relevant coverage cannot return a clean decision.

### Slice 3 — Host/target and Compose evidence

- Separate `host_runtime`, `target_source`, `target_runtime`, and `external/unknown` evidence.
- Detect active Compose, override, profile, development, example, update-example, and documentation contexts.
- Host Docker socket presence alone must remain informational.
- Add positive and negative fixtures for active mounts, example mounts, profiles, and documentation snippets.

### Slice 4 — Structured secrets and self-exclusion

- Classify literal secrets, environment references, placeholders, fixtures, documentation examples, redacted values, scanner patterns, and unknown values.
- Never emit matched secret values.
- Use canonical path-scoped self-exclusion for scanner source/reference artifacts and record exclusions.
- Add fixtures proving similar application filenames remain in scope.

### Slice 5 — Evidence model and correlation

- Add stable deterministic finding IDs, scope, confidence, reachability, evidence kind, source path/line, configuration state, and derived relationships.
- Correlate only compatible same-scope high-confidence findings.
- Do not double-count parent findings or derive Critical from lexical/low-confidence matches.
- Add deterministic-order and correlation fixtures.

### Slice 6 — Worker/parser preservation

- Update `workers/worker-node/src/scannerRunner.js` to use the v3.5 entrypoint and preserve canonical fields without positional fallback IDs.
- Update `workers/worker-python/src/parser.py` to preserve scope/confidence/reachability/evidence fields and reject invalid contract/coverage state.
- Add Node and Python regression tests before implementation changes.

### Slice 7 — Bundle contract, fixtures, and release metadata

- Extend `scanner-output.schema.json`, `scanner-manifest.schema.json` if needed, and `examples/sample-output.json`.
- Update `scripts/validate_scanner_bundle.py` to validate generated JSON, schema, manifest/sample consistency, SARIF structure, artifact set, redaction, version path, and coverage gates.
- Update scanner README/docs/version history and root/package scanner commands.
- Keep remediation tooling unchanged.

## Required verification gates

1. Python compilation for scanner, helpers, validator, and tests.
2. `python3 scripts/validate_phase0.py`.
3. Enhanced `python3 scripts/validate_scanner_bundle.py`.
4. Scope fixtures: no parent-root expansion, no symlink escape, unreadable/truncated paths reported, incomplete scan fails closed.
5. Compose fixtures: active/example/profile/override and host/target separation.
6. Secret fixtures: literal/reference/placeholder/fixture/documentation/redacted/self-reference.
7. Self-exclusion fixtures: scanner source/docs/reports excluded only where intended.
8. Correlation fixtures: stable IDs, deterministic ordering, same-scope/high-confidence gating.
9. Contract preservation through scanner output, Node adapter, and Python parser.
10. `npm --workspace @shore-sentinel/worker-node test`.
11. Python worker/parser tests.
12. `npm run check`.
13. Read-only behavior check: no target mutation, installation, remediation, cron/config change, or uncontrolled target subprocess.
14. Clean worktree, recorded SHA256, commit, policy version, scope, coverage result, and retained fixture evidence.
15. Independent implementation review followed by Athena QA/release verification.

## Release rule

Do not create or publish a v3.5.0 release tag until every gate passes and the final artifact hashes and review approvals are recorded. If a gate fails, retain v3.4.0 as the available rollback/reference baseline.
