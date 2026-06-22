# Shore Sentinel scanner bundle

The scanner bundle is now included in this repository so Shore Sentinel is portable as one app. It contains:

- `bin/Agent_Security_Selfcheck_v3.4.0.py` — portable read-only scanner entrypoint.
- `bin/envdetect.py` — runtime/container/VM environment detection helper.
- `bin/hardware_collection.py` — hardware/resource inventory helper.
- `tools/ARX_Agent_Security_Remediation.py` — separate dry-run remediation planner/applier. It is not run automatically and requires explicit approval flags to apply changes.
- `schemas/` — scanner manifest/output contracts consumed by workers.
- `examples/sample-output.json` — example scanner payload.
- `docs/` — scanner usage and version history copied from the source scanner bundle.

## Portable scanner usage

From the repository root:

```bash
python3 scanner-bundle/bin/Agent_Security_Selfcheck_v3.4.0.py \
  --target /path/to/target \
  --out-dir scanner-bundle/reports \
  --exit-zero
```

For this app itself:

```bash
npm run scanner:run
```

The scanner is validation-only. It does not install packages, mutate configuration, remediate findings, change cron jobs, or print secret values.

Generated reports are written to `scanner-bundle/reports/` and are ignored by Git by default.

## Validation

The bundle is verified by:

```bash
npm run scanner:validate
```

`npm run check` includes scanner bundle validation, so a missing scanner file breaks the standard release gate.

## Runtime interface

The Node orchestrator creates a BullMQ job on `shore-sentinel.scan.jobs`. A job carries:

- `runId`: canonical run identifier owned by the API.
- `scannerOutput`: JSON emitted by the scanner bundle.
- optional `target` and `metadata` fields for scheduling context.

The bundle output must match `schemas/scanner-output.schema.json` and use `contractVersion: shore-sentinel.scanner-output/v1`. See `examples/sample-output.json`.

## Canonical artifact flow

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
