-- Enterprise identity, durable sessions, and authorization gates.
-- Additive migration: existing accounts and runs remain readable during rollback.
CREATE TABLE IF NOT EXISTS auth_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_token_hash text NOT NULL UNIQUE CHECK (session_token_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  idle_expires_at timestamptz NOT NULL,
  absolute_expires_at timestamptz NOT NULL,
  mfa_verified_at timestamptz,
  step_up_at timestamptz,
  user_agent text,
  ip_address inet,
  device_id text,
  revoked_at timestamptz,
  revoked_reason text,
  revoked_by uuid REFERENCES users(id),
  CHECK (absolute_expires_at >= idle_expires_at)
);
CREATE INDEX IF NOT EXISTS auth_sessions_user_idx ON auth_sessions(tenant_id, user_id, revoked_at);
CREATE TABLE IF NOT EXISTS auth_throttles (
  key text PRIMARY KEY,
  window_started_at timestamptz NOT NULL,
  failures integer NOT NULL DEFAULT 0 CHECK (failures >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS mfa_factors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  factor_type text NOT NULL CHECK (factor_type IN ('totp','webauthn')),
  secret_ciphertext text,
  secret_key_version text,
  enrolled_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  revoked_at timestamptz,
  UNIQUE (tenant_id, user_id, factor_type)
);
CREATE TABLE IF NOT EXISTS identity_provider_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  provider_type text NOT NULL CHECK (provider_type IN ('oidc','saml')),
  issuer text NOT NULL,
  audience text NOT NULL,
  jwks_uri text,
  metadata_uri text,
  enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, provider_type)
);
CREATE TABLE IF NOT EXISTS user_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, name)
);
CREATE UNIQUE INDEX IF NOT EXISTS users_tenant_id_id_uq ON users(tenant_id, id);
CREATE TABLE IF NOT EXISTS user_group_members (
  group_id uuid NOT NULL REFERENCES user_groups(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  PRIMARY KEY (group_id, user_id),
  FOREIGN KEY (tenant_id, user_id) REFERENCES users(tenant_id, id)
);
CREATE TABLE IF NOT EXISTS service_identities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  audience text NOT NULL,
  certificate_fingerprint text,
  revoked_at timestamptz,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, name)
);

ALTER TABLE engagements ADD COLUMN IF NOT EXISTS owner_authorized boolean NOT NULL DEFAULT false;
ALTER TABLE execution_authorizations ADD COLUMN IF NOT EXISTS policy_hash text;
ALTER TABLE execution_authorizations ADD COLUMN IF NOT EXISTS authorization_state text NOT NULL DEFAULT 'active';
ALTER TABLE execution_authorizations ADD COLUMN IF NOT EXISTS consumed_at timestamptz;
ALTER TABLE execution_authorizations ADD COLUMN IF NOT EXISTS workload_identity text;
ALTER TABLE execution_authorizations ADD COLUMN IF NOT EXISTS revocation_reason text;
ALTER TABLE policy_bundles ADD COLUMN IF NOT EXISTS published_by uuid REFERENCES users(id);
ALTER TABLE policy_bundles ADD COLUMN IF NOT EXISTS signature text;
CREATE TABLE IF NOT EXISTS policy_simulations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  policy_bundle_id uuid REFERENCES policy_bundles(id),
  engagement_id uuid REFERENCES engagements(id),
  requested_scope jsonb NOT NULL DEFAULT '{}'::jsonb,
  allowed boolean NOT NULL,
  reason text,
  simulated_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS policy_simulations_scope_idx ON policy_simulations(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS execution_authorizations_grant_idx ON execution_authorizations(tenant_id, run_id, authorization_state, expires_at);

-- Break-glass actions are explicit, time-bounded, and never mutate the normal role grant.
CREATE TABLE IF NOT EXISTS break_glass_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  actor_user_id uuid REFERENCES users(id),
  reason text NOT NULL,
  ticket_reference text NOT NULL,
  expires_at timestamptz NOT NULL,
  ended_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
