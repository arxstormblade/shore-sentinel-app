-- Enterprise authorization primitives. Additive and rollback-compatible.
CREATE TABLE IF NOT EXISTS engagements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  name text NOT NULL,
  owner_team text NOT NULL,
  scope jsonb NOT NULL DEFAULT '{}'::jsonb,
  budget jsonb NOT NULL DEFAULT '{}'::jsonb,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (jsonb_typeof(scope) = 'object'),
  CHECK (jsonb_typeof(budget) = 'object')
);
CREATE TABLE IF NOT EXISTS engagement_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  engagement_id uuid NOT NULL REFERENCES engagements(id) ON DELETE CASCADE,
  approver_id uuid NOT NULL REFERENCES users(id),
  approval_role text NOT NULL,
  approved_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  UNIQUE (engagement_id, approver_id, approval_role)
);
CREATE TABLE IF NOT EXISTS policy_bundles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  version text NOT NULL,
  bundle_hash text NOT NULL CHECK (bundle_hash ~ '^[a-f0-9]{64}$'),
  signer text NOT NULL,
  active boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, version)
);
CREATE TABLE IF NOT EXISTS workload_identities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES tenants(id),
  identity text NOT NULL UNIQUE,
  audience text NOT NULL,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS execution_authorizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  engagement_id uuid NOT NULL REFERENCES engagements(id),
  policy_bundle_id uuid NOT NULL REFERENCES policy_bundles(id),
  run_id uuid REFERENCES scan_runs(id),
  scope jsonb NOT NULL DEFAULT '{}'::jsonb,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (jsonb_typeof(scope) = 'object')
);
CREATE INDEX IF NOT EXISTS engagements_active_idx ON engagements(tenant_id, expires_at) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS execution_authorizations_active_idx ON execution_authorizations(tenant_id, expires_at) WHERE revoked_at IS NULL;
