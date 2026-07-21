-- Append-only evidence and findings read model primitives.
CREATE TABLE IF NOT EXISTS evidence_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  run_id uuid REFERENCES scan_runs(id),
  sequence bigint NOT NULL,
  event_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  previous_hash text,
  event_hash text NOT NULL CHECK (event_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, run_id, sequence)
);
CREATE TABLE IF NOT EXISTS provenance_manifests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  run_id uuid NOT NULL REFERENCES scan_runs(id),
  image_digest text NOT NULL,
  bundle_hash text NOT NULL,
  parser_version text NOT NULL,
  manifest_hash text NOT NULL CHECK (manifest_hash ~ '^[a-f0-9]{64}$'),
  retention_expires_at timestamptz,
  legal_hold boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, run_id)
);
CREATE TABLE IF NOT EXISTS finding_read_models (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  finding_instance_id uuid NOT NULL REFERENCES finding_instances(id) ON DELETE CASCADE,
  severity text NOT NULL,
  status text NOT NULL,
  title text NOT NULL,
  evidence_hash text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, finding_instance_id)
);
CREATE INDEX IF NOT EXISTS evidence_events_run_sequence_idx ON evidence_events(tenant_id, run_id, sequence);
CREATE INDEX IF NOT EXISTS finding_read_models_status_idx ON finding_read_models(tenant_id, status, severity);
