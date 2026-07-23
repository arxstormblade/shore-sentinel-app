# Shore Sentinel scanner bundle contract

The scanner bundle is a packaged scanner plus a stable JSON contract consumed by `worker-node` and `worker-python` for managed-machine scans. It can also be pulled from GitHub and run directly for a one-time local audit.

Workers must treat the bundle as an untrusted producer: validate the manifest, parse stdout JSON, then hand artifacts to the API. Workers must not write directly to MinIO/S3.

---

## One-time local audit from GitHub

Use this mode when a client needs a standalone evidence package without enrolling the machine into Shore Sentinel managed monitoring.

Until v3.5.1 is promoted, clone the reviewed default branch (or an approved immutable commit SHA). The release tag is created only at promotion after CI, security review, QA evidence, and staged rollback validation are approved; do not use an uncreated tag in installation instructions.

```bash
git clone --depth 1 https://github.com/arxstormblade/shore-sentinel-app.git
cd shore-sentinel-app
python3 scanner-bundle/bin/Agent_Security_Selfcheck_v3.5.1.py \
  --target . \
  --scope-mode exact \
  --out-dir ./shore-sentinel-local-audit-reports \
  --exit-zero
```

Reports and artifacts remain local on the client machine:

```text
./shore-sentinel-local-audit-reports
```

The local audit path does not create a managed target, does not store SSH credentials, and does not upload artifacts to Shore Sentinel by default. Treat the output folder as sensitive evidence because reports may include hostnames, inventory, versions, findings, and remediation guidance.

---

## Bundle manifest

Each bundle includes `scanner-manifest.json` matching `schemas/scanner-manifest.schema.json`:

```json
{
  "contractVersion": "shore-sentinel.scanner-bundle/v1",
  "bundle": { "name": "agent-security-selfcheck", "version": "3.5.1" },
  "entrypoint": "bin/Agent_Security_Selfcheck_v3.5.1.py",
  "outputSchema": "shore-sentinel.scanner-output/v1",
  "requiredEnv": []
}
```

## Runtime interface for managed-machine scans

The Node orchestrator creates a BullMQ job on `shore-sentinel.scan.jobs`. A job carries:

- `runId`: canonical run identifier owned by the API.
- `scannerOutput`: JSON emitted by the scanner bundle.
- optional `target` and `metadata` fields for scheduling context.

The bundle output must match `schemas/scanner-output.schema.json` and use `contractVersion: shore-sentinel.scanner-output/v1`. v3.5 adds compatible `coverage`, `decision`, scope, confidence, reachability, evidence-kind, and stable finding-ID fields. See `examples/sample-output.json`.

`--target` is exact and authoritative by default. Use `--scope-mode discover` only when parent Git-root discovery is explicitly approved. Host/runtime evidence requires `--scope-mode runtime|full` or an explicit `--runtime-root`.

## Canonical managed-machine artifact flow

1. `worker-node` claims the queue job and emits lifecycle events to `POST /runs/:runId/events`.
2. `worker-node` sends scanner output to `worker-python` at `POST /parse`.
3. `worker-python` normalizes findings and returns `normalizedFindings` plus `enrichmentSummary`.
4. `worker-node` uploads all artifacts to `POST /artifacts` on the API:
   - `scanner.raw_output`
   - `scanner.normalized_findings`
   - `scanner.enrichment_summary`
5. API owns later persistence to object storage. Workers do not receive MinIO credentials and never write direct object storage paths.

## Lifecycle and retry behavior

Jobs move through these statuses: `queued`, `claimed`, `running`, `parsing`, `artifact_uploading`, `succeeded`, `retrying`, `failed`. BullMQ retries use exponential backoff configured by `WORKER_MAX_ATTEMPTS` and `WORKER_BACKOFF_MS`; every retry/failure is emitted as a run event.
