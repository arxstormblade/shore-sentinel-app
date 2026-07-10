--
-- PostgreSQL database dump
--

\restrict oRvOTmHhQUIu8sKJ8D2HNoQkMoaon3Zm6T5DCELkQtef8ihIhkGwAeKO50mPKdd

-- Dumped from database version 16.14
-- Dumped by pg_dump version 16.14

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: pgcrypto; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;


--
-- Name: EXTENSION pgcrypto; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION pgcrypto IS 'cryptographic functions';


--
-- Name: artifact_parse_status; Type: TYPE; Schema: public; Owner: shore_sentinel
--

CREATE TYPE public.artifact_parse_status AS ENUM (
    'uploaded',
    'processing',
    'ready',
    'failed',
    'quarantined'
);


ALTER TYPE public.artifact_parse_status OWNER TO shore_sentinel;

--
-- Name: artifact_type; Type: TYPE; Schema: public; Owner: shore_sentinel
--

CREATE TYPE public.artifact_type AS ENUM (
    'json',
    'markdown',
    'sarif',
    'pdf',
    'scanner.raw_output',
    'scanner.normalized_findings',
    'scanner.enrichment_summary'
);


ALTER TYPE public.artifact_type OWNER TO shore_sentinel;

--
-- Name: connection_mode; Type: TYPE; Schema: public; Owner: shore_sentinel
--

CREATE TYPE public.connection_mode AS ENUM (
    'ssh_push',
    'pull_checkin',
    'both',
    'temporary_runner'
);


ALTER TYPE public.connection_mode OWNER TO shore_sentinel;

--
-- Name: role_name; Type: TYPE; Schema: public; Owner: shore_sentinel
--

CREATE TYPE public.role_name AS ENUM (
    'admin',
    'operator',
    'analyst',
    'viewer'
);


ALTER TYPE public.role_name OWNER TO shore_sentinel;

--
-- Name: scan_job_status; Type: TYPE; Schema: public; Owner: shore_sentinel
--

CREATE TYPE public.scan_job_status AS ENUM (
    'queued',
    'leased',
    'running',
    'completed',
    'failed',
    'cancelled'
);


ALTER TYPE public.scan_job_status OWNER TO shore_sentinel;

--
-- Name: scan_run_status; Type: TYPE; Schema: public; Owner: shore_sentinel
--

CREATE TYPE public.scan_run_status AS ENUM (
    'pending',
    'leased',
    'running',
    'completed',
    'failed',
    'stale',
    'cancelled'
);


ALTER TYPE public.scan_run_status OWNER TO shore_sentinel;

--
-- Name: subject_type; Type: TYPE; Schema: public; Owner: shore_sentinel
--

CREATE TYPE public.subject_type AS ENUM (
    'managed_target',
    'one_time_audit'
);


ALTER TYPE public.subject_type OWNER TO shore_sentinel;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: alert_rules; Type: TABLE; Schema: public; Owner: shore_sentinel
--

CREATE TABLE public.alert_rules (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    event_type text NOT NULL,
    enabled boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.alert_rules OWNER TO shore_sentinel;

--
-- Name: artifacts; Type: TABLE; Schema: public; Owner: shore_sentinel
--

CREATE TABLE public.artifacts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    run_id uuid NOT NULL,
    artifact_type public.artifact_type NOT NULL,
    storage_uri text NOT NULL,
    sha256 text NOT NULL,
    mime_type text,
    size_bytes bigint NOT NULL,
    parse_status public.artifact_parse_status DEFAULT 'uploaded'::public.artifact_parse_status,
    retention_policy_id uuid,
    retention_expires_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT artifacts_sha256_check CHECK ((sha256 ~ '^[a-f0-9]{64}$'::text)),
    CONSTRAINT artifacts_size_bytes_check CHECK ((size_bytes > 0))
);


ALTER TABLE public.artifacts OWNER TO shore_sentinel;

--
-- Name: audit_log; Type: TABLE; Schema: public; Owner: shore_sentinel
--

CREATE TABLE public.audit_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    actor_user_id uuid,
    action text NOT NULL,
    resource_type text NOT NULL,
    resource_id uuid,
    ip_address inet,
    user_agent text,
    payload jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.audit_log OWNER TO shore_sentinel;

--
-- Name: credentials; Type: TABLE; Schema: public; Owner: shore_sentinel
--

CREATE TABLE public.credentials (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    label text NOT NULL,
    credential_type text NOT NULL,
    sealed_secret text NOT NULL,
    fingerprint text,
    disabled_at timestamp with time zone,
    last_used_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.credentials OWNER TO shore_sentinel;

--
-- Name: dashboard_summaries; Type: TABLE; Schema: public; Owner: shore_sentinel
--

CREATE TABLE public.dashboard_summaries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    summary_date date DEFAULT CURRENT_DATE,
    metrics jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.dashboard_summaries OWNER TO shore_sentinel;

--
-- Name: environments; Type: TABLE; Schema: public; Owner: shore_sentinel
--

CREATE TABLE public.environments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    description text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.environments OWNER TO shore_sentinel;

--
-- Name: finding_instances; Type: TABLE; Schema: public; Owner: shore_sentinel
--

CREATE TABLE public.finding_instances (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    finding_id uuid NOT NULL,
    run_id uuid NOT NULL,
    target_id uuid,
    one_time_audit_id uuid,
    status text DEFAULT 'open'::text,
    evidence_summary text,
    source_artifact_id uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.finding_instances OWNER TO shore_sentinel;

--
-- Name: findings; Type: TABLE; Schema: public; Owner: shore_sentinel
--

CREATE TABLE public.findings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    scanner_finding_id text NOT NULL,
    title text NOT NULL,
    category text,
    severity text NOT NULL,
    description text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT findings_severity_check CHECK ((severity = ANY (ARRAY['critical'::text, 'high'::text, 'medium'::text, 'low'::text, 'informational'::text])))
);


ALTER TABLE public.findings OWNER TO shore_sentinel;

--
-- Name: job_events; Type: TABLE; Schema: public; Owner: shore_sentinel
--

CREATE TABLE public.job_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    job_id uuid,
    run_id uuid,
    event_type text NOT NULL,
    message text NOT NULL,
    progress_percent integer,
    payload jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT job_events_progress_percent_check CHECK (((progress_percent IS NULL) OR ((progress_percent >= 0) AND (progress_percent <= 100))))
);


ALTER TABLE public.job_events OWNER TO shore_sentinel;

--
-- Name: knowledgebase_articles; Type: TABLE; Schema: public; Owner: shore_sentinel
--

CREATE TABLE public.knowledgebase_articles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    category_id uuid,
    slug text NOT NULL,
    title text NOT NULL,
    summary text,
    body_markdown text NOT NULL,
    audience text DEFAULT 'all'::text,
    status text DEFAULT 'published'::text,
    tags text[] DEFAULT '{}'::text[],
    created_by uuid,
    updated_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    published_at timestamp with time zone
);


ALTER TABLE public.knowledgebase_articles OWNER TO shore_sentinel;

--
-- Name: knowledgebase_categories; Type: TABLE; Schema: public; Owner: shore_sentinel
--

CREATE TABLE public.knowledgebase_categories (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    description text,
    sort_order integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.knowledgebase_categories OWNER TO shore_sentinel;

--
-- Name: notification_email_templates; Type: TABLE; Schema: public; Owner: shore_sentinel
--

CREATE TABLE public.notification_email_templates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    event_type text NOT NULL,
    subject_template text NOT NULL,
    body_template text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.notification_email_templates OWNER TO shore_sentinel;

--
-- Name: notification_events; Type: TABLE; Schema: public; Owner: shore_sentinel
--

CREATE TABLE public.notification_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    event_type text NOT NULL,
    target_id uuid,
    run_id uuid,
    delivery_state text DEFAULT 'pending'::text,
    payload jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.notification_events OWNER TO shore_sentinel;

--
-- Name: one_time_audits; Type: TABLE; Schema: public; Owner: shore_sentinel
--

CREATE TABLE public.one_time_audits (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    display_name text NOT NULL,
    hostname text,
    ip_address inet,
    requested_by uuid,
    status text DEFAULT 'draft'::text,
    connection_mode public.connection_mode DEFAULT 'ssh_push'::public.connection_mode,
    retention_policy_id uuid,
    promoted_target_id uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT one_time_audits_connection_mode_check CHECK ((connection_mode = ANY (ARRAY['ssh_push'::public.connection_mode, 'temporary_runner'::public.connection_mode])))
);


ALTER TABLE public.one_time_audits OWNER TO shore_sentinel;

--
-- Name: remediation_items; Type: TABLE; Schema: public; Owner: shore_sentinel
--

CREATE TABLE public.remediation_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    finding_instance_id uuid NOT NULL,
    source text DEFAULT 'scanner_generated'::text,
    priority text,
    category text,
    title text NOT NULL,
    action text,
    file_path text,
    instructions text,
    status text DEFAULT 'open'::text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT remediation_items_status_check CHECK ((status = ANY (ARRAY['open'::text, 'accepted'::text, 'ignored'::text, 'resolved'::text])))
);


ALTER TABLE public.remediation_items OWNER TO shore_sentinel;

--
-- Name: retention_policies; Type: TABLE; Schema: public; Owner: shore_sentinel
--

CREATE TABLE public.retention_policies (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    name text NOT NULL,
    retention_days integer NOT NULL,
    is_default boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT retention_policies_retention_days_check CHECK ((retention_days = ANY (ARRAY[90, 120, 360])))
);


ALTER TABLE public.retention_policies OWNER TO shore_sentinel;

--
-- Name: role_feature_permissions; Type: TABLE; Schema: public; Owner: shore_sentinel
--

CREATE TABLE public.role_feature_permissions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    role_id uuid NOT NULL,
    feature_area text NOT NULL,
    can_read boolean DEFAULT false,
    can_add boolean DEFAULT false,
    can_edit boolean DEFAULT false,
    can_delete boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.role_feature_permissions OWNER TO shore_sentinel;

--
-- Name: roles; Type: TABLE; Schema: public; Owner: shore_sentinel
--

CREATE TABLE public.roles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name public.role_name NOT NULL,
    description text NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.roles OWNER TO shore_sentinel;

--
-- Name: scan_jobs; Type: TABLE; Schema: public; Owner: shore_sentinel
--

CREATE TABLE public.scan_jobs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    subject_type public.subject_type NOT NULL,
    target_id uuid,
    one_time_audit_id uuid,
    requested_by uuid,
    mode public.connection_mode NOT NULL,
    status public.scan_job_status DEFAULT 'queued'::public.scan_job_status,
    priority integer DEFAULT 50,
    scheduled_at timestamp with time zone,
    started_at timestamp with time zone,
    completed_at timestamp with time zone,
    timeout_seconds integer DEFAULT 1800,
    scanner_version text,
    retry_count integer DEFAULT 0,
    next_retry_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT scan_jobs_exactly_one_subject CHECK ((((subject_type = 'managed_target'::public.subject_type) AND (target_id IS NOT NULL) AND (one_time_audit_id IS NULL)) OR ((subject_type = 'one_time_audit'::public.subject_type) AND (target_id IS NULL) AND (one_time_audit_id IS NOT NULL)))),
    CONSTRAINT scan_jobs_mode_check CHECK ((mode = ANY (ARRAY['ssh_push'::public.connection_mode, 'pull_checkin'::public.connection_mode, 'temporary_runner'::public.connection_mode])))
);


ALTER TABLE public.scan_jobs OWNER TO shore_sentinel;

--
-- Name: scan_runs; Type: TABLE; Schema: public; Owner: shore_sentinel
--

CREATE TABLE public.scan_runs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    job_id uuid NOT NULL,
    subject_type public.subject_type NOT NULL,
    target_id uuid,
    one_time_audit_id uuid,
    status public.scan_run_status DEFAULT 'pending'::public.scan_run_status,
    exit_code integer,
    started_at timestamp with time zone,
    completed_at timestamp with time zone,
    duration_seconds integer,
    runtime_context jsonb DEFAULT '{}'::jsonb,
    agent_identity text,
    lease_owner text,
    lease_expires_at timestamp with time zone,
    heartbeat_at timestamp with time zone,
    app_version text,
    scanner_bundle_version text,
    scanner_script_sha256 text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT scan_runs_exactly_one_subject CHECK ((((subject_type = 'managed_target'::public.subject_type) AND (target_id IS NOT NULL) AND (one_time_audit_id IS NULL)) OR ((subject_type = 'one_time_audit'::public.subject_type) AND (target_id IS NULL) AND (one_time_audit_id IS NOT NULL))))
);


ALTER TABLE public.scan_runs OWNER TO shore_sentinel;

--
-- Name: schedules; Type: TABLE; Schema: public; Owner: shore_sentinel
--

CREATE TABLE public.schedules (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    target_id uuid NOT NULL,
    schedule_type text NOT NULL,
    cron_expression text NOT NULL,
    timezone text DEFAULT 'Asia/Manila'::text,
    enabled boolean DEFAULT true,
    next_run_at timestamp with time zone,
    last_run_at timestamp with time zone,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT schedules_schedule_type_check CHECK ((schedule_type = ANY (ARRAY['scan'::text, 'report'::text])))
);


ALTER TABLE public.schedules OWNER TO shore_sentinel;

--
-- Name: settings; Type: TABLE; Schema: public; Owner: shore_sentinel
--

CREATE TABLE public.settings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    app_version text DEFAULT '0.1.0'::text,
    default_artifact_retention_days integer DEFAULT 90,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT settings_default_artifact_retention_days_check CHECK ((default_artifact_retention_days = ANY (ARRAY[90, 120, 360])))
);


ALTER TABLE public.settings OWNER TO shore_sentinel;

--
-- Name: smtp_settings; Type: TABLE; Schema: public; Owner: shore_sentinel
--

CREATE TABLE public.smtp_settings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    host text,
    port integer,
    encryption_mode text,
    username text,
    sealed_password text,
    from_address text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.smtp_settings OWNER TO shore_sentinel;

--
-- Name: target_group_members; Type: TABLE; Schema: public; Owner: shore_sentinel
--

CREATE TABLE public.target_group_members (
    target_group_id uuid NOT NULL,
    target_id uuid NOT NULL
);


ALTER TABLE public.target_group_members OWNER TO shore_sentinel;

--
-- Name: target_groups; Type: TABLE; Schema: public; Owner: shore_sentinel
--

CREATE TABLE public.target_groups (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.target_groups OWNER TO shore_sentinel;

--
-- Name: target_identities; Type: TABLE; Schema: public; Owner: shore_sentinel
--

CREATE TABLE public.target_identities (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    target_id uuid NOT NULL,
    device_id text NOT NULL,
    device_cert_fingerprint text,
    token_hash text,
    enrollment_status text DEFAULT 'active'::text,
    last_seen_at timestamp with time zone,
    revoked_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.target_identities OWNER TO shore_sentinel;

--
-- Name: target_status_checks; Type: TABLE; Schema: public; Owner: shore_sentinel
--

CREATE TABLE public.target_status_checks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    target_id uuid NOT NULL,
    status text NOT NULL,
    source text NOT NULL,
    checked_at timestamp with time zone DEFAULT now(),
    details jsonb DEFAULT '{}'::jsonb
);


ALTER TABLE public.target_status_checks OWNER TO shore_sentinel;

--
-- Name: targets; Type: TABLE; Schema: public; Owner: shore_sentinel
--

CREATE TABLE public.targets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    asset_mode text DEFAULT 'managed_machine'::text,
    hostname text NOT NULL,
    fqdn text,
    ip_address inet,
    environment_id uuid,
    owner_team text,
    platform text,
    status text DEFAULT 'unknown'::text,
    connection_mode public.connection_mode DEFAULT 'ssh_push'::public.connection_mode,
    monitoring_enabled boolean DEFAULT true,
    schedule_enabled boolean DEFAULT false,
    last_seen_at timestamp with time zone,
    last_status_check_at timestamp with time zone,
    last_successful_scan_at timestamp with time zone,
    promoted_from_audit_id uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT targets_connection_mode_check CHECK ((connection_mode = ANY (ARRAY['ssh_push'::public.connection_mode, 'pull_checkin'::public.connection_mode, 'both'::public.connection_mode])))
);


ALTER TABLE public.targets OWNER TO shore_sentinel;

--
-- Name: tenants; Type: TABLE; Schema: public; Owner: shore_sentinel
--

CREATE TABLE public.tenants (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    slug text NOT NULL,
    name text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.tenants OWNER TO shore_sentinel;

--
-- Name: user_roles; Type: TABLE; Schema: public; Owner: shore_sentinel
--

CREATE TABLE public.user_roles (
    user_id uuid NOT NULL,
    role_id uuid NOT NULL
);


ALTER TABLE public.user_roles OWNER TO shore_sentinel;

--
-- Name: users; Type: TABLE; Schema: public; Owner: shore_sentinel
--

CREATE TABLE public.users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    email text NOT NULL,
    display_name text NOT NULL,
    password_hash text NOT NULL,
    disabled_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.users OWNER TO shore_sentinel;

--
-- Data for Name: alert_rules; Type: TABLE DATA; Schema: public; Owner: shore_sentinel
--

COPY public.alert_rules (id, tenant_id, event_type, enabled, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: artifacts; Type: TABLE DATA; Schema: public; Owner: shore_sentinel
--

COPY public.artifacts (id, tenant_id, run_id, artifact_type, storage_uri, sha256, mime_type, size_bytes, parse_status, retention_policy_id, retention_expires_at, created_at) FROM stdin;
6d15a4e6-b919-49ef-a346-c61d0dfe169c	6ef432c6-1e42-44ef-98f3-d8073b66e030	d79ee89b-6382-4439-88b2-88ad807b30ed	scanner.raw_output	api://worker-handoff/d79ee89b-6382-4439-88b2-88ad807b30ed/scanner.raw_output/75ed2d6bb9c50c2c8f13780cc126fda99de6da44420cb0a92c108d5ecca36c82	75ed2d6bb9c50c2c8f13780cc126fda99de6da44420cb0a92c108d5ecca36c82	application/json	321	uploaded	\N	2026-09-20 03:41:33.04066+00	2026-06-22 03:41:33.04066+00
4004be18-1d1b-4e2d-bb08-8948be4e5bd7	6ef432c6-1e42-44ef-98f3-d8073b66e030	950b86f4-df0a-4357-b127-1e97948972ae	scanner.raw_output	api://worker-handoff/950b86f4-df0a-4357-b127-1e97948972ae/scanner.raw_output/172fc33888f386c553caac70dec5f680911aa7d985b5bc1d615dc7cd4c6a63b6	172fc33888f386c553caac70dec5f680911aa7d985b5bc1d615dc7cd4c6a63b6	application/json	321	uploaded	\N	2026-09-20 03:41:33.048194+00	2026-06-22 03:41:33.048194+00
b7b23910-3726-44ca-a8fd-85bc2d70943a	6ef432c6-1e42-44ef-98f3-d8073b66e030	d79ee89b-6382-4439-88b2-88ad807b30ed	scanner.normalized_findings	api://worker-handoff/d79ee89b-6382-4439-88b2-88ad807b30ed/scanner.normalized_findings/4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945	4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945	application/json	2	uploaded	\N	2026-09-20 03:41:33.051918+00	2026-06-22 03:41:33.051918+00
3c4f290a-bef5-4df1-b0ca-3a1490a60f07	6ef432c6-1e42-44ef-98f3-d8073b66e030	950b86f4-df0a-4357-b127-1e97948972ae	scanner.normalized_findings	api://worker-handoff/950b86f4-df0a-4357-b127-1e97948972ae/scanner.normalized_findings/4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945	4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945	application/json	2	uploaded	\N	2026-09-20 03:41:33.054417+00	2026-06-22 03:41:33.054417+00
d5a615ac-920d-4de7-bedc-01222e301b8a	6ef432c6-1e42-44ef-98f3-d8073b66e030	d79ee89b-6382-4439-88b2-88ad807b30ed	scanner.enrichment_summary	api://worker-handoff/d79ee89b-6382-4439-88b2-88ad807b30ed/scanner.enrichment_summary/a67dea10c2c5e6a0efc854a74f872f713b4c06edd8705922426a190542efa119	a67dea10c2c5e6a0efc854a74f872f713b4c06edd8705922426a190542efa119	application/json	400	uploaded	\N	2026-09-20 03:41:33.057627+00	2026-06-22 03:41:33.057627+00
5c81081a-4b18-4e2c-a987-8154f4cf8e88	6ef432c6-1e42-44ef-98f3-d8073b66e030	950b86f4-df0a-4357-b127-1e97948972ae	scanner.enrichment_summary	api://worker-handoff/950b86f4-df0a-4357-b127-1e97948972ae/scanner.enrichment_summary/d05869a58f532ced78a98133b140a2d89c2e68eceb6e748f1e5fedfea3e432fc	d05869a58f532ced78a98133b140a2d89c2e68eceb6e748f1e5fedfea3e432fc	application/json	400	uploaded	\N	2026-09-20 03:41:33.061242+00	2026-06-22 03:41:33.061242+00
\.


--
-- Data for Name: audit_log; Type: TABLE DATA; Schema: public; Owner: shore_sentinel
--

COPY public.audit_log (id, tenant_id, actor_user_id, action, resource_type, resource_id, ip_address, user_agent, payload, created_at) FROM stdin;
7a9c7926-e79a-4bf9-85c6-3a89d0228532	6ef432c6-1e42-44ef-98f3-d8073b66e030	\N	auth.login_failure	user	\N	\N	\N	{"email": "admin@shore360.local"}	2026-06-19 17:23:45.894631+00
54e0fc95-4e49-405e-be0e-a0a7eacbcaf7	6ef432c6-1e42-44ef-98f3-d8073b66e030	f3d8e703-9b08-4072-a6fe-8cb5f666be47	auth.register_success	user	f3d8e703-9b08-4072-a6fe-8cb5f666be47	\N	\N	{"email": "qa-1781889825@example.test"}	2026-06-19 17:23:46.119761+00
caacbde6-3686-4a32-9263-0b9616775f9c	6ef432c6-1e42-44ef-98f3-d8073b66e030	8fe3f571-abc3-4c3d-9180-a83034730c49	auth.register_success	user	8fe3f571-abc3-4c3d-9180-a83034730c49	\N	\N	{"email": "qa-1781889939@example.test"}	2026-06-19 17:25:39.729559+00
ec024d27-a2e8-4d2e-91ab-c86b973a8839	6ef432c6-1e42-44ef-98f3-d8073b66e030	8fe3f571-abc3-4c3d-9180-a83034730c49	auth.login_success	user	8fe3f571-abc3-4c3d-9180-a83034730c49	\N	\N	{}	2026-06-19 17:25:39.950389+00
5dbd4b8d-687b-4caf-a4a8-4b2b565e8ed9	6ef432c6-1e42-44ef-98f3-d8073b66e030	6224f376-bcd4-4e9f-a4d9-01992f163296	auth.register_success	user	6224f376-bcd4-4e9f-a4d9-01992f163296	\N	\N	{"email": "qa-1781914807@example.test"}	2026-06-20 00:20:08.170603+00
2660d3a5-7731-4d56-8cd9-cde324c1edea	6ef432c6-1e42-44ef-98f3-d8073b66e030	6224f376-bcd4-4e9f-a4d9-01992f163296	auth.login_success	user	6224f376-bcd4-4e9f-a4d9-01992f163296	\N	\N	{}	2026-06-20 00:20:08.468743+00
a8c7d09d-0a69-4168-861c-05d40b487a27	6ef432c6-1e42-44ef-98f3-d8073b66e030	dd2a7598-29db-4e14-9e59-3ad03bd5a440	auth.register_success	user	dd2a7598-29db-4e14-9e59-3ad03bd5a440	\N	\N	{"email": "direct-1781914825@example.test"}	2026-06-20 00:20:25.728694+00
c8e87f03-a036-44dd-a4df-23db06f566ae	6ef432c6-1e42-44ef-98f3-d8073b66e030	1f97e87b-6e8a-447f-a781-93985e251f72	auth.register_success	user	1f97e87b-6e8a-447f-a781-93985e251f72	\N	\N	{"email": "proxy-1781914825@example.test"}	2026-06-20 00:20:25.955832+00
39970e34-6a3a-4970-818f-ad5cedd06d78	6ef432c6-1e42-44ef-98f3-d8073b66e030	4565c614-8a5f-4a6b-961d-9082e3289c9d	auth.register_success	user	4565c614-8a5f-4a6b-961d-9082e3289c9d	\N	\N	{"email": "proxy2-1781914825@example.test"}	2026-06-20 00:20:26.180424+00
482e44e3-0342-46d7-858c-2bd09087e970	6ef432c6-1e42-44ef-98f3-d8073b66e030	c2c4bc1c-6144-4273-878b-b80b12e1f79c	auth.register_success	user	c2c4bc1c-6144-4273-878b-b80b12e1f79c	\N	\N	{"email": "direct-1781914875@example.test"}	2026-06-20 00:21:15.573432+00
7b29192e-20d4-49b2-8cd6-1f95e743fa1b	6ef432c6-1e42-44ef-98f3-d8073b66e030	5027fc1f-29d8-43a1-984c-31e0ad5215e8	auth.register_success	user	5027fc1f-29d8-43a1-984c-31e0ad5215e8	\N	\N	{"email": "proxy-1781914875@example.test"}	2026-06-20 00:21:15.797196+00
38cabdc2-6fcf-4200-ad54-a27168d1366f	6ef432c6-1e42-44ef-98f3-d8073b66e030	a663d4f9-68f7-43a2-97c2-997fd7b9c7c3	auth.register_success	user	a663d4f9-68f7-43a2-97c2-997fd7b9c7c3	\N	\N	{"email": "urllib-1781914894@example.test"}	2026-06-20 00:21:35.062983+00
0d377cce-43a1-4251-b579-22d7e01603d9	6ef432c6-1e42-44ef-98f3-d8073b66e030	00b7f035-a18c-4a06-a8ba-a5757560404a	auth.register_success	user	00b7f035-a18c-4a06-a8ba-a5757560404a	\N	\N	{"email": "host-1781916115@example.test"}	2026-06-20 00:41:55.763478+00
d513315f-d1f3-47d1-b4ca-355691850e7e	6ef432c6-1e42-44ef-98f3-d8073b66e030	bcef08c9-fea3-4fe0-8f1f-698160a14a6b	auth.register_success	user	bcef08c9-fea3-4fe0-8f1f-698160a14a6b	\N	\N	{"email": "proxy-fixed-1781916226@example.test"}	2026-06-20 00:43:46.529683+00
799466cd-f5cd-41a5-985d-d1af70dbf849	6ef432c6-1e42-44ef-98f3-d8073b66e030	bcef08c9-fea3-4fe0-8f1f-698160a14a6b	auth.login_success	user	bcef08c9-fea3-4fe0-8f1f-698160a14a6b	\N	\N	{}	2026-06-20 00:43:46.736558+00
8ea9a446-4097-4305-b3a5-55ffbccb93a6	6ef432c6-1e42-44ef-98f3-d8073b66e030	c97d47cc-54c7-4f0e-9046-d185d25e2c53	auth.register_success	user	c97d47cc-54c7-4f0e-9046-d185d25e2c53	\N	\N	{"email": "qa-tailnet-1781916246@example.test"}	2026-06-20 00:44:06.278467+00
096e5fc3-e233-4700-a9eb-7c7e94838cff	6ef432c6-1e42-44ef-98f3-d8073b66e030	c97d47cc-54c7-4f0e-9046-d185d25e2c53	auth.login_success	user	c97d47cc-54c7-4f0e-9046-d185d25e2c53	\N	\N	{}	2026-06-20 00:44:06.48755+00
4bfb2595-b1be-4f54-aadf-de4c397ed8ea	6ef432c6-1e42-44ef-98f3-d8073b66e030	c74196bf-ddd6-4344-8a33-215877b60105	auth.register_success	user	c74196bf-ddd6-4344-8a33-215877b60105	\N	\N	{"email": "qa-1781916803@example.test"}	2026-06-20 00:53:23.937551+00
402354e6-c982-4850-b7dd-688f4e95b6c6	6ef432c6-1e42-44ef-98f3-d8073b66e030	c74196bf-ddd6-4344-8a33-215877b60105	auth.login_success	user	c74196bf-ddd6-4344-8a33-215877b60105	\N	\N	{}	2026-06-20 00:53:24.171371+00
d0eb0773-44e9-44da-8ae2-d4d85943c482	6ef432c6-1e42-44ef-98f3-d8073b66e030	39688a15-57da-4684-bb57-386c9a511f4f	auth.register_success	user	39688a15-57da-4684-bb57-386c9a511f4f	\N	\N	{"email": "qa-1781920327@example.test"}	2026-06-20 01:52:07.709633+00
53610b6b-bc31-461e-ad7e-a5a751c788ec	6ef432c6-1e42-44ef-98f3-d8073b66e030	39688a15-57da-4684-bb57-386c9a511f4f	auth.login_success	user	39688a15-57da-4684-bb57-386c9a511f4f	\N	\N	{}	2026-06-20 01:52:07.967065+00
280556e8-3dbc-4280-b177-cf3609a8111a	6ef432c6-1e42-44ef-98f3-d8073b66e030	0ab0e667-683e-4c2e-95cb-1f3cb24ac8c7	auth.register_success	user	0ab0e667-683e-4c2e-95cb-1f3cb24ac8c7	\N	\N	{"email": "qa-1781920466@example.test"}	2026-06-20 01:54:26.451215+00
d9170e02-507f-48c8-bf50-2e71471267eb	6ef432c6-1e42-44ef-98f3-d8073b66e030	0ab0e667-683e-4c2e-95cb-1f3cb24ac8c7	auth.login_success	user	0ab0e667-683e-4c2e-95cb-1f3cb24ac8c7	\N	\N	{}	2026-06-20 01:54:26.69398+00
54c21be4-7cdc-4a17-8c6b-9532a28ed272	6ef432c6-1e42-44ef-98f3-d8073b66e030	af5fc0e3-0cd1-4797-a637-503285a07ba1	auth.register_success	user	af5fc0e3-0cd1-4797-a637-503285a07ba1	\N	\N	{"email": "qa-1781921157@example.test"}	2026-06-20 02:05:57.48794+00
59acc91a-3a4d-4615-a9a2-e83702c55c31	6ef432c6-1e42-44ef-98f3-d8073b66e030	\N	auth.login_failure	user	\N	\N	\N	{"email": "admin@shore360.local"}	2026-06-20 02:05:57.725687+00
9592a800-039f-4dd2-bea8-b751e7f7db49	6ef432c6-1e42-44ef-98f3-d8073b66e030	491787d6-bc49-4269-9906-df88d8c6c538	auth.register_success	user	491787d6-bc49-4269-9906-df88d8c6c538	\N	\N	{"email": "direct-1781921158@example.test"}	2026-06-20 02:05:59.168416+00
21850932-6664-4a58-b229-082378adfe9c	6ef432c6-1e42-44ef-98f3-d8073b66e030	ed8dbbbd-be78-48c5-a25f-b477be44664f	auth.register_success	user	ed8dbbbd-be78-48c5-a25f-b477be44664f	\N	\N	{"email": "direct-api-1781921159@example.test"}	2026-06-20 02:05:59.392816+00
eeb40635-0b97-4d85-a63a-1bcebb99a423	6ef432c6-1e42-44ef-98f3-d8073b66e030	03b1ee7b-7174-46f8-bc10-4076f00e3f6d	auth.register_success	user	03b1ee7b-7174-46f8-bc10-4076f00e3f6d	\N	\N	{"email": "browser-regression-1781922090@example.test"}	2026-06-20 02:21:30.880643+00
2ca270db-3a57-4b97-a459-dc7ad60dec5a	6ef432c6-1e42-44ef-98f3-d8073b66e030	03b1ee7b-7174-46f8-bc10-4076f00e3f6d	auth.login_success	user	03b1ee7b-7174-46f8-bc10-4076f00e3f6d	\N	\N	{}	2026-06-20 02:21:31.12644+00
64f5c690-d037-4ccb-a8af-b77bd8d89acb	6ef432c6-1e42-44ef-98f3-d8073b66e030	d350c588-2490-4f4b-b503-34a6f00c8993	auth.register_success	user	d350c588-2490-4f4b-b503-34a6f00c8993	\N	\N	{"email": "final-click-1781922565@example.test"}	2026-06-20 02:29:26.156139+00
650781b5-25cb-4800-b345-b45197a60215	6ef432c6-1e42-44ef-98f3-d8073b66e030	d350c588-2490-4f4b-b503-34a6f00c8993	auth.login_success	user	d350c588-2490-4f4b-b503-34a6f00c8993	\N	\N	{}	2026-06-20 02:29:26.380964+00
8c4ae95e-f330-402e-8a16-e50f10d79744	6ef432c6-1e42-44ef-98f3-d8073b66e030	91b94599-a248-42e1-b6f3-61f859f9180e	auth.register_success	user	91b94599-a248-42e1-b6f3-61f859f9180e	\N	\N	{"email": "final-click2-1781922631@example.test"}	2026-06-20 02:30:31.878817+00
8ac1b302-d6af-4270-9227-c8132258ae0a	6ef432c6-1e42-44ef-98f3-d8073b66e030	91b94599-a248-42e1-b6f3-61f859f9180e	auth.login_success	user	91b94599-a248-42e1-b6f3-61f859f9180e	\N	\N	{}	2026-06-20 02:30:32.102424+00
d7cf6b89-dbb2-4ed7-b1ea-6459f8c8840a	6ef432c6-1e42-44ef-98f3-d8073b66e030	b0fd262b-c401-4361-80a5-dff5be191690	auth.register_success	user	b0fd262b-c401-4361-80a5-dff5be191690	\N	\N	{"email": "ernel.a@shore360.com"}	2026-06-20 02:33:53.58224+00
f6ecd6ed-9a12-4bdf-b681-8e7b18868758	6ef432c6-1e42-44ef-98f3-d8073b66e030	3703bd44-04e3-4131-8408-92287458b944	auth.register_success	user	3703bd44-04e3-4131-8408-92287458b944	\N	\N	{"email": "port3010-1781926252@example.test"}	2026-06-20 03:30:52.549989+00
f47e0161-6fa1-4dc4-862b-255e03a0fa51	6ef432c6-1e42-44ef-98f3-d8073b66e030	3703bd44-04e3-4131-8408-92287458b944	auth.login_success	user	3703bd44-04e3-4131-8408-92287458b944	\N	\N	{}	2026-06-20 03:30:52.776078+00
74bbd3bc-3f4d-4564-ad88-995b341374c9	6ef432c6-1e42-44ef-98f3-d8073b66e030	b0fd262b-c401-4361-80a5-dff5be191690	auth.login_success	user	b0fd262b-c401-4361-80a5-dff5be191690	\N	\N	{}	2026-06-21 16:24:52.469688+00
68e19b4b-3106-459e-9beb-a6feb9927d49	6ef432c6-1e42-44ef-98f3-d8073b66e030	756ee3c1-d06a-4384-96d1-7a3f1d9697bc	auth.register_success	user	756ee3c1-d06a-4384-96d1-7a3f1d9697bc	\N	\N	{"email": "client-exc-1782059095@example.test"}	2026-06-21 16:24:55.818387+00
26a42e2e-4f8c-4112-997e-f6c6ed7a7a40	6ef432c6-1e42-44ef-98f3-d8073b66e030	b0fd262b-c401-4361-80a5-dff5be191690	auth.login_success	user	b0fd262b-c401-4361-80a5-dff5be191690	\N	\N	{}	2026-06-21 16:25:18.757753+00
aa988ada-3a3a-4e97-aabe-4a03e26136be	6ef432c6-1e42-44ef-98f3-d8073b66e030	d81d019a-5ee2-4c04-852f-c6167d3185d3	auth.register_success	user	d81d019a-5ee2-4c04-852f-c6167d3185d3	\N	\N	{"email": "client-fix2-1782060010@example.test"}	2026-06-21 16:40:10.677919+00
c3030b7a-e120-41cd-864e-1f4cda891fbb	6ef432c6-1e42-44ef-98f3-d8073b66e030	d81d019a-5ee2-4c04-852f-c6167d3185d3	auth.login_success	user	d81d019a-5ee2-4c04-852f-c6167d3185d3	\N	\N	{}	2026-06-21 16:40:10.896334+00
e90ccb7a-cb93-4660-9526-16ea285ef090	6ef432c6-1e42-44ef-98f3-d8073b66e030	ee2c5bb5-c211-4b8b-9fbe-5f0f99848fd6	auth.register_success	user	ee2c5bb5-c211-4b8b-9fbe-5f0f99848fd6	\N	\N	{"email": "client-final-1782060045@example.test"}	2026-06-21 16:40:45.595339+00
28a74989-f040-449d-8b0c-ecd57e9620a3	6ef432c6-1e42-44ef-98f3-d8073b66e030	ee2c5bb5-c211-4b8b-9fbe-5f0f99848fd6	auth.login_success	user	ee2c5bb5-c211-4b8b-9fbe-5f0f99848fd6	\N	\N	{}	2026-06-21 16:40:45.812881+00
73cd20fd-d42c-4797-ae8b-503b50048dd2	6ef432c6-1e42-44ef-98f3-d8073b66e030	224e4e79-93a4-4474-9832-bff3d2ee5dbc	auth.register_success	user	224e4e79-93a4-4474-9832-bff3d2ee5dbc	\N	\N	{"email": "client-final2-1782060086@example.test"}	2026-06-21 16:41:27.127269+00
b131c21c-2005-4dc9-8e72-9c563f1144ba	6ef432c6-1e42-44ef-98f3-d8073b66e030	224e4e79-93a4-4474-9832-bff3d2ee5dbc	auth.login_success	user	224e4e79-93a4-4474-9832-bff3d2ee5dbc	\N	\N	{}	2026-06-21 16:41:27.346181+00
dc67d1ac-7504-49e3-8598-ce9992be9dac	6ef432c6-1e42-44ef-98f3-d8073b66e030	6930ff9a-b7b0-45bb-ba48-e4d071ebb2ca	auth.register_success	user	6930ff9a-b7b0-45bb-ba48-e4d071ebb2ca	\N	\N	{"email": "client-fixed-1782060138@example.test"}	2026-06-21 16:42:18.89823+00
e1df6f7a-5cba-40d7-a78f-4f3e5c78e383	6ef432c6-1e42-44ef-98f3-d8073b66e030	6930ff9a-b7b0-45bb-ba48-e4d071ebb2ca	auth.login_success	user	6930ff9a-b7b0-45bb-ba48-e4d071ebb2ca	\N	\N	{}	2026-06-21 16:42:19.111128+00
cb65600d-554b-4ac9-a5f3-6bee3c14842e	6ef432c6-1e42-44ef-98f3-d8073b66e030	b143f21a-71df-4c85-94cc-53b2a9539386	auth.register_success	user	b143f21a-71df-4c85-94cc-53b2a9539386	\N	\N	{"email": "upstream-1782060627431579366@example.test"}	2026-06-21 16:50:27.656679+00
62623ff4-da6f-4a23-ac00-09c2b0803c4b	6ef432c6-1e42-44ef-98f3-d8073b66e030	1dbe53cf-499b-4da4-bff3-414fcc1a81fa	auth.register_success	user	1dbe53cf-499b-4da4-bff3-414fcc1a81fa	\N	\N	{"email": "nextaction-1782060646013149745@example.test"}	2026-06-21 16:50:46.225577+00
20d134f6-fd84-4a49-917d-6cc9bb24ebd3	6ef432c6-1e42-44ef-98f3-d8073b66e030	cfe3e9ab-7aac-4366-ba7d-dba91e0922aa	auth.register_success	user	cfe3e9ab-7aac-4366-ba7d-dba91e0922aa	\N	\N	{"email": "normal_register-1782060787944@example.test"}	2026-06-21 16:53:08.213644+00
64770d4b-e60c-4003-b940-ad9ae36472d6	6ef432c6-1e42-44ef-98f3-d8073b66e030	27917eb5-1ad2-4d30-9661-1024c3280dce	auth.register_success	user	27917eb5-1ad2-4d30-9661-1024c3280dce	\N	\N	{"email": "stale_page_register-1782060788220@example.test"}	2026-06-21 16:53:08.44816+00
4cf36eba-e766-4243-95eb-b8c48a3648f2	6ef432c6-1e42-44ef-98f3-d8073b66e030	6421579d-1971-4a5b-8eac-d6d570cf300e	auth.register_success	user	6421579d-1971-4a5b-8eac-d6d570cf300e	\N	\N	{"email": "newrepo-1782099176131@example.test"}	2026-06-22 03:32:56.430335+00
e26ae0bb-af75-401c-b061-9889c54960c1	6ef432c6-1e42-44ef-98f3-d8073b66e030	6421579d-1971-4a5b-8eac-d6d570cf300e	auth.login_success	user	6421579d-1971-4a5b-8eac-d6d570cf300e	\N	\N	{}	2026-06-22 03:32:56.72032+00
8bda3607-b1d9-4e25-914b-af5e6679cc2c	6ef432c6-1e42-44ef-98f3-d8073b66e030	91e9994a-9088-4806-9ab9-c2cd5b636458	auth.register_success	user	91e9994a-9088-4806-9ab9-c2cd5b636458	\N	\N	{"email": "stale-newrepo-1782099176131@example.test"}	2026-06-22 03:32:56.954595+00
c321bb6a-e5c5-4f17-9d13-df2814c2fd13	6ef432c6-1e42-44ef-98f3-d8073b66e030	620dedd7-b7f1-4476-bb78-f19d7ab8d02e	auth.register_success	user	620dedd7-b7f1-4476-bb78-f19d7ab8d02e	\N	\N	{"email": "boss-1782099692@example.test"}	2026-06-22 03:41:32.682072+00
d902ab08-eee4-41d1-a44b-222dd5d2426c	6ef432c6-1e42-44ef-98f3-d8073b66e030	620dedd7-b7f1-4476-bb78-f19d7ab8d02e	auth.login_success	user	620dedd7-b7f1-4476-bb78-f19d7ab8d02e	\N	\N	{}	2026-06-22 03:41:32.907901+00
\.


--
-- Data for Name: credentials; Type: TABLE DATA; Schema: public; Owner: shore_sentinel
--

COPY public.credentials (id, tenant_id, label, credential_type, sealed_secret, fingerprint, disabled_at, last_used_at, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: dashboard_summaries; Type: TABLE DATA; Schema: public; Owner: shore_sentinel
--

COPY public.dashboard_summaries (id, tenant_id, summary_date, metrics, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: environments; Type: TABLE DATA; Schema: public; Owner: shore_sentinel
--

COPY public.environments (id, tenant_id, name, slug, description, created_at, updated_at) FROM stdin;
a4faa509-c7e3-4235-9c2f-cc632619c07c	6ef432c6-1e42-44ef-98f3-d8073b66e030	Production	production	Default production environment	2026-06-19 14:21:43.93418+00	2026-06-19 14:21:43.93418+00
\.


--
-- Data for Name: finding_instances; Type: TABLE DATA; Schema: public; Owner: shore_sentinel
--

COPY public.finding_instances (id, tenant_id, finding_id, run_id, target_id, one_time_audit_id, status, evidence_summary, source_artifact_id, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: findings; Type: TABLE DATA; Schema: public; Owner: shore_sentinel
--

COPY public.findings (id, tenant_id, scanner_finding_id, title, category, severity, description, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: job_events; Type: TABLE DATA; Schema: public; Owner: shore_sentinel
--

COPY public.job_events (id, tenant_id, job_id, run_id, event_type, message, progress_percent, payload, created_at) FROM stdin;
de016b88-f095-4c60-948e-78643bc571b5	6ef432c6-1e42-44ef-98f3-d8073b66e030	9946074a-3b6d-4146-a755-77bc794de62a	d79ee89b-6382-4439-88b2-88ad807b30ed	job.queued	Scan job queued	0	{}	2026-06-22 03:41:32.950249+00
189a6f86-8a02-4234-bf13-4379da675a32	6ef432c6-1e42-44ef-98f3-d8073b66e030	a36a9c6e-c81d-4a2f-8d8a-ef30c79498e6	950b86f4-df0a-4357-b127-1e97948972ae	job.queued	Scan job queued	0	{}	2026-06-22 03:41:33.001626+00
abbcb008-570a-45be-bbe3-94cb2869290d	6ef432c6-1e42-44ef-98f3-d8073b66e030	\N	d79ee89b-6382-4439-88b2-88ad807b30ed	job.claimed	Node worker claimed scan job	\N	{"type": "job.claimed", "jobId": "1", "runId": "d79ee89b-6382-4439-88b2-88ad807b30ed", "status": "claimed", "attempt": 1, "message": "Node worker claimed scan job", "metadata": {}, "occurredAt": "2026-06-22T03:41:32.974Z"}	2026-06-22 03:41:33.005379+00
fb013a28-fa46-4a95-8994-2d34575f9519	6ef432c6-1e42-44ef-98f3-d8073b66e030	\N	d79ee89b-6382-4439-88b2-88ad807b30ed	job.running	Scan job orchestration started	\N	{"type": "job.running", "jobId": "1", "runId": "d79ee89b-6382-4439-88b2-88ad807b30ed", "status": "running", "attempt": 1, "message": "Scan job orchestration started", "metadata": {}, "occurredAt": "2026-06-22T03:41:33.009Z"}	2026-06-22 03:41:33.012584+00
e81142d1-5ef9-4e57-bba4-5d66394a8144	6ef432c6-1e42-44ef-98f3-d8073b66e030	\N	d79ee89b-6382-4439-88b2-88ad807b30ed	parse.started	Python parser requested	\N	{"type": "parse.started", "jobId": "1", "runId": "d79ee89b-6382-4439-88b2-88ad807b30ed", "status": "parsing", "attempt": 1, "message": "Python parser requested", "metadata": {}, "occurredAt": "2026-06-22T03:41:33.013Z"}	2026-06-22 03:41:33.015968+00
9a1b5407-c360-4fb4-8644-f095eb906214	6ef432c6-1e42-44ef-98f3-d8073b66e030	\N	950b86f4-df0a-4357-b127-1e97948972ae	job.claimed	Node worker claimed scan job	\N	{"type": "job.claimed", "jobId": "2", "runId": "950b86f4-df0a-4357-b127-1e97948972ae", "status": "claimed", "attempt": 1, "message": "Node worker claimed scan job", "metadata": {}, "occurredAt": "2026-06-22T03:41:33.004Z"}	2026-06-22 03:41:33.016133+00
13c576ee-cf49-44cb-89b0-e6bb85489356	6ef432c6-1e42-44ef-98f3-d8073b66e030	\N	950b86f4-df0a-4357-b127-1e97948972ae	job.running	Scan job orchestration started	\N	{"type": "job.running", "jobId": "2", "runId": "950b86f4-df0a-4357-b127-1e97948972ae", "status": "running", "attempt": 1, "message": "Scan job orchestration started", "metadata": {}, "occurredAt": "2026-06-22T03:41:33.017Z"}	2026-06-22 03:41:33.023754+00
44a3a53c-eaa2-4686-b93c-817bf44223e4	6ef432c6-1e42-44ef-98f3-d8073b66e030	\N	d79ee89b-6382-4439-88b2-88ad807b30ed	parse.succeeded	Python parser completed	\N	{"type": "parse.succeeded", "jobId": "1", "runId": "d79ee89b-6382-4439-88b2-88ad807b30ed", "status": "artifact_uploading", "attempt": 1, "message": "Python parser completed", "metadata": {"findings": 0}, "occurredAt": "2026-06-22T03:41:33.025Z"}	2026-06-22 03:41:33.02861+00
81da922d-dcb7-46c9-890b-1ab634492f46	6ef432c6-1e42-44ef-98f3-d8073b66e030	\N	950b86f4-df0a-4357-b127-1e97948972ae	parse.started	Python parser requested	\N	{"type": "parse.started", "jobId": "2", "runId": "950b86f4-df0a-4357-b127-1e97948972ae", "status": "parsing", "attempt": 1, "message": "Python parser requested", "metadata": {}, "occurredAt": "2026-06-22T03:41:33.027Z"}	2026-06-22 03:41:33.033451+00
c7d83040-9428-47a6-aaf1-401f7ba3599b	6ef432c6-1e42-44ef-98f3-d8073b66e030	\N	d79ee89b-6382-4439-88b2-88ad807b30ed	artifact.upload_requested	Uploading scanner.raw_output	\N	{"type": "artifact.upload_requested", "jobId": "1", "runId": "d79ee89b-6382-4439-88b2-88ad807b30ed", "status": "artifact_uploading", "attempt": 1, "message": "Uploading scanner.raw_output", "metadata": {}, "occurredAt": "2026-06-22T03:41:33.032Z"}	2026-06-22 03:41:33.037872+00
82dae377-3774-4e31-9601-074925a69cbd	6ef432c6-1e42-44ef-98f3-d8073b66e030	\N	950b86f4-df0a-4357-b127-1e97948972ae	parse.succeeded	Python parser completed	\N	{"type": "parse.succeeded", "jobId": "2", "runId": "950b86f4-df0a-4357-b127-1e97948972ae", "status": "artifact_uploading", "attempt": 1, "message": "Python parser completed", "metadata": {"findings": 0}, "occurredAt": "2026-06-22T03:41:33.040Z"}	2026-06-22 03:41:33.043037+00
6fa9ce1c-629b-42e0-935e-927861c425fb	6ef432c6-1e42-44ef-98f3-d8073b66e030	\N	950b86f4-df0a-4357-b127-1e97948972ae	artifact.upload_requested	Uploading scanner.raw_output	\N	{"type": "artifact.upload_requested", "jobId": "2", "runId": "950b86f4-df0a-4357-b127-1e97948972ae", "status": "artifact_uploading", "attempt": 1, "message": "Uploading scanner.raw_output", "metadata": {}, "occurredAt": "2026-06-22T03:41:33.044Z"}	2026-06-22 03:41:33.045508+00
0f41d8d3-3688-4ebc-b90a-3456fd0d47df	6ef432c6-1e42-44ef-98f3-d8073b66e030	\N	d79ee89b-6382-4439-88b2-88ad807b30ed	artifact.uploaded	scanner.raw_output artifact uploaded through API handoff	\N	{"metadata": {"contractVersion": "shore-sentinel.scanner-output/v1"}, "artifact_id": "6d15a4e6-b919-49ef-a346-c61d0dfe169c"}	2026-06-22 03:41:33.047139+00
9c1244ee-3a81-4b9f-a480-2322f1856c4a	6ef432c6-1e42-44ef-98f3-d8073b66e030	\N	d79ee89b-6382-4439-88b2-88ad807b30ed	artifact.upload_succeeded	Uploaded scanner.raw_output	\N	{"type": "artifact.upload_succeeded", "jobId": "1", "runId": "d79ee89b-6382-4439-88b2-88ad807b30ed", "status": "artifact_uploading", "attempt": 1, "message": "Uploaded scanner.raw_output", "metadata": {}, "occurredAt": "2026-06-22T03:41:33.048Z"}	2026-06-22 03:41:33.049061+00
363315ac-5e9a-4ad0-8bc0-479d7fdf909f	6ef432c6-1e42-44ef-98f3-d8073b66e030	\N	950b86f4-df0a-4357-b127-1e97948972ae	artifact.uploaded	scanner.raw_output artifact uploaded through API handoff	\N	{"metadata": {"contractVersion": "shore-sentinel.scanner-output/v1"}, "artifact_id": "4004be18-1d1b-4e2d-bb08-8948be4e5bd7"}	2026-06-22 03:41:33.04968+00
84a6d572-4756-4b8e-aaa6-dab2b8eadda4	6ef432c6-1e42-44ef-98f3-d8073b66e030	\N	d79ee89b-6382-4439-88b2-88ad807b30ed	artifact.upload_requested	Uploading scanner.normalized_findings	\N	{"type": "artifact.upload_requested", "jobId": "1", "runId": "d79ee89b-6382-4439-88b2-88ad807b30ed", "status": "artifact_uploading", "attempt": 1, "message": "Uploading scanner.normalized_findings", "metadata": {}, "occurredAt": "2026-06-22T03:41:33.049Z"}	2026-06-22 03:41:33.05035+00
cdeb9b3f-9d80-4926-99dd-44b625dcafba	6ef432c6-1e42-44ef-98f3-d8073b66e030	\N	950b86f4-df0a-4357-b127-1e97948972ae	artifact.upload_succeeded	Uploaded scanner.raw_output	\N	{"type": "artifact.upload_succeeded", "jobId": "2", "runId": "950b86f4-df0a-4357-b127-1e97948972ae", "status": "artifact_uploading", "attempt": 1, "message": "Uploaded scanner.raw_output", "metadata": {}, "occurredAt": "2026-06-22T03:41:33.050Z"}	2026-06-22 03:41:33.051001+00
498f53d9-ba66-4f7e-82a1-8f10739347b0	6ef432c6-1e42-44ef-98f3-d8073b66e030	\N	950b86f4-df0a-4357-b127-1e97948972ae	artifact.upload_requested	Uploading scanner.normalized_findings	\N	{"type": "artifact.upload_requested", "jobId": "2", "runId": "950b86f4-df0a-4357-b127-1e97948972ae", "status": "artifact_uploading", "attempt": 1, "message": "Uploading scanner.normalized_findings", "metadata": {}, "occurredAt": "2026-06-22T03:41:33.051Z"}	2026-06-22 03:41:33.052642+00
f8d68cf7-1fe3-4345-8c89-0c191899ebe4	6ef432c6-1e42-44ef-98f3-d8073b66e030	\N	d79ee89b-6382-4439-88b2-88ad807b30ed	artifact.uploaded	scanner.normalized_findings artifact uploaded through API handoff	\N	{"metadata": {"parserVersion": "0.1.0"}, "artifact_id": "b7b23910-3726-44ca-a8fd-85bc2d70943a"}	2026-06-22 03:41:33.053216+00
e6a45acd-b8ee-42f7-8e44-da1b4590af9f	6ef432c6-1e42-44ef-98f3-d8073b66e030	\N	d79ee89b-6382-4439-88b2-88ad807b30ed	artifact.upload_succeeded	Uploaded scanner.normalized_findings	\N	{"type": "artifact.upload_succeeded", "jobId": "1", "runId": "d79ee89b-6382-4439-88b2-88ad807b30ed", "status": "artifact_uploading", "attempt": 1, "message": "Uploaded scanner.normalized_findings", "metadata": {}, "occurredAt": "2026-06-22T03:41:33.054Z"}	2026-06-22 03:41:33.054706+00
4c53a11f-aa74-4c6e-993e-24b05381a549	6ef432c6-1e42-44ef-98f3-d8073b66e030	\N	950b86f4-df0a-4357-b127-1e97948972ae	artifact.uploaded	scanner.normalized_findings artifact uploaded through API handoff	\N	{"metadata": {"parserVersion": "0.1.0"}, "artifact_id": "3c4f290a-bef5-4df1-b0ca-3a1490a60f07"}	2026-06-22 03:41:33.055668+00
133d64dc-2da2-4fa7-82f1-3c6981c09ca9	6ef432c6-1e42-44ef-98f3-d8073b66e030	\N	d79ee89b-6382-4439-88b2-88ad807b30ed	artifact.upload_requested	Uploading scanner.enrichment_summary	\N	{"type": "artifact.upload_requested", "jobId": "1", "runId": "d79ee89b-6382-4439-88b2-88ad807b30ed", "status": "artifact_uploading", "attempt": 1, "message": "Uploading scanner.enrichment_summary", "metadata": {}, "occurredAt": "2026-06-22T03:41:33.055Z"}	2026-06-22 03:41:33.056232+00
edd36a28-718b-44df-9c81-aff72c8f1e64	6ef432c6-1e42-44ef-98f3-d8073b66e030	\N	950b86f4-df0a-4357-b127-1e97948972ae	artifact.upload_succeeded	Uploaded scanner.normalized_findings	\N	{"type": "artifact.upload_succeeded", "jobId": "2", "runId": "950b86f4-df0a-4357-b127-1e97948972ae", "status": "artifact_uploading", "attempt": 1, "message": "Uploaded scanner.normalized_findings", "metadata": {}, "occurredAt": "2026-06-22T03:41:33.056Z"}	2026-06-22 03:41:33.057408+00
c4782717-ca83-4092-b7b4-758d9344b870	6ef432c6-1e42-44ef-98f3-d8073b66e030	\N	d79ee89b-6382-4439-88b2-88ad807b30ed	artifact.uploaded	scanner.enrichment_summary artifact uploaded through API handoff	\N	{"metadata": {"parserVersion": "0.1.0"}, "artifact_id": "d5a615ac-920d-4de7-bedc-01222e301b8a"}	2026-06-22 03:41:33.059554+00
c4e439fa-9fb9-4094-a273-75322577fa5f	6ef432c6-1e42-44ef-98f3-d8073b66e030	\N	d79ee89b-6382-4439-88b2-88ad807b30ed	job.succeeded	Scan job completed	\N	{"type": "job.succeeded", "jobId": "1", "runId": "d79ee89b-6382-4439-88b2-88ad807b30ed", "status": "succeeded", "attempt": 1, "message": "Scan job completed", "metadata": {}, "occurredAt": "2026-06-22T03:41:33.061Z"}	2026-06-22 03:41:33.062789+00
4094ee66-923b-41c2-bcd4-6cc2782a9df7	6ef432c6-1e42-44ef-98f3-d8073b66e030	\N	950b86f4-df0a-4357-b127-1e97948972ae	artifact.upload_succeeded	Uploaded scanner.enrichment_summary	\N	{"type": "artifact.upload_succeeded", "jobId": "2", "runId": "950b86f4-df0a-4357-b127-1e97948972ae", "status": "artifact_uploading", "attempt": 1, "message": "Uploaded scanner.enrichment_summary", "metadata": {}, "occurredAt": "2026-06-22T03:41:33.063Z"}	2026-06-22 03:41:33.063635+00
8c386598-0d2a-4142-8808-d3a21620109d	6ef432c6-1e42-44ef-98f3-d8073b66e030	\N	950b86f4-df0a-4357-b127-1e97948972ae	job.succeeded	Scan job completed	\N	{"type": "job.succeeded", "jobId": "2", "runId": "950b86f4-df0a-4357-b127-1e97948972ae", "status": "succeeded", "attempt": 1, "message": "Scan job completed", "metadata": {}, "occurredAt": "2026-06-22T03:41:33.065Z"}	2026-06-22 03:41:33.066914+00
e9c5bc7d-b87c-456b-96cb-ea050b627bfa	6ef432c6-1e42-44ef-98f3-d8073b66e030	\N	950b86f4-df0a-4357-b127-1e97948972ae	artifact.upload_requested	Uploading scanner.enrichment_summary	\N	{"type": "artifact.upload_requested", "jobId": "2", "runId": "950b86f4-df0a-4357-b127-1e97948972ae", "status": "artifact_uploading", "attempt": 1, "message": "Uploading scanner.enrichment_summary", "metadata": {}, "occurredAt": "2026-06-22T03:41:33.058Z"}	2026-06-22 03:41:33.05982+00
328c0337-96b4-4d7d-b6bc-dcfe16cf0333	6ef432c6-1e42-44ef-98f3-d8073b66e030	\N	d79ee89b-6382-4439-88b2-88ad807b30ed	artifact.upload_succeeded	Uploaded scanner.enrichment_summary	\N	{"type": "artifact.upload_succeeded", "jobId": "1", "runId": "d79ee89b-6382-4439-88b2-88ad807b30ed", "status": "artifact_uploading", "attempt": 1, "message": "Uploaded scanner.enrichment_summary", "metadata": {}, "occurredAt": "2026-06-22T03:41:33.060Z"}	2026-06-22 03:41:33.060911+00
5c17a550-88cc-4d6d-b0c6-b854a9267020	6ef432c6-1e42-44ef-98f3-d8073b66e030	\N	950b86f4-df0a-4357-b127-1e97948972ae	artifact.uploaded	scanner.enrichment_summary artifact uploaded through API handoff	\N	{"metadata": {"parserVersion": "0.1.0"}, "artifact_id": "5c81081a-4b18-4e2c-a987-8154f4cf8e88"}	2026-06-22 03:41:33.062425+00
\.


--
-- Data for Name: knowledgebase_articles; Type: TABLE DATA; Schema: public; Owner: shore_sentinel
--

COPY public.knowledgebase_articles (id, tenant_id, category_id, slug, title, summary, body_markdown, audience, status, tags, created_by, updated_by, created_at, updated_at, published_at) FROM stdin;
\.


--
-- Data for Name: knowledgebase_categories; Type: TABLE DATA; Schema: public; Owner: shore_sentinel
--

COPY public.knowledgebase_categories (id, tenant_id, name, slug, description, sort_order, created_at, updated_at) FROM stdin;
9136fd0f-8536-4a80-abdc-ec0a6a277577	6ef432c6-1e42-44ef-98f3-d8073b66e030	Getting Started	getting-started	Operator guides for audit and managed-machine workflows	10	2026-06-19 14:21:44.149342+00	2026-06-19 14:21:44.149342+00
\.


--
-- Data for Name: notification_email_templates; Type: TABLE DATA; Schema: public; Owner: shore_sentinel
--

COPY public.notification_email_templates (id, tenant_id, event_type, subject_template, body_template, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: notification_events; Type: TABLE DATA; Schema: public; Owner: shore_sentinel
--

COPY public.notification_events (id, tenant_id, event_type, target_id, run_id, delivery_state, payload, created_at) FROM stdin;
\.


--
-- Data for Name: one_time_audits; Type: TABLE DATA; Schema: public; Owner: shore_sentinel
--

COPY public.one_time_audits (id, tenant_id, display_name, hostname, ip_address, requested_by, status, connection_mode, retention_policy_id, promoted_target_id, created_at, updated_at) FROM stdin;
eb1fe092-0204-4de3-8244-7d3d5dd4d3e3	6ef432c6-1e42-44ef-98f3-d8073b66e030	vendor-export-1782099692	firewall.example.local	10.10.4.18	\N	draft	temporary_runner	\N	\N	2026-06-22 03:41:32.97242+00	2026-06-22 03:41:32.97242+00
\.


--
-- Data for Name: remediation_items; Type: TABLE DATA; Schema: public; Owner: shore_sentinel
--

COPY public.remediation_items (id, tenant_id, finding_instance_id, source, priority, category, title, action, file_path, instructions, status, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: retention_policies; Type: TABLE DATA; Schema: public; Owner: shore_sentinel
--

COPY public.retention_policies (id, tenant_id, name, retention_days, is_default, created_at, updated_at) FROM stdin;
9e0daaaf-e760-4a69-8222-8425cfe08464	6ef432c6-1e42-44ef-98f3-d8073b66e030	Default 90 days	90	t	2026-06-19 14:21:43.933889+00	2026-06-19 14:21:43.933889+00
058e78ea-ba9a-41ec-9abf-6c12115cebc0	6ef432c6-1e42-44ef-98f3-d8073b66e030	Default 90 days	90	t	2026-06-19 14:22:53.550907+00	2026-06-19 14:22:53.550907+00
b4c3a2ab-016f-482d-af70-102702f090e9	6ef432c6-1e42-44ef-98f3-d8073b66e030	Default 90 days	90	t	2026-06-19 14:24:54.973825+00	2026-06-19 14:24:54.973825+00
122afe0d-3bdc-499a-932d-7b11ef795948	6ef432c6-1e42-44ef-98f3-d8073b66e030	Default 90 days	90	t	2026-06-19 16:20:34.287638+00	2026-06-19 16:20:34.287638+00
f2bfdc8b-b001-4d49-98db-ae389563a277	6ef432c6-1e42-44ef-98f3-d8073b66e030	Default 90 days	90	t	2026-06-19 16:27:08.620615+00	2026-06-19 16:27:08.620615+00
6d7ac969-ac4a-46eb-b703-12bfc5f8d5d8	6ef432c6-1e42-44ef-98f3-d8073b66e030	Default 90 days	90	t	2026-06-19 16:32:59.392808+00	2026-06-19 16:32:59.392808+00
4f17eeac-ea99-481c-8da1-d494783fe5d3	6ef432c6-1e42-44ef-98f3-d8073b66e030	Default 90 days	90	t	2026-06-19 17:03:07.595552+00	2026-06-19 17:03:07.595552+00
97bf6fb4-146b-4f88-a2b9-88b193c4fd50	6ef432c6-1e42-44ef-98f3-d8073b66e030	Default 90 days	90	t	2026-06-19 17:07:03.239042+00	2026-06-19 17:07:03.239042+00
8886e92a-bba0-46c1-88f9-721927a8b778	6ef432c6-1e42-44ef-98f3-d8073b66e030	Default 90 days	90	t	2026-06-19 17:15:29.599087+00	2026-06-19 17:15:29.599087+00
68267373-0f8b-4b8d-bc3a-e86560e58d94	6ef432c6-1e42-44ef-98f3-d8073b66e030	Default 90 days	90	t	2026-06-19 17:17:18.348216+00	2026-06-19 17:17:18.348216+00
525b1a98-98a3-435a-8c4f-c67ad1a869a5	6ef432c6-1e42-44ef-98f3-d8073b66e030	Default 90 days	90	t	2026-06-19 17:25:03.389591+00	2026-06-19 17:25:03.389591+00
6d88e898-e76a-4eb9-b4b7-6875bcc52060	6ef432c6-1e42-44ef-98f3-d8073b66e030	Default 90 days	90	t	2026-06-19 17:26:42.129601+00	2026-06-19 17:26:42.129601+00
9e4bbdd4-f2ce-46c4-8936-54f50b4ef53b	6ef432c6-1e42-44ef-98f3-d8073b66e030	Default 90 days	90	t	2026-06-20 01:50:55.404868+00	2026-06-20 01:50:55.404868+00
2d22b26e-59af-4137-b0cc-450ce4364c1c	6ef432c6-1e42-44ef-98f3-d8073b66e030	Default 90 days	90	t	2026-06-20 01:53:33.120955+00	2026-06-20 01:53:33.120955+00
f430abc8-e337-403d-a885-54df4f41ddae	6ef432c6-1e42-44ef-98f3-d8073b66e030	Default 90 days	90	t	2026-06-20 02:20:39.144421+00	2026-06-20 02:20:39.144421+00
8b668b05-9385-4114-8211-0f244247115b	6ef432c6-1e42-44ef-98f3-d8073b66e030	Default 90 days	90	t	2026-06-20 03:29:44.507673+00	2026-06-20 03:29:44.507673+00
91ebde0f-796d-42c9-a8ba-1261b7e1840d	6ef432c6-1e42-44ef-98f3-d8073b66e030	Default 90 days	90	t	2026-06-21 16:31:59.911433+00	2026-06-21 16:31:59.911433+00
ba8821b4-9b84-4f4a-9e76-065a3fe81bd2	6ef432c6-1e42-44ef-98f3-d8073b66e030	Default 90 days	90	t	2026-06-21 16:52:28.084017+00	2026-06-21 16:52:28.084017+00
82c9fd31-36de-473e-bca7-605091d110ad	6ef432c6-1e42-44ef-98f3-d8073b66e030	Default 90 days	90	t	2026-06-22 03:29:36.490621+00	2026-06-22 03:29:36.490621+00
25dbb4dc-e3c6-4b4c-8efe-b812e151713a	6ef432c6-1e42-44ef-98f3-d8073b66e030	Default 90 days	90	t	2026-06-22 03:34:24.247774+00	2026-06-22 03:34:24.247774+00
25a1f8ce-bdf7-4097-bd09-6e8246992eca	6ef432c6-1e42-44ef-98f3-d8073b66e030	Default 90 days	90	t	2026-06-22 03:37:08.437151+00	2026-06-22 03:37:08.437151+00
e93743c7-8873-4bbd-86c1-30b768be5cb6	6ef432c6-1e42-44ef-98f3-d8073b66e030	Default 90 days	90	t	2026-06-22 03:39:49.510313+00	2026-06-22 03:39:49.510313+00
d04c14fb-7371-447b-bbf0-812fd5ddd372	6ef432c6-1e42-44ef-98f3-d8073b66e030	Default 90 days	90	t	2026-06-22 09:47:28.468611+00	2026-06-22 09:47:28.468611+00
\.


--
-- Data for Name: role_feature_permissions; Type: TABLE DATA; Schema: public; Owner: shore_sentinel
--

COPY public.role_feature_permissions (id, tenant_id, role_id, feature_area, can_read, can_add, can_edit, can_delete, created_at, updated_at) FROM stdin;
8dd8405b-b32a-4fbb-b814-960f9018de85	6ef432c6-1e42-44ef-98f3-d8073b66e030	25d7991d-649e-4326-9405-f2b939e95b0d	scan_jobs_live_progress	t	t	t	f	2026-06-19 14:21:43.923634+00	2026-06-22 09:47:28.450153+00
4fe31459-61ce-4a87-b503-4252c9b07ee1	6ef432c6-1e42-44ef-98f3-d8073b66e030	25d7991d-649e-4326-9405-f2b939e95b0d	reports_artifacts	t	t	t	f	2026-06-19 14:21:43.923804+00	2026-06-22 09:47:28.450407+00
1b28c25e-410d-4485-aed9-1a7880b17cc7	6ef432c6-1e42-44ef-98f3-d8073b66e030	25d7991d-649e-4326-9405-f2b939e95b0d	import_export_reports	t	t	f	f	2026-06-19 14:21:43.923975+00	2026-06-22 09:47:28.450785+00
c2e79882-b67f-4f1e-96aa-ec830b57cdfc	6ef432c6-1e42-44ef-98f3-d8073b66e030	25d7991d-649e-4326-9405-f2b939e95b0d	comparison_analytics	t	f	f	f	2026-06-19 14:21:43.924146+00	2026-06-22 09:47:28.451085+00
9f1fb6ff-dba8-45ea-9c17-2675619c550c	6ef432c6-1e42-44ef-98f3-d8073b66e030	25d7991d-649e-4326-9405-f2b939e95b0d	remediation_workflows	t	t	t	f	2026-06-19 14:21:43.92431+00	2026-06-22 09:47:28.451296+00
d2b23e76-af9e-4e73-8351-11f8a8dd82a8	6ef432c6-1e42-44ef-98f3-d8073b66e030	25d7991d-649e-4326-9405-f2b939e95b0d	knowledgebase	t	t	t	f	2026-06-19 14:21:43.92449+00	2026-06-22 09:47:28.451601+00
5b8b03a7-dfa3-45a6-b0ca-364f34ca1d9e	6ef432c6-1e42-44ef-98f3-d8073b66e030	25d7991d-649e-4326-9405-f2b939e95b0d	logs_page	t	f	f	f	2026-06-19 14:21:43.924675+00	2026-06-22 09:47:28.451936+00
d51e9127-8969-4937-8b76-0d0054b032be	6ef432c6-1e42-44ef-98f3-d8073b66e030	25d7991d-649e-4326-9405-f2b939e95b0d	alert_rules	t	f	t	f	2026-06-19 14:21:43.924841+00	2026-06-22 09:47:28.452119+00
7980afc8-4977-4233-bf65-57e1f7dee702	6ef432c6-1e42-44ef-98f3-d8073b66e030	25d7991d-649e-4326-9405-f2b939e95b0d	email_templates	t	f	t	f	2026-06-19 14:21:43.925003+00	2026-06-22 09:47:28.452506+00
2dd282f4-22b6-48d0-ae01-da1d8eb1e0a5	6ef432c6-1e42-44ef-98f3-d8073b66e030	25d7991d-649e-4326-9405-f2b939e95b0d	smtp_settings	f	f	f	f	2026-06-19 14:21:43.925183+00	2026-06-22 09:47:28.452723+00
3008a633-3708-4c9d-bfc7-7f9a2888135d	6ef432c6-1e42-44ef-98f3-d8073b66e030	25d7991d-649e-4326-9405-f2b939e95b0d	retention_policy	t	f	f	f	2026-06-19 14:21:43.925354+00	2026-06-22 09:47:28.452932+00
211dcc02-0a7a-48dc-815c-d45d287072da	6ef432c6-1e42-44ef-98f3-d8073b66e030	25d7991d-649e-4326-9405-f2b939e95b0d	role_configuration	f	f	f	f	2026-06-19 14:21:43.925535+00	2026-06-22 09:47:28.45376+00
e43bdbbc-55e8-46c9-ba32-a4a2807b8f6e	6ef432c6-1e42-44ef-98f3-d8073b66e030	25d7991d-649e-4326-9405-f2b939e95b0d	system_health_release_status	t	f	f	f	2026-06-19 14:21:43.925747+00	2026-06-22 09:47:28.454141+00
6a1a9912-ce4a-41d5-9896-68f556160715	6ef432c6-1e42-44ef-98f3-d8073b66e030	b51020ae-2e7b-48f9-8173-257c4996b706	central_dashboard	t	f	f	f	2026-06-19 14:21:43.926051+00	2026-06-22 09:47:28.455259+00
149d8a4a-024b-472f-b64e-9b11dd9e3eac	6ef432c6-1e42-44ef-98f3-d8073b66e030	b51020ae-2e7b-48f9-8173-257c4996b706	inventory_managed_machines	t	f	f	f	2026-06-19 14:21:43.926238+00	2026-06-22 09:47:28.455585+00
f2bae9e8-5217-4261-a152-58ff33793719	6ef432c6-1e42-44ef-98f3-d8073b66e030	b51020ae-2e7b-48f9-8173-257c4996b706	environments_grouping	t	f	f	f	2026-06-19 14:21:43.926422+00	2026-06-22 09:47:28.456293+00
f7ac7cd1-26ff-4dc6-9477-63d0579f4c57	6ef432c6-1e42-44ef-98f3-d8073b66e030	b51020ae-2e7b-48f9-8173-257c4996b706	run_one_time_audit	t	t	f	f	2026-06-19 14:21:43.926593+00	2026-06-22 09:47:28.456825+00
c778d134-5a36-48e8-bee0-fddcc0da18e9	6ef432c6-1e42-44ef-98f3-d8073b66e030	b51020ae-2e7b-48f9-8173-257c4996b706	managed_machine_schedules	t	f	f	f	2026-06-19 14:21:43.92686+00	2026-06-22 09:47:28.457202+00
4010c6c8-b207-44f8-8d13-c8fe34402c21	6ef432c6-1e42-44ef-98f3-d8073b66e030	b51020ae-2e7b-48f9-8173-257c4996b706	scan_jobs_live_progress	t	t	f	f	2026-06-19 14:21:43.927051+00	2026-06-22 09:47:28.457528+00
e9172364-422d-474d-846e-066d7b55c195	6ef432c6-1e42-44ef-98f3-d8073b66e030	b51020ae-2e7b-48f9-8173-257c4996b706	reports_artifacts	t	f	f	f	2026-06-19 14:21:43.927267+00	2026-06-22 09:47:28.457956+00
fc6e7a3d-841a-473f-8a5b-52440f7880fc	6ef432c6-1e42-44ef-98f3-d8073b66e030	b51020ae-2e7b-48f9-8173-257c4996b706	import_export_reports	t	f	f	f	2026-06-19 14:21:43.927473+00	2026-06-22 09:47:28.458446+00
a7e083f3-8f67-46d5-960f-e725d7551d6e	6ef432c6-1e42-44ef-98f3-d8073b66e030	b51020ae-2e7b-48f9-8173-257c4996b706	comparison_analytics	t	f	f	f	2026-06-19 14:21:43.927802+00	2026-06-22 09:47:28.458756+00
ae7f160a-d80b-495a-9820-f7bc7e416adf	6ef432c6-1e42-44ef-98f3-d8073b66e030	b51020ae-2e7b-48f9-8173-257c4996b706	remediation_workflows	t	t	t	f	2026-06-19 14:21:43.928127+00	2026-06-22 09:47:28.459049+00
9fe0d9df-626d-454c-a8c1-e4aa9f08f5b1	6ef432c6-1e42-44ef-98f3-d8073b66e030	b51020ae-2e7b-48f9-8173-257c4996b706	knowledgebase	t	t	t	f	2026-06-19 14:21:43.92835+00	2026-06-22 09:47:28.459477+00
c52bda57-9563-4bfc-8e82-cc12aad1d765	6ef432c6-1e42-44ef-98f3-d8073b66e030	b51020ae-2e7b-48f9-8173-257c4996b706	logs_page	t	f	f	f	2026-06-19 14:21:43.928548+00	2026-06-22 09:47:28.460044+00
c1efbb98-3256-483b-b9d0-73cf8e0c177f	6ef432c6-1e42-44ef-98f3-d8073b66e030	b51020ae-2e7b-48f9-8173-257c4996b706	alert_rules	t	f	f	f	2026-06-19 14:21:43.928811+00	2026-06-22 09:47:28.460383+00
d0ec0cb8-50a2-4388-bb02-e2c8f59c0490	6ef432c6-1e42-44ef-98f3-d8073b66e030	b51020ae-2e7b-48f9-8173-257c4996b706	email_templates	t	f	f	f	2026-06-19 14:21:43.92904+00	2026-06-22 09:47:28.460761+00
a36fb7d4-5294-4857-8a6b-a6fae4ae1631	6ef432c6-1e42-44ef-98f3-d8073b66e030	b51020ae-2e7b-48f9-8173-257c4996b706	smtp_settings	f	f	f	f	2026-06-19 14:21:43.929222+00	2026-06-22 09:47:28.461346+00
18b34ae6-72d7-4c08-80ef-9225f776cc04	6ef432c6-1e42-44ef-98f3-d8073b66e030	b51020ae-2e7b-48f9-8173-257c4996b706	retention_policy	t	f	f	f	2026-06-19 14:21:43.929388+00	2026-06-22 09:47:28.46177+00
841f96ff-a8d2-4d94-b10e-56b3f08e3fde	6ef432c6-1e42-44ef-98f3-d8073b66e030	b51020ae-2e7b-48f9-8173-257c4996b706	system_health_release_status	t	f	f	f	2026-06-19 14:21:43.929756+00	2026-06-22 09:47:28.462194+00
e3dd87a6-a15a-43cd-b9cd-4cc8b01ebe3c	6ef432c6-1e42-44ef-98f3-d8073b66e030	a963277c-314f-4525-bd5a-8b137f79b929	central_dashboard	t	f	f	f	2026-06-19 14:21:43.930051+00	2026-06-22 09:47:28.462637+00
21695e41-36ad-4eea-bfc6-df1b677e210b	6ef432c6-1e42-44ef-98f3-d8073b66e030	a963277c-314f-4525-bd5a-8b137f79b929	inventory_managed_machines	t	f	f	f	2026-06-19 14:21:43.930242+00	2026-06-22 09:47:28.462845+00
ecb5aa60-37c6-4939-94b7-5e93580a10cc	6ef432c6-1e42-44ef-98f3-d8073b66e030	a963277c-314f-4525-bd5a-8b137f79b929	environments_grouping	t	f	f	f	2026-06-19 14:21:43.930429+00	2026-06-22 09:47:28.463062+00
37a71501-9f38-4f13-9f20-dfb1c3a45b76	6ef432c6-1e42-44ef-98f3-d8073b66e030	a963277c-314f-4525-bd5a-8b137f79b929	run_one_time_audit	f	f	f	f	2026-06-19 14:21:43.930669+00	2026-06-22 09:47:28.463369+00
5b28bc56-7225-4efe-aa71-ada980548f8f	6ef432c6-1e42-44ef-98f3-d8073b66e030	a963277c-314f-4525-bd5a-8b137f79b929	managed_machine_schedules	t	f	f	f	2026-06-19 14:21:43.930849+00	2026-06-22 09:47:28.463645+00
e7fc2114-a70d-4659-a2b2-7095588966f2	6ef432c6-1e42-44ef-98f3-d8073b66e030	a963277c-314f-4525-bd5a-8b137f79b929	scan_jobs_live_progress	t	f	f	f	2026-06-19 14:21:43.931023+00	2026-06-22 09:47:28.463917+00
21d46ed3-0450-4dd1-a17a-4852ea65d656	6ef432c6-1e42-44ef-98f3-d8073b66e030	a963277c-314f-4525-bd5a-8b137f79b929	reports_artifacts	t	f	f	f	2026-06-19 14:21:43.93119+00	2026-06-22 09:47:28.464642+00
089fc6e6-f1c4-44a2-9cf3-3e13ceb6f011	6ef432c6-1e42-44ef-98f3-d8073b66e030	a963277c-314f-4525-bd5a-8b137f79b929	import_export_reports	t	f	f	f	2026-06-19 14:21:43.931353+00	2026-06-22 09:47:28.464858+00
03e49ac8-0818-4f98-be3c-cf7b185dc1c2	6ef432c6-1e42-44ef-98f3-d8073b66e030	a963277c-314f-4525-bd5a-8b137f79b929	comparison_analytics	t	f	f	f	2026-06-19 14:21:43.931516+00	2026-06-22 09:47:28.465075+00
39c28212-37e1-45e7-8998-cdf21b05fe61	6ef432c6-1e42-44ef-98f3-d8073b66e030	a963277c-314f-4525-bd5a-8b137f79b929	remediation_workflows	t	f	f	f	2026-06-19 14:21:43.931716+00	2026-06-22 09:47:28.465281+00
94290771-0992-4707-96e9-67009f970e72	6ef432c6-1e42-44ef-98f3-d8073b66e030	a963277c-314f-4525-bd5a-8b137f79b929	knowledgebase	t	f	f	f	2026-06-19 14:21:43.931908+00	2026-06-22 09:47:28.465503+00
02d5a894-79ee-4c26-a6c7-c973b9459f27	6ef432c6-1e42-44ef-98f3-d8073b66e030	a963277c-314f-4525-bd5a-8b137f79b929	logs_page	t	f	f	f	2026-06-19 14:21:43.932135+00	2026-06-22 09:47:28.465736+00
6a9d0d0b-e897-46f9-8707-56492ecc250a	6ef432c6-1e42-44ef-98f3-d8073b66e030	a963277c-314f-4525-bd5a-8b137f79b929	alert_rules	f	f	f	f	2026-06-19 14:21:43.932312+00	2026-06-22 09:47:28.465959+00
2134b9e4-cfe0-4718-ab4c-c800431d7d9c	6ef432c6-1e42-44ef-98f3-d8073b66e030	a963277c-314f-4525-bd5a-8b137f79b929	email_templates	f	f	f	f	2026-06-19 14:21:43.932481+00	2026-06-22 09:47:28.466166+00
addc3195-c7cb-41b1-b8e7-0175171f5776	6ef432c6-1e42-44ef-98f3-d8073b66e030	a9e6fb10-698c-4c80-ab58-7d19a9e7347c	inventory_managed_machines	t	t	t	t	2026-06-19 14:21:43.916528+00	2026-06-22 09:47:28.441547+00
8866a783-bba8-4b7a-9cd5-bc25c7952487	6ef432c6-1e42-44ef-98f3-d8073b66e030	a9e6fb10-698c-4c80-ab58-7d19a9e7347c	environments_grouping	t	t	t	t	2026-06-19 14:21:43.916953+00	2026-06-22 09:47:28.442662+00
6fd3b990-d73e-46e9-80cb-51dc04ce015e	6ef432c6-1e42-44ef-98f3-d8073b66e030	a9e6fb10-698c-4c80-ab58-7d19a9e7347c	run_one_time_audit	t	t	t	t	2026-06-19 14:21:43.917299+00	2026-06-22 09:47:28.443365+00
7da5c86a-c9d9-4595-a649-cf606417aaa6	6ef432c6-1e42-44ef-98f3-d8073b66e030	a9e6fb10-698c-4c80-ab58-7d19a9e7347c	managed_machine_schedules	t	t	t	t	2026-06-19 14:21:43.919336+00	2026-06-22 09:47:28.443922+00
d33b2ee8-32e9-4e7e-9854-45fa92673717	6ef432c6-1e42-44ef-98f3-d8073b66e030	a9e6fb10-698c-4c80-ab58-7d19a9e7347c	scan_jobs_live_progress	t	t	t	t	2026-06-19 14:21:43.919629+00	2026-06-22 09:47:28.444309+00
1d978c14-d8a1-4a01-ab26-0f1c13ea756d	6ef432c6-1e42-44ef-98f3-d8073b66e030	a9e6fb10-698c-4c80-ab58-7d19a9e7347c	reports_artifacts	t	t	t	t	2026-06-19 14:21:43.919916+00	2026-06-22 09:47:28.444677+00
a0f3763f-01c4-453c-8253-7493089537e4	6ef432c6-1e42-44ef-98f3-d8073b66e030	a9e6fb10-698c-4c80-ab58-7d19a9e7347c	import_export_reports	t	t	t	t	2026-06-19 14:21:43.920115+00	2026-06-22 09:47:28.445063+00
b7321d63-18a3-4403-93eb-93338b56ff6f	6ef432c6-1e42-44ef-98f3-d8073b66e030	a9e6fb10-698c-4c80-ab58-7d19a9e7347c	comparison_analytics	t	t	t	t	2026-06-19 14:21:43.920341+00	2026-06-22 09:47:28.445415+00
1000dfa7-50a3-4b7d-96d8-2d7cbbca7251	6ef432c6-1e42-44ef-98f3-d8073b66e030	a9e6fb10-698c-4c80-ab58-7d19a9e7347c	remediation_workflows	t	t	t	t	2026-06-19 14:21:43.920575+00	2026-06-22 09:47:28.445678+00
c0510575-ab50-4dc3-b328-40e33071769e	6ef432c6-1e42-44ef-98f3-d8073b66e030	a9e6fb10-698c-4c80-ab58-7d19a9e7347c	knowledgebase	t	t	t	t	2026-06-19 14:21:43.920804+00	2026-06-22 09:47:28.445987+00
c857d138-3679-49fc-9729-b96c7894de01	6ef432c6-1e42-44ef-98f3-d8073b66e030	a9e6fb10-698c-4c80-ab58-7d19a9e7347c	logs_page	t	t	t	t	2026-06-19 14:21:43.921035+00	2026-06-22 09:47:28.446362+00
78d0a976-6240-460c-a6a8-3a1882d14da4	6ef432c6-1e42-44ef-98f3-d8073b66e030	a9e6fb10-698c-4c80-ab58-7d19a9e7347c	alert_rules	t	t	t	t	2026-06-19 14:21:43.921291+00	2026-06-22 09:47:28.446615+00
27f59b49-77a6-4571-a9c8-e35f0cf55375	6ef432c6-1e42-44ef-98f3-d8073b66e030	a9e6fb10-698c-4c80-ab58-7d19a9e7347c	email_templates	t	t	t	t	2026-06-19 14:21:43.921488+00	2026-06-22 09:47:28.446856+00
daa905b8-bee7-4983-9c71-ea86307c19c3	6ef432c6-1e42-44ef-98f3-d8073b66e030	a9e6fb10-698c-4c80-ab58-7d19a9e7347c	smtp_settings	t	t	t	t	2026-06-19 14:21:43.921688+00	2026-06-22 09:47:28.447212+00
df8a8856-8759-4d0b-bfea-ee42aa1211ab	6ef432c6-1e42-44ef-98f3-d8073b66e030	a9e6fb10-698c-4c80-ab58-7d19a9e7347c	retention_policy	t	t	t	t	2026-06-19 14:21:43.921904+00	2026-06-22 09:47:28.447739+00
30630f12-45ec-4fc7-8f6b-2b639a1ab5c4	6ef432c6-1e42-44ef-98f3-d8073b66e030	a9e6fb10-698c-4c80-ab58-7d19a9e7347c	role_configuration	t	t	t	t	2026-06-19 14:21:43.92217+00	2026-06-22 09:47:28.447979+00
dafa8e2b-1eeb-47ba-93c4-252cb8b3b89a	6ef432c6-1e42-44ef-98f3-d8073b66e030	25d7991d-649e-4326-9405-f2b939e95b0d	central_dashboard	t	f	f	f	2026-06-19 14:21:43.922687+00	2026-06-22 09:47:28.448588+00
63ea2d69-4696-4521-8bd9-9a6913b1cab3	6ef432c6-1e42-44ef-98f3-d8073b66e030	25d7991d-649e-4326-9405-f2b939e95b0d	inventory_managed_machines	t	t	t	f	2026-06-19 14:21:43.922871+00	2026-06-22 09:47:28.448793+00
f8af1759-fd19-4e08-9cd4-5d4bc23f5e49	6ef432c6-1e42-44ef-98f3-d8073b66e030	25d7991d-649e-4326-9405-f2b939e95b0d	environments_grouping	t	t	t	f	2026-06-19 14:21:43.923048+00	2026-06-22 09:47:28.449042+00
e56a8904-4ed8-4e9f-ba1b-60f6929bbeec	6ef432c6-1e42-44ef-98f3-d8073b66e030	25d7991d-649e-4326-9405-f2b939e95b0d	run_one_time_audit	t	t	f	f	2026-06-19 14:21:43.923233+00	2026-06-22 09:47:28.449476+00
c747567c-dd64-4cd7-9527-a18db7f8f5b2	6ef432c6-1e42-44ef-98f3-d8073b66e030	25d7991d-649e-4326-9405-f2b939e95b0d	managed_machine_schedules	t	t	t	f	2026-06-19 14:21:43.923447+00	2026-06-22 09:47:28.449735+00
cd2842fa-e773-434e-974d-13f1c405976c	6ef432c6-1e42-44ef-98f3-d8073b66e030	a9e6fb10-698c-4c80-ab58-7d19a9e7347c	central_dashboard	t	t	t	t	2026-06-19 14:21:43.915888+00	2026-06-22 09:47:28.438827+00
91b7360a-65d8-4fc5-b191-bd18bb6b8730	6ef432c6-1e42-44ef-98f3-d8073b66e030	a9e6fb10-698c-4c80-ab58-7d19a9e7347c	system_health_release_status	t	t	t	t	2026-06-19 14:21:43.922369+00	2026-06-22 09:47:28.448224+00
10376e4d-430f-41c9-9be6-a20d06fda4ab	6ef432c6-1e42-44ef-98f3-d8073b66e030	b51020ae-2e7b-48f9-8173-257c4996b706	role_configuration	f	f	f	f	2026-06-19 14:21:43.929551+00	2026-06-22 09:47:28.461972+00
6f0b9487-c766-4c08-baf3-657a1fb02b96	6ef432c6-1e42-44ef-98f3-d8073b66e030	a963277c-314f-4525-bd5a-8b137f79b929	smtp_settings	f	f	f	f	2026-06-19 14:21:43.932698+00	2026-06-22 09:47:28.466611+00
0c1d6592-acc2-44d6-b60c-e26d011f36b7	6ef432c6-1e42-44ef-98f3-d8073b66e030	a963277c-314f-4525-bd5a-8b137f79b929	retention_policy	f	f	f	f	2026-06-19 14:21:43.932938+00	2026-06-22 09:47:28.467024+00
2fb54ab1-049f-4e73-adfe-51d60c3d9fc6	6ef432c6-1e42-44ef-98f3-d8073b66e030	a963277c-314f-4525-bd5a-8b137f79b929	role_configuration	f	f	f	f	2026-06-19 14:21:43.933115+00	2026-06-22 09:47:28.467339+00
defcc373-ccea-44ca-a506-f19520df91cd	6ef432c6-1e42-44ef-98f3-d8073b66e030	a963277c-314f-4525-bd5a-8b137f79b929	system_health_release_status	t	f	f	f	2026-06-19 14:21:43.933291+00	2026-06-22 09:47:28.467691+00
\.


--
-- Data for Name: roles; Type: TABLE DATA; Schema: public; Owner: shore_sentinel
--

COPY public.roles (id, name, description, created_at) FROM stdin;
a9e6fb10-698c-4c80-ab58-7d19a9e7347c	admin	Full platform administration	2026-06-19 14:21:43.913795+00
25d7991d-649e-4326-9405-f2b939e95b0d	operator	Day-to-day security operations	2026-06-19 14:21:43.914224+00
b51020ae-2e7b-48f9-8173-257c4996b706	analyst	Review, triage, and reporting	2026-06-19 14:21:43.914526+00
a963277c-314f-4525-bd5a-8b137f79b929	viewer	Read-only oversight	2026-06-19 14:21:43.914769+00
\.


--
-- Data for Name: scan_jobs; Type: TABLE DATA; Schema: public; Owner: shore_sentinel
--

COPY public.scan_jobs (id, tenant_id, subject_type, target_id, one_time_audit_id, requested_by, mode, status, priority, scheduled_at, started_at, completed_at, timeout_seconds, scanner_version, retry_count, next_retry_at, created_at, updated_at) FROM stdin;
9946074a-3b6d-4146-a755-77bc794de62a	6ef432c6-1e42-44ef-98f3-d8073b66e030	managed_target	c7abde06-5f24-462e-b127-0b5c406b034e	\N	\N	ssh_push	completed	80	\N	2026-06-22 03:41:33.004921+00	2026-06-22 03:41:33.062577+00	1800	\N	0	\N	2026-06-22 03:41:32.945349+00	2026-06-22 03:41:33.062577+00
a36a9c6e-c81d-4a2f-8d8a-ef30c79498e6	6ef432c6-1e42-44ef-98f3-d8073b66e030	one_time_audit	\N	eb1fe092-0204-4de3-8244-7d3d5dd4d3e3	\N	temporary_runner	completed	50	\N	2026-06-22 03:41:33.015592+00	2026-06-22 03:41:33.066661+00	1800	\N	0	\N	2026-06-22 03:41:33.000741+00	2026-06-22 03:41:33.066661+00
\.


--
-- Data for Name: scan_runs; Type: TABLE DATA; Schema: public; Owner: shore_sentinel
--

COPY public.scan_runs (id, tenant_id, job_id, subject_type, target_id, one_time_audit_id, status, exit_code, started_at, completed_at, duration_seconds, runtime_context, agent_identity, lease_owner, lease_expires_at, heartbeat_at, app_version, scanner_bundle_version, scanner_script_sha256, created_at, updated_at) FROM stdin;
d79ee89b-6382-4439-88b2-88ad807b30ed	6ef432c6-1e42-44ef-98f3-d8073b66e030	9946074a-3b6d-4146-a755-77bc794de62a	managed_target	c7abde06-5f24-462e-b127-0b5c406b034e	\N	completed	\N	2026-06-22 03:41:33.012067+00	2026-06-22 03:41:33.062367+00	\N	{}	\N	worker-node	2026-06-22 03:56:33.003364+00	2026-06-22 03:41:33.062367+00	0.1.0	\N	\N	2026-06-22 03:41:32.947887+00	2026-06-22 03:41:33.062367+00
950b86f4-df0a-4357-b127-1e97948972ae	6ef432c6-1e42-44ef-98f3-d8073b66e030	a36a9c6e-c81d-4a2f-8d8a-ef30c79498e6	one_time_audit	\N	eb1fe092-0204-4de3-8244-7d3d5dd4d3e3	completed	\N	2026-06-22 03:41:33.021211+00	2026-06-22 03:41:33.065793+00	\N	{}	\N	worker-node	2026-06-22 03:56:33.012434+00	2026-06-22 03:41:33.065793+00	0.1.0	\N	\N	2026-06-22 03:41:33.001186+00	2026-06-22 03:41:33.065793+00
\.


--
-- Data for Name: schedules; Type: TABLE DATA; Schema: public; Owner: shore_sentinel
--

COPY public.schedules (id, tenant_id, target_id, schedule_type, cron_expression, timezone, enabled, next_run_at, last_run_at, created_by, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: settings; Type: TABLE DATA; Schema: public; Owner: shore_sentinel
--

COPY public.settings (id, tenant_id, app_version, default_artifact_retention_days, created_at, updated_at) FROM stdin;
5271b30f-3fbd-4b87-9b7d-2807c626f385	6ef432c6-1e42-44ef-98f3-d8073b66e030	0.1.0	90	2026-06-19 14:21:43.93347+00	2026-06-22 09:47:28.468014+00
\.


--
-- Data for Name: smtp_settings; Type: TABLE DATA; Schema: public; Owner: shore_sentinel
--

COPY public.smtp_settings (id, tenant_id, host, port, encryption_mode, username, sealed_password, from_address, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: target_group_members; Type: TABLE DATA; Schema: public; Owner: shore_sentinel
--

COPY public.target_group_members (target_group_id, target_id) FROM stdin;
\.


--
-- Data for Name: target_groups; Type: TABLE DATA; Schema: public; Owner: shore_sentinel
--

COPY public.target_groups (id, tenant_id, name, slug, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: target_identities; Type: TABLE DATA; Schema: public; Owner: shore_sentinel
--

COPY public.target_identities (id, tenant_id, target_id, device_id, device_cert_fingerprint, token_hash, enrollment_status, last_seen_at, revoked_at, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: target_status_checks; Type: TABLE DATA; Schema: public; Owner: shore_sentinel
--

COPY public.target_status_checks (id, tenant_id, target_id, status, source, checked_at, details) FROM stdin;
\.


--
-- Data for Name: targets; Type: TABLE DATA; Schema: public; Owner: shore_sentinel
--

COPY public.targets (id, tenant_id, asset_mode, hostname, fqdn, ip_address, environment_id, owner_team, platform, status, connection_mode, monitoring_enabled, schedule_enabled, last_seen_at, last_status_check_at, last_successful_scan_at, promoted_from_audit_id, created_at, updated_at) FROM stdin;
4441b4cb-c672-439c-8398-2ca920802069	6ef432c6-1e42-44ef-98f3-d8073b66e030	managed_machine	test	test	10.6.5.7	a4faa509-c7e3-4235-9c2f-cc632619c07c	test	linux	unknown	ssh_push	t	f	\N	\N	\N	\N	2026-06-22 01:00:37.323996+00	2026-06-22 01:00:37.323996+00
b3f200de-4fa3-458b-956b-5758f4e98b52	6ef432c6-1e42-44ef-98f3-d8073b66e030	managed_machine	dummy-ws-99	dummy-ws-99.corp.local	10.20.18.99	a4faa509-c7e3-4235-9c2f-cc632619c07c	QA	linux	unknown	pull_checkin	t	f	\N	\N	\N	\N	2026-06-22 03:33:34.843878+00	2026-06-22 03:33:34.843878+00
c7abde06-5f24-462e-b127-0b5c406b034e	6ef432c6-1e42-44ef-98f3-d8073b66e030	managed_machine	dummy-ws-1782099692	dummy-ws-1782099692.corp.local	10.20.18.99	a4faa509-c7e3-4235-9c2f-cc632619c07c	QA	linux	unknown	pull_checkin	t	f	\N	\N	\N	\N	2026-06-22 03:41:32.915475+00	2026-06-22 03:41:32.915475+00
\.


--
-- Data for Name: tenants; Type: TABLE DATA; Schema: public; Owner: shore_sentinel
--

COPY public.tenants (id, slug, name, created_at, updated_at) FROM stdin;
6ef432c6-1e42-44ef-98f3-d8073b66e030	shore360	Shore360	2026-06-19 14:21:43.912653+00	2026-06-22 09:47:28.424362+00
\.


--
-- Data for Name: user_roles; Type: TABLE DATA; Schema: public; Owner: shore_sentinel
--

COPY public.user_roles (user_id, role_id) FROM stdin;
361b7049-40fc-438b-8812-f472b564ba26	a9e6fb10-698c-4c80-ab58-7d19a9e7347c
f3d8e703-9b08-4072-a6fe-8cb5f666be47	25d7991d-649e-4326-9405-f2b939e95b0d
8fe3f571-abc3-4c3d-9180-a83034730c49	25d7991d-649e-4326-9405-f2b939e95b0d
6224f376-bcd4-4e9f-a4d9-01992f163296	25d7991d-649e-4326-9405-f2b939e95b0d
dd2a7598-29db-4e14-9e59-3ad03bd5a440	25d7991d-649e-4326-9405-f2b939e95b0d
1f97e87b-6e8a-447f-a781-93985e251f72	25d7991d-649e-4326-9405-f2b939e95b0d
4565c614-8a5f-4a6b-961d-9082e3289c9d	25d7991d-649e-4326-9405-f2b939e95b0d
c2c4bc1c-6144-4273-878b-b80b12e1f79c	25d7991d-649e-4326-9405-f2b939e95b0d
5027fc1f-29d8-43a1-984c-31e0ad5215e8	25d7991d-649e-4326-9405-f2b939e95b0d
a663d4f9-68f7-43a2-97c2-997fd7b9c7c3	25d7991d-649e-4326-9405-f2b939e95b0d
00b7f035-a18c-4a06-a8ba-a5757560404a	25d7991d-649e-4326-9405-f2b939e95b0d
bcef08c9-fea3-4fe0-8f1f-698160a14a6b	25d7991d-649e-4326-9405-f2b939e95b0d
c97d47cc-54c7-4f0e-9046-d185d25e2c53	25d7991d-649e-4326-9405-f2b939e95b0d
c74196bf-ddd6-4344-8a33-215877b60105	25d7991d-649e-4326-9405-f2b939e95b0d
39688a15-57da-4684-bb57-386c9a511f4f	25d7991d-649e-4326-9405-f2b939e95b0d
0ab0e667-683e-4c2e-95cb-1f3cb24ac8c7	25d7991d-649e-4326-9405-f2b939e95b0d
af5fc0e3-0cd1-4797-a637-503285a07ba1	25d7991d-649e-4326-9405-f2b939e95b0d
491787d6-bc49-4269-9906-df88d8c6c538	25d7991d-649e-4326-9405-f2b939e95b0d
ed8dbbbd-be78-48c5-a25f-b477be44664f	25d7991d-649e-4326-9405-f2b939e95b0d
03b1ee7b-7174-46f8-bc10-4076f00e3f6d	25d7991d-649e-4326-9405-f2b939e95b0d
d350c588-2490-4f4b-b503-34a6f00c8993	25d7991d-649e-4326-9405-f2b939e95b0d
91b94599-a248-42e1-b6f3-61f859f9180e	25d7991d-649e-4326-9405-f2b939e95b0d
b0fd262b-c401-4361-80a5-dff5be191690	25d7991d-649e-4326-9405-f2b939e95b0d
3703bd44-04e3-4131-8408-92287458b944	25d7991d-649e-4326-9405-f2b939e95b0d
756ee3c1-d06a-4384-96d1-7a3f1d9697bc	25d7991d-649e-4326-9405-f2b939e95b0d
d81d019a-5ee2-4c04-852f-c6167d3185d3	25d7991d-649e-4326-9405-f2b939e95b0d
ee2c5bb5-c211-4b8b-9fbe-5f0f99848fd6	25d7991d-649e-4326-9405-f2b939e95b0d
224e4e79-93a4-4474-9832-bff3d2ee5dbc	25d7991d-649e-4326-9405-f2b939e95b0d
6930ff9a-b7b0-45bb-ba48-e4d071ebb2ca	25d7991d-649e-4326-9405-f2b939e95b0d
b143f21a-71df-4c85-94cc-53b2a9539386	25d7991d-649e-4326-9405-f2b939e95b0d
1dbe53cf-499b-4da4-bff3-414fcc1a81fa	25d7991d-649e-4326-9405-f2b939e95b0d
cfe3e9ab-7aac-4366-ba7d-dba91e0922aa	25d7991d-649e-4326-9405-f2b939e95b0d
27917eb5-1ad2-4d30-9661-1024c3280dce	25d7991d-649e-4326-9405-f2b939e95b0d
6421579d-1971-4a5b-8eac-d6d570cf300e	25d7991d-649e-4326-9405-f2b939e95b0d
91e9994a-9088-4806-9ab9-c2cd5b636458	25d7991d-649e-4326-9405-f2b939e95b0d
620dedd7-b7f1-4476-bb78-f19d7ab8d02e	25d7991d-649e-4326-9405-f2b939e95b0d
\.


--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: shore_sentinel
--

COPY public.users (id, tenant_id, email, display_name, password_hash, disabled_at, created_at, updated_at) FROM stdin;
ee2c5bb5-c211-4b8b-9fbe-5f0f99848fd6	6ef432c6-1e42-44ef-98f3-d8073b66e030	client-final-1782060045@example.test	Client Final 1782060045	$2a$12$H.N0AL1BX10h5bH.11q6VuIzB2Gs6JOgO6tvQ3lwjDdRmewK5qmf2	\N	2026-06-21 16:40:45.59069+00	2026-06-21 16:40:45.59069+00
224e4e79-93a4-4474-9832-bff3d2ee5dbc	6ef432c6-1e42-44ef-98f3-d8073b66e030	client-final2-1782060086@example.test	Client Final 1782060086	$2a$12$ZMeYSLSHZCBSG7D2df5k7u/oE6w/SNZwJs/I4kmDl27XadogVL2Wi	\N	2026-06-21 16:41:27.125133+00	2026-06-21 16:41:27.125133+00
6930ff9a-b7b0-45bb-ba48-e4d071ebb2ca	6ef432c6-1e42-44ef-98f3-d8073b66e030	client-fixed-1782060138@example.test	Client Fixed 1782060138	$2a$12$HIrXOwI3Z0yies2o7uUxHOJvlG8.4Ja45LsjQmID4dJ0pyIodpaxW	\N	2026-06-21 16:42:18.89481+00	2026-06-21 16:42:18.89481+00
b143f21a-71df-4c85-94cc-53b2a9539386	6ef432c6-1e42-44ef-98f3-d8073b66e030	upstream-1782060627431579366@example.test	Upstream	$2a$12$MZ9l4rD0ebs5eI0/bo.CrOEYjgrQp5W4NkMKUPWAYOANKe8rtBKle	\N	2026-06-21 16:50:27.650196+00	2026-06-21 16:50:27.650196+00
1dbe53cf-499b-4da4-bff3-414fcc1a81fa	6ef432c6-1e42-44ef-98f3-d8073b66e030	nextaction-1782060646013149745@example.test	Header Repro	$2a$12$3xVmuF4ailhCDd8E2/HzH.1hj5qJDS7Uo3X5ewO4OwjZIMbU9oYMK	\N	2026-06-21 16:50:46.224135+00	2026-06-21 16:50:46.224135+00
620dedd7-b7f1-4476-bb78-f19d7ab8d02e	6ef432c6-1e42-44ef-98f3-d8073b66e030	boss-1782099692@example.test	Boss Operator	$2a$12$GKpTmyMHfFEs683hAXZkZexAILJdEjRPF0qyoHvGi/SrPUdSyab0.	\N	2026-06-22 03:41:32.679451+00	2026-06-22 03:41:32.679451+00
cfe3e9ab-7aac-4366-ba7d-dba91e0922aa	6ef432c6-1e42-44ef-98f3-d8073b66e030	normal_register-1782060787944@example.test	normal_register	$2a$12$QMp7E6CXF9hdAAgiR7qcQO.k6C7gqhuuz8GtpJxHGRyGAIMf2ujQ2	\N	2026-06-21 16:53:08.210532+00	2026-06-21 16:53:08.210532+00
27917eb5-1ad2-4d30-9661-1024c3280dce	6ef432c6-1e42-44ef-98f3-d8073b66e030	stale_page_register-1782060788220@example.test	stale_page_register	$2a$12$EMKvrGmGdYkHmacgZCYvYuOf.HqofJKdfSULpj4o2XrY5BBAPuhIS	\N	2026-06-21 16:53:08.447276+00	2026-06-21 16:53:08.447276+00
361b7049-40fc-438b-8812-f472b564ba26	6ef432c6-1e42-44ef-98f3-d8073b66e030	admin@shore360.local	Initial Admin	$2a$12$KtyLMDu1Px11sAOyvsaeLuIAI5iRJebnWNV0tblQl8D0s/5dpFIJK	\N	2026-06-19 14:21:44.148094+00	2026-06-22 09:47:28.714174+00
f3d8e703-9b08-4072-a6fe-8cb5f666be47	6ef432c6-1e42-44ef-98f3-d8073b66e030	qa-1781889825@example.test	QA Operator	$2a$12$hRaRmhORv7AHzBl0IeeWeeSIH0EQBkzJwDY2H9JNESYR1SRgytpWC	\N	2026-06-19 17:23:46.115217+00	2026-06-19 17:23:46.115217+00
6421579d-1971-4a5b-8eac-d6d570cf300e	6ef432c6-1e42-44ef-98f3-d8073b66e030	newrepo-1782099176131@example.test	New Repo 1782099176131	$2a$12$NNSMvhn/uTP16ZxlUScrEe22Ow70ZN5vkwlqkwyKhMZErbUghWi5K	\N	2026-06-22 03:32:56.422947+00	2026-06-22 03:32:56.422947+00
8fe3f571-abc3-4c3d-9180-a83034730c49	6ef432c6-1e42-44ef-98f3-d8073b66e030	qa-1781889939@example.test	QA Operator	$2a$12$Gv.344qroi7GTbscJD2vZ.0wxy1CWtLRACBVDalZvP40hkm.AuVPG	\N	2026-06-19 17:25:39.727629+00	2026-06-19 17:25:39.727629+00
91e9994a-9088-4806-9ab9-c2cd5b636458	6ef432c6-1e42-44ef-98f3-d8073b66e030	stale-newrepo-1782099176131@example.test	Stale New Repo 1782099176131	$2a$12$MhdtX/hMunkK9keOballW.YAzAkuynjmZqRYA3Q60vcDI9S2oUbv2	\N	2026-06-22 03:32:56.953758+00	2026-06-22 03:32:56.953758+00
6224f376-bcd4-4e9f-a4d9-01992f163296	6ef432c6-1e42-44ef-98f3-d8073b66e030	qa-1781914807@example.test	QA Operator	$2a$12$lyugWWcjTOJBHLIKt4c5bOKA2etgR4LFQB5Y8vpcVbKjZMJZCsFAy	\N	2026-06-20 00:20:08.167098+00	2026-06-20 00:20:08.167098+00
dd2a7598-29db-4e14-9e59-3ad03bd5a440	6ef432c6-1e42-44ef-98f3-d8073b66e030	direct-1781914825@example.test	Direct QA	$2a$12$UhJWK2iLvVrmxF9lfdoin.OsYuIU00G7K.q8hWlEjGDljZZR9/Ume	\N	2026-06-20 00:20:25.726274+00	2026-06-20 00:20:25.726274+00
1f97e87b-6e8a-447f-a781-93985e251f72	6ef432c6-1e42-44ef-98f3-d8073b66e030	proxy-1781914825@example.test	Proxy QA	$2a$12$jbgIUlueFn60IQcr5O3qpO2W/YgR/34XLO2wM6FeoqHh0t6pkZm9q	\N	2026-06-20 00:20:25.954844+00	2026-06-20 00:20:25.954844+00
4565c614-8a5f-4a6b-961d-9082e3289c9d	6ef432c6-1e42-44ef-98f3-d8073b66e030	proxy2-1781914825@example.test	Proxy QA2	$2a$12$R31ZWg4NON8A4FMpxoifz.skeMOmsRzlmVF/0VmqnQOZwNDdTEJQC	\N	2026-06-20 00:20:26.179719+00	2026-06-20 00:20:26.179719+00
c2c4bc1c-6144-4273-878b-b80b12e1f79c	6ef432c6-1e42-44ef-98f3-d8073b66e030	direct-1781914875@example.test	Direct QA	$2a$12$6N.8N8GNFAzlXPmShrkrau5CRrT9n4fCK9UdTdF4vqwKsKKB4h6JW	\N	2026-06-20 00:21:15.571766+00	2026-06-20 00:21:15.571766+00
5027fc1f-29d8-43a1-984c-31e0ad5215e8	6ef432c6-1e42-44ef-98f3-d8073b66e030	proxy-1781914875@example.test	Proxy QA	$2a$12$tczMqmKIYXiksWLYfoElRe9R9wogzWfi086Jlfu2lsqFRxj0DNCQm	\N	2026-06-20 00:21:15.796359+00	2026-06-20 00:21:15.796359+00
a663d4f9-68f7-43a2-97c2-997fd7b9c7c3	6ef432c6-1e42-44ef-98f3-d8073b66e030	urllib-1781914894@example.test	Urllib QA	$2a$12$uzxWU2h1nUCiA8O7xSkvcOAvaSOMWva6UtCIhkGBCNSF1D2kdhb/m	\N	2026-06-20 00:21:35.06144+00	2026-06-20 00:21:35.06144+00
00b7f035-a18c-4a06-a8ba-a5757560404a	6ef432c6-1e42-44ef-98f3-d8073b66e030	host-1781916115@example.test	Host QA	$2a$12$AE8i/emiWnfpW9TyReUiXuF/FmVTkxTkniN/kqQHXCUB.cs.Yim5O	\N	2026-06-20 00:41:55.758983+00	2026-06-20 00:41:55.758983+00
bcef08c9-fea3-4fe0-8f1f-698160a14a6b	6ef432c6-1e42-44ef-98f3-d8073b66e030	proxy-fixed-1781916226@example.test	Proxy Fixed QA	$2a$12$dift1dy1wNGGy6aTU/fXJepLx.XZRpW5c/H27TZ5DZb24j21u8WjG	\N	2026-06-20 00:43:46.527828+00	2026-06-20 00:43:46.527828+00
c97d47cc-54c7-4f0e-9046-d185d25e2c53	6ef432c6-1e42-44ef-98f3-d8073b66e030	qa-tailnet-1781916246@example.test	QA Operator	$2a$12$OAPoLqMPoUX0kyTaf98ZMeAiOxvVBCm2WxyXPywgkK3fkcWpQHfay	\N	2026-06-20 00:44:06.277097+00	2026-06-20 00:44:06.277097+00
c74196bf-ddd6-4344-8a33-215877b60105	6ef432c6-1e42-44ef-98f3-d8073b66e030	qa-1781916803@example.test	QA Operator	$2a$12$wz8Ztg6crIhOfPj9S6T.eepsPeLr.sMpId0MejNxBaVoK27IeSXBe	\N	2026-06-20 00:53:23.934557+00	2026-06-20 00:53:23.934557+00
39688a15-57da-4684-bb57-386c9a511f4f	6ef432c6-1e42-44ef-98f3-d8073b66e030	qa-1781920327@example.test	QA 1781920327	$2a$12$GDlGvHhnL6uJKzFOcD403..Dmb3eKMyO98eyvsQdiQNcXDLspwkLq	\N	2026-06-20 01:52:07.705348+00	2026-06-20 01:52:07.705348+00
0ab0e667-683e-4c2e-95cb-1f3cb24ac8c7	6ef432c6-1e42-44ef-98f3-d8073b66e030	qa-1781920466@example.test	QA 1781920466	$2a$12$3y4Z5YvtBMiLg8GPBy5E7eVHT7NmRUpysO700XesbmydHFvoWODUe	\N	2026-06-20 01:54:26.447688+00	2026-06-20 01:54:26.447688+00
af5fc0e3-0cd1-4797-a637-503285a07ba1	6ef432c6-1e42-44ef-98f3-d8073b66e030	qa-1781921157@example.test	QA User	$2a$12$/kd7tK10ToKkCv.XZgzuee.MiMdd3p8z/RFASdm6BG2XNmGaYXvVC	\N	2026-06-20 02:05:57.484717+00	2026-06-20 02:05:57.484717+00
491787d6-bc49-4269-9906-df88d8c6c538	6ef432c6-1e42-44ef-98f3-d8073b66e030	direct-1781921158@example.test	Direct QA	$2a$12$Sw/gLDQGEwXNB7AS4BwrjOJ36kXJkSeamv5M9/SM0AjWdyM/2BgsK	\N	2026-06-20 02:05:59.167442+00	2026-06-20 02:05:59.167442+00
ed8dbbbd-be78-48c5-a25f-b477be44664f	6ef432c6-1e42-44ef-98f3-d8073b66e030	direct-api-1781921159@example.test	Direct API	$2a$12$dhSUatNlCa67Ka74Tlg2s.sNjD0KvvXCjYWPcMNwz/Mvg92qzZ4ru	\N	2026-06-20 02:05:59.391607+00	2026-06-20 02:05:59.391607+00
03b1ee7b-7174-46f8-bc10-4076f00e3f6d	6ef432c6-1e42-44ef-98f3-d8073b66e030	browser-regression-1781922090@example.test	Browser Regression 1781922090	$2a$12$56Z5ILmp.Q2q1oA6y5N.4ujNKuglfLT3rRDEBgG9HBcUxhXBvWRrq	\N	2026-06-20 02:21:30.87724+00	2026-06-20 02:21:30.87724+00
d350c588-2490-4f4b-b503-34a6f00c8993	6ef432c6-1e42-44ef-98f3-d8073b66e030	final-click-1781922565@example.test	Final Click 1781922565	$2a$12$5etr0iG4ffODEfiX1zvSHe8xGvslUgx/cFt4.VGxdpQnRdIcgqCgS	\N	2026-06-20 02:29:26.153361+00	2026-06-20 02:29:26.153361+00
91b94599-a248-42e1-b6f3-61f859f9180e	6ef432c6-1e42-44ef-98f3-d8073b66e030	final-click2-1781922631@example.test	Final Click2 1781922631	$2a$12$XFxOmhzOG2R2zn46mdcfduogAcwoR.yHo4J9bbI2uBPg/dPXw.72C	\N	2026-06-20 02:30:31.876448+00	2026-06-20 02:30:31.876448+00
b0fd262b-c401-4361-80a5-dff5be191690	6ef432c6-1e42-44ef-98f3-d8073b66e030	ernel.a@shore360.com	Ernel	$2a$12$kk7B/7BK7ZY99gJ4f.z/pehvk445prG2F19b/vaHmUbVzPGcIeNGW	\N	2026-06-20 02:33:53.576481+00	2026-06-20 02:33:53.576481+00
3703bd44-04e3-4131-8408-92287458b944	6ef432c6-1e42-44ef-98f3-d8073b66e030	port3010-1781926252@example.test	Port 3010 1781926252	$2a$12$ws2CpRKxcV.A6z8G10qlT.b2RIteB2MfMdZmaQX4mxYEoULdyIgr2	\N	2026-06-20 03:30:52.545434+00	2026-06-20 03:30:52.545434+00
756ee3c1-d06a-4384-96d1-7a3f1d9697bc	6ef432c6-1e42-44ef-98f3-d8073b66e030	client-exc-1782059095@example.test	Client Exception QA	$2a$12$Gn8X.yo32LOrUT9iWTRhpesZa5Im.Oc6voV1zEzHRQubtCs20.L96	\N	2026-06-21 16:24:55.801937+00	2026-06-21 16:24:55.801937+00
d81d019a-5ee2-4c04-852f-c6167d3185d3	6ef432c6-1e42-44ef-98f3-d8073b66e030	client-fix2-1782060010@example.test	Client Fix 1782060010	$2a$12$LCVq3FfYqvAFfozKcAGx6udIrsuziBcMv4.56KtExIrACr9g0TSCe	\N	2026-06-21 16:40:10.662488+00	2026-06-21 16:40:10.662488+00
\.


--
-- Name: alert_rules alert_rules_pkey; Type: CONSTRAINT; Schema: public; Owner: shore_sentinel
--

ALTER TABLE ONLY public.alert_rules
    ADD CONSTRAINT alert_rules_pkey PRIMARY KEY (id);


--
-- Name: artifacts artifacts_pkey; Type: CONSTRAINT; Schema: public; Owner: shore_sentinel
--

ALTER TABLE ONLY public.artifacts
    ADD CONSTRAINT artifacts_pkey PRIMARY KEY (id);


--
-- Name: artifacts artifacts_run_id_artifact_type_sha256_key; Type: CONSTRAINT; Schema: public; Owner: shore_sentinel
--

ALTER TABLE ONLY public.artifacts
    ADD CONSTRAINT artifacts_run_id_artifact_type_sha256_key UNIQUE (run_id, artifact_type, sha256);


--
-- Name: audit_log audit_log_pkey; Type: CONSTRAINT; Schema: public; Owner: shore_sentinel
--

ALTER TABLE ONLY public.audit_log
    ADD CONSTRAINT audit_log_pkey PRIMARY KEY (id);


--
-- Name: credentials credentials_pkey; Type: CONSTRAINT; Schema: public; Owner: shore_sentinel
--

ALTER TABLE ONLY public.credentials
    ADD CONSTRAINT credentials_pkey PRIMARY KEY (id);


--
-- Name: dashboard_summaries dashboard_summaries_pkey; Type: CONSTRAINT; Schema: public; Owner: shore_sentinel
--

ALTER TABLE ONLY public.dashboard_summaries
    ADD CONSTRAINT dashboard_summaries_pkey PRIMARY KEY (id);


--
-- Name: dashboard_summaries dashboard_summaries_tenant_id_summary_date_key; Type: CONSTRAINT; Schema: public; Owner: shore_sentinel
--

ALTER TABLE ONLY public.dashboard_summaries
    ADD CONSTRAINT dashboard_summaries_tenant_id_summary_date_key UNIQUE (tenant_id, summary_date);


--
-- Name: environments environments_pkey; Type: CONSTRAINT; Schema: public; Owner: shore_sentinel
--

ALTER TABLE ONLY public.environments
    ADD CONSTRAINT environments_pkey PRIMARY KEY (id);


--
-- Name: environments environments_tenant_id_slug_key; Type: CONSTRAINT; Schema: public; Owner: shore_sentinel
--

ALTER TABLE ONLY public.environments
    ADD CONSTRAINT environments_tenant_id_slug_key UNIQUE (tenant_id, slug);


--
-- Name: finding_instances finding_instances_pkey; Type: CONSTRAINT; Schema: public; Owner: shore_sentinel
--

ALTER TABLE ONLY public.finding_instances
    ADD CONSTRAINT finding_instances_pkey PRIMARY KEY (id);


--
-- Name: findings findings_pkey; Type: CONSTRAINT; Schema: public; Owner: shore_sentinel
--

ALTER TABLE ONLY public.findings
    ADD CONSTRAINT findings_pkey PRIMARY KEY (id);


--
-- Name: findings findings_tenant_id_scanner_finding_id_key; Type: CONSTRAINT; Schema: public; Owner: shore_sentinel
--

ALTER TABLE ONLY public.findings
    ADD CONSTRAINT findings_tenant_id_scanner_finding_id_key UNIQUE (tenant_id, scanner_finding_id);


--
-- Name: job_events job_events_pkey; Type: CONSTRAINT; Schema: public; Owner: shore_sentinel
--

ALTER TABLE ONLY public.job_events
    ADD CONSTRAINT job_events_pkey PRIMARY KEY (id);


--
-- Name: knowledgebase_articles knowledgebase_articles_pkey; Type: CONSTRAINT; Schema: public; Owner: shore_sentinel
--

ALTER TABLE ONLY public.knowledgebase_articles
    ADD CONSTRAINT knowledgebase_articles_pkey PRIMARY KEY (id);


--
-- Name: knowledgebase_articles knowledgebase_articles_tenant_id_slug_key; Type: CONSTRAINT; Schema: public; Owner: shore_sentinel
--

ALTER TABLE ONLY public.knowledgebase_articles
    ADD CONSTRAINT knowledgebase_articles_tenant_id_slug_key UNIQUE (tenant_id, slug);


--
-- Name: knowledgebase_categories knowledgebase_categories_pkey; Type: CONSTRAINT; Schema: public; Owner: shore_sentinel
--

ALTER TABLE ONLY public.knowledgebase_categories
    ADD CONSTRAINT knowledgebase_categories_pkey PRIMARY KEY (id);


--
-- Name: knowledgebase_categories knowledgebase_categories_tenant_id_slug_key; Type: CONSTRAINT; Schema: public; Owner: shore_sentinel
--

ALTER TABLE ONLY public.knowledgebase_categories
    ADD CONSTRAINT knowledgebase_categories_tenant_id_slug_key UNIQUE (tenant_id, slug);


--
-- Name: notification_email_templates notification_email_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: shore_sentinel
--

ALTER TABLE ONLY public.notification_email_templates
    ADD CONSTRAINT notification_email_templates_pkey PRIMARY KEY (id);


--
-- Name: notification_events notification_events_pkey; Type: CONSTRAINT; Schema: public; Owner: shore_sentinel
--

ALTER TABLE ONLY public.notification_events
    ADD CONSTRAINT notification_events_pkey PRIMARY KEY (id);


--
-- Name: one_time_audits one_time_audits_pkey; Type: CONSTRAINT; Schema: public; Owner: shore_sentinel
--

ALTER TABLE ONLY public.one_time_audits
    ADD CONSTRAINT one_time_audits_pkey PRIMARY KEY (id);


--
-- Name: remediation_items remediation_items_pkey; Type: CONSTRAINT; Schema: public; Owner: shore_sentinel
--

ALTER TABLE ONLY public.remediation_items
    ADD CONSTRAINT remediation_items_pkey PRIMARY KEY (id);


--
-- Name: retention_policies retention_policies_pkey; Type: CONSTRAINT; Schema: public; Owner: shore_sentinel
--

ALTER TABLE ONLY public.retention_policies
    ADD CONSTRAINT retention_policies_pkey PRIMARY KEY (id);


--
-- Name: role_feature_permissions role_feature_permissions_pkey; Type: CONSTRAINT; Schema: public; Owner: shore_sentinel
--

ALTER TABLE ONLY public.role_feature_permissions
    ADD CONSTRAINT role_feature_permissions_pkey PRIMARY KEY (id);


--
-- Name: role_feature_permissions role_feature_permissions_tenant_id_role_id_feature_area_key; Type: CONSTRAINT; Schema: public; Owner: shore_sentinel
--

ALTER TABLE ONLY public.role_feature_permissions
    ADD CONSTRAINT role_feature_permissions_tenant_id_role_id_feature_area_key UNIQUE (tenant_id, role_id, feature_area);


--
-- Name: roles roles_name_key; Type: CONSTRAINT; Schema: public; Owner: shore_sentinel
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT roles_name_key UNIQUE (name);


--
-- Name: roles roles_pkey; Type: CONSTRAINT; Schema: public; Owner: shore_sentinel
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT roles_pkey PRIMARY KEY (id);


--
-- Name: scan_jobs scan_jobs_pkey; Type: CONSTRAINT; Schema: public; Owner: shore_sentinel
--

ALTER TABLE ONLY public.scan_jobs
    ADD CONSTRAINT scan_jobs_pkey PRIMARY KEY (id);


--
-- Name: scan_runs scan_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: shore_sentinel
--

ALTER TABLE ONLY public.scan_runs
    ADD CONSTRAINT scan_runs_pkey PRIMARY KEY (id);


--
-- Name: schedules schedules_pkey; Type: CONSTRAINT; Schema: public; Owner: shore_sentinel
--

ALTER TABLE ONLY public.schedules
    ADD CONSTRAINT schedules_pkey PRIMARY KEY (id);


--
-- Name: settings settings_pkey; Type: CONSTRAINT; Schema: public; Owner: shore_sentinel
--

ALTER TABLE ONLY public.settings
    ADD CONSTRAINT settings_pkey PRIMARY KEY (id);


--
-- Name: settings settings_tenant_id_key; Type: CONSTRAINT; Schema: public; Owner: shore_sentinel
--

ALTER TABLE ONLY public.settings
    ADD CONSTRAINT settings_tenant_id_key UNIQUE (tenant_id);


--
-- Name: smtp_settings smtp_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: shore_sentinel
--

ALTER TABLE ONLY public.smtp_settings
    ADD CONSTRAINT smtp_settings_pkey PRIMARY KEY (id);


--
-- Name: smtp_settings smtp_settings_tenant_id_key; Type: CONSTRAINT; Schema: public; Owner: shore_sentinel
--

ALTER TABLE ONLY public.smtp_settings
    ADD CONSTRAINT smtp_settings_tenant_id_key UNIQUE (tenant_id);


--
-- Name: target_group_members target_group_members_pkey; Type: CONSTRAINT; Schema: public; Owner: shore_sentinel
--

ALTER TABLE ONLY public.target_group_members
    ADD CONSTRAINT target_group_members_pkey PRIMARY KEY (target_group_id, target_id);


--
-- Name: target_groups target_groups_pkey; Type: CONSTRAINT; Schema: public; Owner: shore_sentinel
--

ALTER TABLE ONLY public.target_groups
    ADD CONSTRAINT target_groups_pkey PRIMARY KEY (id);


--
-- Name: target_groups target_groups_tenant_id_slug_key; Type: CONSTRAINT; Schema: public; Owner: shore_sentinel
--

ALTER TABLE ONLY public.target_groups
    ADD CONSTRAINT target_groups_tenant_id_slug_key UNIQUE (tenant_id, slug);


--
-- Name: target_identities target_identities_pkey; Type: CONSTRAINT; Schema: public; Owner: shore_sentinel
--

ALTER TABLE ONLY public.target_identities
    ADD CONSTRAINT target_identities_pkey PRIMARY KEY (id);


--
-- Name: target_identities target_identities_tenant_id_device_id_key; Type: CONSTRAINT; Schema: public; Owner: shore_sentinel
--

ALTER TABLE ONLY public.target_identities
    ADD CONSTRAINT target_identities_tenant_id_device_id_key UNIQUE (tenant_id, device_id);


--
-- Name: target_status_checks target_status_checks_pkey; Type: CONSTRAINT; Schema: public; Owner: shore_sentinel
--

ALTER TABLE ONLY public.target_status_checks
    ADD CONSTRAINT target_status_checks_pkey PRIMARY KEY (id);


--
-- Name: targets targets_pkey; Type: CONSTRAINT; Schema: public; Owner: shore_sentinel
--

ALTER TABLE ONLY public.targets
    ADD CONSTRAINT targets_pkey PRIMARY KEY (id);


--
-- Name: tenants tenants_pkey; Type: CONSTRAINT; Schema: public; Owner: shore_sentinel
--

ALTER TABLE ONLY public.tenants
    ADD CONSTRAINT tenants_pkey PRIMARY KEY (id);


--
-- Name: tenants tenants_slug_key; Type: CONSTRAINT; Schema: public; Owner: shore_sentinel
--

ALTER TABLE ONLY public.tenants
    ADD CONSTRAINT tenants_slug_key UNIQUE (slug);


--
-- Name: user_roles user_roles_pkey; Type: CONSTRAINT; Schema: public; Owner: shore_sentinel
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_pkey PRIMARY KEY (user_id, role_id);


--
-- Name: users users_email_key; Type: CONSTRAINT; Schema: public; Owner: shore_sentinel
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_key UNIQUE (email);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: shore_sentinel
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: artifacts_run_idx; Type: INDEX; Schema: public; Owner: shore_sentinel
--

CREATE INDEX artifacts_run_idx ON public.artifacts USING btree (tenant_id, run_id, artifact_type);


--
-- Name: job_events_run_created_idx; Type: INDEX; Schema: public; Owner: shore_sentinel
--

CREATE INDEX job_events_run_created_idx ON public.job_events USING btree (tenant_id, run_id, created_at DESC);


--
-- Name: scan_jobs_subject_idx; Type: INDEX; Schema: public; Owner: shore_sentinel
--

CREATE INDEX scan_jobs_subject_idx ON public.scan_jobs USING btree (tenant_id, subject_type, target_id, one_time_audit_id);


--
-- Name: scan_runs_job_idx; Type: INDEX; Schema: public; Owner: shore_sentinel
--

CREATE INDEX scan_runs_job_idx ON public.scan_runs USING btree (tenant_id, job_id, status);


--
-- Name: alert_rules alert_rules_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: shore_sentinel
--

ALTER TABLE ONLY public.alert_rules
    ADD CONSTRAINT alert_rules_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: artifacts artifacts_retention_policy_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: shore_sentinel
--

ALTER TABLE ONLY public.artifacts
    ADD CONSTRAINT artifacts_retention_policy_id_fkey FOREIGN KEY (retention_policy_id) REFERENCES public.retention_policies(id);


--
-- Name: artifacts artifacts_run_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: shore_sentinel
--

ALTER TABLE ONLY public.artifacts
    ADD CONSTRAINT artifacts_run_id_fkey FOREIGN KEY (run_id) REFERENCES public.scan_runs(id);


--
-- Name: artifacts artifacts_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: shore_sentinel
--

ALTER TABLE ONLY public.artifacts
    ADD CONSTRAINT artifacts_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: audit_log audit_log_actor_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: shore_sentinel
--

ALTER TABLE ONLY public.audit_log
    ADD CONSTRAINT audit_log_actor_user_id_fkey FOREIGN KEY (actor_user_id) REFERENCES public.users(id);


--
-- Name: audit_log audit_log_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: shore_sentinel
--

ALTER TABLE ONLY public.audit_log
    ADD CONSTRAINT audit_log_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: credentials credentials_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: shore_sentinel
--

ALTER TABLE ONLY public.credentials
    ADD CONSTRAINT credentials_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: dashboard_summaries dashboard_summaries_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: shore_sentinel
--

ALTER TABLE ONLY public.dashboard_summaries
    ADD CONSTRAINT dashboard_summaries_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: environments environments_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: shore_sentinel
--

ALTER TABLE ONLY public.environments
    ADD CONSTRAINT environments_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: finding_instances finding_instances_finding_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: shore_sentinel
--

ALTER TABLE ONLY public.finding_instances
    ADD CONSTRAINT finding_instances_finding_id_fkey FOREIGN KEY (finding_id) REFERENCES public.findings(id);


--
-- Name: finding_instances finding_instances_one_time_audit_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: shore_sentinel
--

ALTER TABLE ONLY public.finding_instances
    ADD CONSTRAINT finding_instances_one_time_audit_id_fkey FOREIGN KEY (one_time_audit_id) REFERENCES public.one_time_audits(id);


--
-- Name: finding_instances finding_instances_run_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: shore_sentinel
--

ALTER TABLE ONLY public.finding_instances
    ADD CONSTRAINT finding_instances_run_id_fkey FOREIGN KEY (run_id) REFERENCES public.scan_runs(id);


--
-- Name: finding_instances finding_instances_source_artifact_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: shore_sentinel
--

ALTER TABLE ONLY public.finding_instances
    ADD CONSTRAINT finding_instances_source_artifact_id_fkey FOREIGN KEY (source_artifact_id) REFERENCES public.artifacts(id);


--
-- Name: finding_instances finding_instances_target_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: shore_sentinel
--

ALTER TABLE ONLY public.finding_instances
    ADD CONSTRAINT finding_instances_target_id_fkey FOREIGN KEY (target_id) REFERENCES public.targets(id);


--
-- Name: finding_instances finding_instances_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: shore_sentinel
--

ALTER TABLE ONLY public.finding_instances
    ADD CONSTRAINT finding_instances_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: findings findings_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: shore_sentinel
--

ALTER TABLE ONLY public.findings
    ADD CONSTRAINT findings_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: job_events job_events_job_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: shore_sentinel
--

ALTER TABLE ONLY public.job_events
    ADD CONSTRAINT job_events_job_id_fkey FOREIGN KEY (job_id) REFERENCES public.scan_jobs(id);


--
-- Name: job_events job_events_run_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: shore_sentinel
--

ALTER TABLE ONLY public.job_events
    ADD CONSTRAINT job_events_run_id_fkey FOREIGN KEY (run_id) REFERENCES public.scan_runs(id);


--
-- Name: job_events job_events_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: shore_sentinel
--

ALTER TABLE ONLY public.job_events
    ADD CONSTRAINT job_events_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: knowledgebase_articles knowledgebase_articles_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: shore_sentinel
--

ALTER TABLE ONLY public.knowledgebase_articles
    ADD CONSTRAINT knowledgebase_articles_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.knowledgebase_categories(id);


--
-- Name: knowledgebase_articles knowledgebase_articles_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: shore_sentinel
--

ALTER TABLE ONLY public.knowledgebase_articles
    ADD CONSTRAINT knowledgebase_articles_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: knowledgebase_articles knowledgebase_articles_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: shore_sentinel
--

ALTER TABLE ONLY public.knowledgebase_articles
    ADD CONSTRAINT knowledgebase_articles_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: knowledgebase_articles knowledgebase_articles_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: shore_sentinel
--

ALTER TABLE ONLY public.knowledgebase_articles
    ADD CONSTRAINT knowledgebase_articles_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.users(id);


--
-- Name: knowledgebase_categories knowledgebase_categories_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: shore_sentinel
--

ALTER TABLE ONLY public.knowledgebase_categories
    ADD CONSTRAINT knowledgebase_categories_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: notification_email_templates notification_email_templates_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: shore_sentinel
--

ALTER TABLE ONLY public.notification_email_templates
    ADD CONSTRAINT notification_email_templates_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: notification_events notification_events_run_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: shore_sentinel
--

ALTER TABLE ONLY public.notification_events
    ADD CONSTRAINT notification_events_run_id_fkey FOREIGN KEY (run_id) REFERENCES public.scan_runs(id);


--
-- Name: notification_events notification_events_target_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: shore_sentinel
--

ALTER TABLE ONLY public.notification_events
    ADD CONSTRAINT notification_events_target_id_fkey FOREIGN KEY (target_id) REFERENCES public.targets(id);


--
-- Name: notification_events notification_events_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: shore_sentinel
--

ALTER TABLE ONLY public.notification_events
    ADD CONSTRAINT notification_events_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: one_time_audits one_time_audits_requested_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: shore_sentinel
--

ALTER TABLE ONLY public.one_time_audits
    ADD CONSTRAINT one_time_audits_requested_by_fkey FOREIGN KEY (requested_by) REFERENCES public.users(id);


--
-- Name: one_time_audits one_time_audits_retention_policy_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: shore_sentinel
--

ALTER TABLE ONLY public.one_time_audits
    ADD CONSTRAINT one_time_audits_retention_policy_id_fkey FOREIGN KEY (retention_policy_id) REFERENCES public.retention_policies(id);


--
-- Name: one_time_audits one_time_audits_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: shore_sentinel
--

ALTER TABLE ONLY public.one_time_audits
    ADD CONSTRAINT one_time_audits_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: remediation_items remediation_items_finding_instance_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: shore_sentinel
--

ALTER TABLE ONLY public.remediation_items
    ADD CONSTRAINT remediation_items_finding_instance_id_fkey FOREIGN KEY (finding_instance_id) REFERENCES public.finding_instances(id);


--
-- Name: remediation_items remediation_items_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: shore_sentinel
--

ALTER TABLE ONLY public.remediation_items
    ADD CONSTRAINT remediation_items_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: retention_policies retention_policies_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: shore_sentinel
--

ALTER TABLE ONLY public.retention_policies
    ADD CONSTRAINT retention_policies_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: role_feature_permissions role_feature_permissions_role_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: shore_sentinel
--

ALTER TABLE ONLY public.role_feature_permissions
    ADD CONSTRAINT role_feature_permissions_role_id_fkey FOREIGN KEY (role_id) REFERENCES public.roles(id);


--
-- Name: role_feature_permissions role_feature_permissions_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: shore_sentinel
--

ALTER TABLE ONLY public.role_feature_permissions
    ADD CONSTRAINT role_feature_permissions_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: scan_jobs scan_jobs_one_time_audit_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: shore_sentinel
--

ALTER TABLE ONLY public.scan_jobs
    ADD CONSTRAINT scan_jobs_one_time_audit_id_fkey FOREIGN KEY (one_time_audit_id) REFERENCES public.one_time_audits(id);


--
-- Name: scan_jobs scan_jobs_requested_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: shore_sentinel
--

ALTER TABLE ONLY public.scan_jobs
    ADD CONSTRAINT scan_jobs_requested_by_fkey FOREIGN KEY (requested_by) REFERENCES public.users(id);


--
-- Name: scan_jobs scan_jobs_target_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: shore_sentinel
--

ALTER TABLE ONLY public.scan_jobs
    ADD CONSTRAINT scan_jobs_target_id_fkey FOREIGN KEY (target_id) REFERENCES public.targets(id);


--
-- Name: scan_jobs scan_jobs_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: shore_sentinel
--

ALTER TABLE ONLY public.scan_jobs
    ADD CONSTRAINT scan_jobs_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: scan_runs scan_runs_job_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: shore_sentinel
--

ALTER TABLE ONLY public.scan_runs
    ADD CONSTRAINT scan_runs_job_id_fkey FOREIGN KEY (job_id) REFERENCES public.scan_jobs(id);


--
-- Name: scan_runs scan_runs_one_time_audit_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: shore_sentinel
--

ALTER TABLE ONLY public.scan_runs
    ADD CONSTRAINT scan_runs_one_time_audit_id_fkey FOREIGN KEY (one_time_audit_id) REFERENCES public.one_time_audits(id);


--
-- Name: scan_runs scan_runs_target_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: shore_sentinel
--

ALTER TABLE ONLY public.scan_runs
    ADD CONSTRAINT scan_runs_target_id_fkey FOREIGN KEY (target_id) REFERENCES public.targets(id);


--
-- Name: scan_runs scan_runs_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: shore_sentinel
--

ALTER TABLE ONLY public.scan_runs
    ADD CONSTRAINT scan_runs_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: schedules schedules_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: shore_sentinel
--

ALTER TABLE ONLY public.schedules
    ADD CONSTRAINT schedules_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: schedules schedules_target_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: shore_sentinel
--

ALTER TABLE ONLY public.schedules
    ADD CONSTRAINT schedules_target_id_fkey FOREIGN KEY (target_id) REFERENCES public.targets(id);


--
-- Name: schedules schedules_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: shore_sentinel
--

ALTER TABLE ONLY public.schedules
    ADD CONSTRAINT schedules_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: settings settings_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: shore_sentinel
--

ALTER TABLE ONLY public.settings
    ADD CONSTRAINT settings_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: smtp_settings smtp_settings_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: shore_sentinel
--

ALTER TABLE ONLY public.smtp_settings
    ADD CONSTRAINT smtp_settings_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: target_group_members target_group_members_target_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: shore_sentinel
--

ALTER TABLE ONLY public.target_group_members
    ADD CONSTRAINT target_group_members_target_group_id_fkey FOREIGN KEY (target_group_id) REFERENCES public.target_groups(id) ON DELETE CASCADE;


--
-- Name: target_group_members target_group_members_target_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: shore_sentinel
--

ALTER TABLE ONLY public.target_group_members
    ADD CONSTRAINT target_group_members_target_id_fkey FOREIGN KEY (target_id) REFERENCES public.targets(id) ON DELETE CASCADE;


--
-- Name: target_groups target_groups_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: shore_sentinel
--

ALTER TABLE ONLY public.target_groups
    ADD CONSTRAINT target_groups_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: target_identities target_identities_target_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: shore_sentinel
--

ALTER TABLE ONLY public.target_identities
    ADD CONSTRAINT target_identities_target_id_fkey FOREIGN KEY (target_id) REFERENCES public.targets(id);


--
-- Name: target_identities target_identities_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: shore_sentinel
--

ALTER TABLE ONLY public.target_identities
    ADD CONSTRAINT target_identities_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: target_status_checks target_status_checks_target_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: shore_sentinel
--

ALTER TABLE ONLY public.target_status_checks
    ADD CONSTRAINT target_status_checks_target_id_fkey FOREIGN KEY (target_id) REFERENCES public.targets(id);


--
-- Name: target_status_checks target_status_checks_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: shore_sentinel
--

ALTER TABLE ONLY public.target_status_checks
    ADD CONSTRAINT target_status_checks_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: targets targets_environment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: shore_sentinel
--

ALTER TABLE ONLY public.targets
    ADD CONSTRAINT targets_environment_id_fkey FOREIGN KEY (environment_id) REFERENCES public.environments(id);


--
-- Name: targets targets_promoted_from_audit_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: shore_sentinel
--

ALTER TABLE ONLY public.targets
    ADD CONSTRAINT targets_promoted_from_audit_id_fkey FOREIGN KEY (promoted_from_audit_id) REFERENCES public.one_time_audits(id);


--
-- Name: targets targets_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: shore_sentinel
--

ALTER TABLE ONLY public.targets
    ADD CONSTRAINT targets_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: user_roles user_roles_role_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: shore_sentinel
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_role_id_fkey FOREIGN KEY (role_id) REFERENCES public.roles(id) ON DELETE CASCADE;


--
-- Name: user_roles user_roles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: shore_sentinel
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: users users_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: shore_sentinel
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- PostgreSQL database dump complete
--

\unrestrict oRvOTmHhQUIu8sKJ8D2HNoQkMoaon3Zm6T5DCELkQtef8ihIhkGwAeKO50mPKdd

