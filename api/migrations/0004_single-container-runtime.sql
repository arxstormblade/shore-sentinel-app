-- Single-container runtime identity and readiness state.
CREATE TABLE IF NOT EXISTS migration_runtime_identity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  image_digest text NOT NULL,
  config_hash text NOT NULL,
  applied_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS supervisor_process_health (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  process_name text NOT NULL,
  state text NOT NULL CHECK (state IN ('starting','ready','degraded','stopped','failed')),
  pid integer,
  sample jsonb NOT NULL DEFAULT '{}'::jsonb,
  sampled_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS deployment_readiness (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  state text NOT NULL CHECK (state IN ('starting','ready','degraded','not_ready')),
  reason text,
  image_digest text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS supervisor_process_health_latest_idx ON supervisor_process_health(process_name, sampled_at DESC);
CREATE INDEX IF NOT EXISTS deployment_readiness_latest_idx ON deployment_readiness(created_at DESC);

-- Seed only non-secret platform metadata. Password hashes are created by an explicit bootstrap flow,
-- never recomputed as part of API startup.
INSERT INTO tenants (slug, name) VALUES ('shore360', 'Shore360') ON CONFLICT (slug) DO NOTHING;
INSERT INTO roles (name, description) VALUES
  ('admin', 'Full platform administration'),
  ('operator', 'Day-to-day security operations'),
  ('analyst', 'Review, triage, and reporting'),
  ('viewer', 'Read-only oversight')
ON CONFLICT (name) DO NOTHING;
INSERT INTO settings (tenant_id, app_version, default_artifact_retention_days)
SELECT id, '1.1.0', 90 FROM tenants WHERE slug = 'shore360'
ON CONFLICT (tenant_id) DO NOTHING;
INSERT INTO retention_policies (tenant_id, name, retention_days, is_default)
SELECT id, 'Default 90 days', 90, true FROM tenants WHERE slug = 'shore360'
ON CONFLICT DO NOTHING;
INSERT INTO environments (tenant_id, name, slug, description)
SELECT id, 'Production', 'production', 'Default production environment' FROM tenants WHERE slug = 'shore360'
ON CONFLICT (tenant_id, slug) DO NOTHING;
INSERT INTO knowledgebase_categories (tenant_id, name, slug, description, sort_order)
SELECT id, 'Getting Started', 'getting-started', 'Operator guides for audit and managed-machine workflows', 10 FROM tenants WHERE slug = 'shore360'
ON CONFLICT (tenant_id, slug) DO NOTHING;
