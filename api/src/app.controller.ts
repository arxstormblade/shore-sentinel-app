import { BadRequestException, Body, ConflictException, Controller, Delete, ForbiddenException, Get, Header, NotFoundException, Param, Patch, Post, Req, Res, UnauthorizedException } from '@nestjs/common';
import bcrypt from 'bcryptjs';
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { Readable } from 'node:stream';
import type { Request, Response } from 'express';
import { RUN_EVENT_TYPE, scannerBundleContractVersion } from '@shore-sentinel/shared';
import { ArtifactService } from './artifact.service.js';
import { AuthService } from './auth.service.js';
import { DatabaseService } from './database.service.js';
import { QueueService, workerRetryPolicyFromEnv } from './queue.service.js';
import { UpdateService } from './update.service.js';
import { assertExactlyOneSubject, requireString, requireWorkerAttempt, validateArtifactType, validateCanonicalWorkerArtifactBase64, validateScanTarget, workerExecutionTimeBudget } from './validation.js';
import { ROLE_MATRIX } from './config.js';
import { assertSshLaunchRequirements } from './ssh-security.js';
import type { RequestPrincipal } from './request-principal.js';
import { AuthorizationService } from './engagement/authorization.service.js';
import { ExecutionGrantService } from './policy/execution-grant.service.js';
import { AccessGovernanceService } from './identity/access-governance.service.js';
import { MfaService } from './identity/mfa.service.js';

const THIRTY_DAYS_SECONDS = 60 * 60 * 24 * 30;
const ARTIFACT_CONTENT_TYPES: Record<string, string> = {
  json: 'application/json',
  markdown: 'text/markdown; charset=utf-8',
  sarif: 'application/sarif+json',
  pdf: 'application/pdf',
  'scanner.raw_output': 'application/json',
  'scanner.normalized_findings': 'application/json',
  'scanner.enrichment_summary': 'application/json',
};

const PUBLIC_SCAN_RUN_EVENT: Record<string, { status: string; message: string }> = {
  'job.queued': { status: 'queued', message: 'Scan job queued' },
  'job.claimed': { status: 'leased', message: 'Scan job claimed' },
  'job.running': { status: 'running', message: 'Scan is running' },
  'parse.started': { status: 'running', message: 'Processing scan results' },
  'parse.succeeded': { status: 'running', message: 'Scan results processed' },
  'artifact.upload_requested': { status: 'running', message: 'Preparing scan artifacts' },
  'artifact.upload_succeeded': { status: 'running', message: 'Scan artifacts uploaded' },
  'artifact.uploaded': { status: 'running', message: 'Scan artifact available' },
  'job.retry_scheduled': { status: 'pending', message: 'Scan retry scheduled' },
  'job.succeeded': { status: 'completed', message: 'Scan completed' },
  'job.failed': { status: 'failed', message: 'Scan failed' },
  'scan.cancelled': { status: 'cancelled', message: 'Scan cancelled' },
};

function sshSeal(plaintext: string) {
  const keySeed = process.env.SHORE_SENTINEL_SECRET_KEY;
  if (!keySeed || keySeed.length < 32) throw new Error('SHORE_SENTINEL_SECRET_KEY is required for SSH credential sealing');
  const key = createHash('sha256').update(keySeed).digest();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString('base64url')}:${ciphertext.toString('base64url')}:${tag.toString('base64url')}`;
}

function sshUnseal(sealed: unknown) {
  const keySeed = process.env.SHORE_SENTINEL_SECRET_KEY;
  if (!keySeed || keySeed.length < 32) throw new Error('SHORE_SENTINEL_SECRET_KEY is required for SSH credential unsealing');
  if (typeof sealed !== 'string') throw new Error('sealed SSH credential is invalid');
  const [version, ivText, ciphertextText, tagText, ...extra] = sealed.split(':');
  if (version !== 'v1' || !ivText || !ciphertextText || !tagText || extra.length) throw new Error('sealed SSH credential is invalid');
  try {
    const decipher = createDecipheriv('aes-256-gcm', createHash('sha256').update(keySeed).digest(), Buffer.from(ivText, 'base64url'));
    decipher.setAuthTag(Buffer.from(tagText, 'base64url'));
    return JSON.parse(Buffer.concat([decipher.update(Buffer.from(ciphertextText, 'base64url')), decipher.final()]).toString('utf8')) as Record<string, unknown>;
  } catch {
    throw new Error('sealed SSH credential is invalid');
  }
}

function sshFingerprint(plaintext: string) {
  return createHash('sha256').update(plaintext).digest('hex');
}

function parseSshPort(body: Record<string, unknown>) {
  const raw = body.ssh_port ?? body.sshPort ?? 22;
  const port = typeof raw === 'number' ? raw : parseInt(String(raw), 10);
  return Number.isFinite(port) && port > 0 && port <= 65535 ? port : 22;
}

function trimText(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function requireUuid(body: Record<string, unknown>, field: string) {
  const value = requireString(body, field);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new BadRequestException(`${field} must be a valid UUID`);
  }
  return value;
}

type SshEnrollment = {
  hostKeyAlgorithm: 'ssh-ed25519';
  hostKeyFingerprint: string;
  allowedCidr: string;
  rootPath: string;
};

function assertSshEnrollment(body: Record<string, unknown>): SshEnrollment {
  const hostKeyAlgorithm = requireString(body, 'ssh_host_key_algorithm');
  if (body.ssh_host_key_algorithm !== hostKeyAlgorithm || hostKeyAlgorithm !== 'ssh-ed25519') throw new BadRequestException('ssh_host_key_algorithm must be ssh-ed25519');

  const hostKeyFingerprint = requireString(body, 'ssh_host_key_fingerprint');
  if (body.ssh_host_key_fingerprint !== hostKeyFingerprint || !/^SHA256:[A-Za-z0-9+/]{43}$/.test(hostKeyFingerprint)) {
    throw new BadRequestException('ssh_host_key_fingerprint must be a canonical ssh-ed25519 SHA256 fingerprint');
  }

  const allowedCidr = requireString(body, 'ssh_allowed_cidr');
  const [address, prefix, ...extra] = allowedCidr.split('/');
  const octets = address?.split('.') ?? [];
  const validAddress = octets.length === 4 && octets.every((octet) => /^(0|[1-9]\d{0,2})$/.test(octet) && Number(octet) <= 255);
  if (extra.length || !validAddress || !/^(?:[0-9]|[12][0-9]|3[0-2])$/.test(prefix ?? '')) {
    throw new BadRequestException('ssh_allowed_cidr must be a valid IPv4 CIDR');
  }
  if (prefix === '0') throw new BadRequestException('ssh_allowed_cidr must not permit unrestricted IPv4 CIDRs');

  const rootPath = requireString(body, 'ssh_root_path');
  const rootSegments = rootPath.split('/').slice(1);
  if (!rootPath.startsWith('/') || rootPath.endsWith('/') || !rootSegments.length || rootSegments.some((segment) => !segment || segment === '.' || segment === '..' || /[\u0000-\u001f\u007f\\]/.test(segment))) {
    throw new BadRequestException('ssh_root_path must be an absolute enrolled root');
  }

  return { hostKeyAlgorithm: 'ssh-ed25519', hostKeyFingerprint, allowedCidr, rootPath };
}

function assertSshGrantControls(row: Record<string, unknown> | undefined): asserts row is Record<string, unknown> {
  const unavailable = !row
    || !['pending', 'leased', 'running'].includes(String(row.run_status))
    || row.cancellation_requested_at !== null
    || row.grant_revoked_at !== null
    || row.host_key_revoked_at !== null
    || row.credential_disabled_at !== null
    // These aliases are intentionally not returned by the current query. If a stale or malformed
    // result adds one, reject rather than inferring it is safe from an ambiguous control field.
    || row.cancelled_at !== undefined
    || row.revoked_at !== undefined
    || row.expires_at !== undefined
    || row.consumed_at !== undefined
    || typeof row.grant_id !== 'string'
    || !row.grant_id
    || !Number.isSafeInteger(Number(row.retry_max_attempts))
    || Number(row.retry_max_attempts) < 1
    || Number.isNaN(Date.parse(String(row.grant_expires_at)))
    || Date.parse(String(row.grant_expires_at)) <= Date.now();
  if (unavailable) throw new ForbiddenException('SSH execution grant unavailable');
}

@Controller()
export class AppController {
  constructor(
    private readonly db: DatabaseService,
    private readonly auth: AuthService,
    private readonly queue: QueueService,
    private readonly artifacts: ArtifactService,
    private readonly updates: UpdateService,
    private readonly authorization?: AuthorizationService,
    private readonly executionGrants?: ExecutionGrantService,
    private readonly accessGovernance?: AccessGovernanceService,
    private readonly mfa?: MfaService,
  ) {}

  @Get('health') health() { return { ok: true, service: 'shore-sentinel-api' }; }
  @Get('ready') async ready() { await this.db.query('SELECT 1'); return { ok: this.db.isReady(), database: 'ok', redis: await this.queue.health().catch((error) => ({ configured: true, error: error.message })) }; }
  @Post('auth/register') async register(@Body() body: Record<string, unknown>, @Res({ passthrough: true }) res: Response) { if (process.env.SHORE_SENTINEL_ALLOW_PUBLIC_REGISTRATION !== 'true') throw new ForbiddenException('Public registration is disabled'); const rememberMe = this.rememberMe(body); const result = await this.auth.register(requireString(body, 'name'), requireString(body, 'email'), requireString(body, 'password'), rememberMe); this.setSessionCookie(res, result.token, rememberMe); return { user: result.user }; }
  @Post('auth/login') async login(@Body() body: Record<string, unknown>, @Res({ passthrough: true }) res: Response) { const rememberMe = this.rememberMe(body); const result = await this.auth.login(requireString(body, 'email'), requireString(body, 'password'), rememberMe); this.setSessionCookie(res, result.token, rememberMe); return { user: result.user }; }
  @Post('auth/logout') logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) { this.auth.logout(this.token(req)); res.clearCookie('shore_session'); return { ok: true }; }
  @Get('auth/me') async me(@Req() req: Request) { return this.auth.me(this.token(req)); }
  @Post('auth/mfa/enroll') async enrollMfa(@Req() req: Request) { const actor = this.principal(req); return (this.mfa ?? new MfaService(this.db)).enrollTotp(actor.tenantId, actor.userId); }
  @Post('auth/mfa/verify') async verifyMfa(@Body() body: Record<string, unknown>, @Req() req: Request) { const actor = this.principal(req); const token = this.token(req); if (!token) throw new UnauthorizedException('Authentication required'); const valid = await (this.mfa ?? new MfaService(this.db)).verifyTotp(actor.tenantId, actor.userId, requireString(body, 'code')); return this.auth.verifyMfa(token, valid); }
  @Get('settings/current') async settings(@Req() req: Request) { const tenantId = this.tenantId(req); const result = await this.db.query('SELECT s.*, t.slug AS tenant_slug FROM settings s JOIN tenants t ON t.id=s.tenant_id WHERE s.tenant_id=$1', [tenantId]); return result.rows[0]; }

  @Get('system/update')
  async updateStatus(@Req() req: Request) {
    await this.requireAdmin(req);
    return this.updates.run('status');
  }

  @Post('system/update/check')
  async checkUpdate(@Req() req: Request) {
    await this.requireAdmin(req);
    return this.updates.run('check');
  }

  @Post('system/update/apply')
  async applyUpdate(@Req() req: Request) {
    await this.requireAdmin(req);
    return this.updates.run('apply');
  }

  @Get('targets')
  async listTargets(@Req() req: Request) {
    const tenantId = this.tenantId(req);
    const result = await this.db.query(
      `SELECT t.id, t.hostname AS name, t.hostname, t.fqdn, t.ip_address::text AS ip_address,
              COALESCE(e.name, 'Unassigned') AS env,
              COALESCE(t.owner_team, 'Unassigned owner') AS owner,
              COALESCE(t.platform, 'unknown') AS platform,
              COALESCE(t.status, 'unknown') AS status,
              t.connection_mode, t.ssh_auth_method, t.ssh_port, t.ssh_username,
              t.last_seen_at, t.last_successful_scan_at, t.created_at,
              COUNT(DISTINCT fi.id)::int AS finding_count,
              COUNT(DISTINCT ri.id) FILTER (WHERE ri.status IN ('open','accepted'))::int AS remediation_count,
              COALESCE(MAX(sr.created_at), t.created_at) AS latest_activity_at
       FROM targets t
       LEFT JOIN environments e ON e.id = t.environment_id
       LEFT JOIN scan_runs sr ON sr.target_id = t.id
       LEFT JOIN finding_instances fi ON fi.target_id = t.id
       LEFT JOIN remediation_items ri ON ri.finding_instance_id = fi.id
       WHERE t.tenant_id = $1 AND t.asset_mode = 'managed_machine'
       GROUP BY t.id, e.name
       ORDER BY latest_activity_at DESC`,
      [tenantId],
    );
    return result.rows;
  }

  @Get('targets/:id')
  async getTarget(@Param('id') id: string, @Req() req: Request) {
    const tenantId = this.tenantId(req);
    const result = await this.db.query(
      `SELECT t.id, t.hostname AS name, t.hostname, t.fqdn, t.ip_address::text AS ip_address,
              COALESCE(e.name, 'Unassigned') AS env,
              COALESCE(t.owner_team, 'Unassigned owner') AS owner,
              COALESCE(t.platform, 'unknown') AS platform,
              COALESCE(t.status, 'unknown') AS status,
              t.connection_mode, t.ssh_auth_method, t.ssh_port, t.ssh_username,
              t.last_seen_at, t.last_successful_scan_at, t.created_at,
              latest_run.app_version AS agent_version,
              latest_run.scanner_bundle_version,
              latest_run.heartbeat_at AS latest_heartbeat_at,
              COUNT(DISTINCT fi.id)::int AS finding_count,
              COUNT(DISTINCT ri.id) FILTER (WHERE ri.status IN ('open','accepted'))::int AS remediation_count
       FROM targets t
       LEFT JOIN environments e ON e.id = t.environment_id
       LEFT JOIN LATERAL (
         SELECT app_version, scanner_bundle_version, heartbeat_at
         FROM scan_runs
         WHERE tenant_id=$1 AND target_id=t.id AND status='completed'
         ORDER BY completed_at DESC NULLS LAST, created_at DESC
         LIMIT 1
       ) latest_run ON TRUE
       LEFT JOIN scan_runs sr ON sr.target_id = t.id
       LEFT JOIN finding_instances fi ON fi.target_id = t.id
       LEFT JOIN remediation_items ri ON ri.finding_instance_id = fi.id
       WHERE t.tenant_id = $1 AND t.id = $2
       GROUP BY t.id, e.name, latest_run.app_version, latest_run.scanner_bundle_version, latest_run.heartbeat_at`,
      [tenantId, id],
    );
    if (!result.rows[0]) throw new BadRequestException('target not found');
    const reports = await this.db.query('SELECT id, status, subject_type, created_at FROM scan_runs WHERE tenant_id=$1 AND target_id=$2 ORDER BY created_at DESC LIMIT 10', [tenantId, id]);
    const remediation = await this.db.query(
      `SELECT ri.id, ri.title, ri.status, f.severity
       FROM remediation_items ri
       JOIN finding_instances fi ON fi.id = ri.finding_instance_id
       JOIN findings f ON f.id = fi.finding_id
       WHERE ri.tenant_id=$1 AND fi.target_id=$2
       ORDER BY ri.created_at DESC LIMIT 20`,
      [tenantId, id],
    );
    return { ...result.rows[0], hardware_summary: this.machineHardwareSummary(result.rows[0]), reports: reports.rows, remediations: remediation.rows };
  }

  @Get('one-time-audits')
  async listAudits(@Req() req: Request) {
    const tenantId = this.tenantId(req);
    const result = await this.db.query(
      `SELECT id, display_name AS target, display_name, hostname, ip_address::text AS ip_address,
              status, connection_mode, created_at, updated_at,
              'Promote to Managed Machine' AS promote
       FROM one_time_audits
       WHERE tenant_id = $1
       ORDER BY created_at DESC`,
      [tenantId],
    );
    return result.rows;
  }

  @Get('reports')
  async listReports(@Req() req: Request) {
    const tenantId = this.tenantId(req);
    const result = await this.db.query(
      `SELECT sr.id, sr.id AS report_id, sr.subject_type, sr.status, sr.created_at, sr.completed_at,
              COALESCE(t.hostname, ota.display_name, 'Unknown target') AS title,
              CASE WHEN sr.subject_type = 'managed_target' THEN 'Managed machine' ELSE 'One-time audit' END AS source,
              COALESCE(e.name, 'Unassigned') AS env,
              t.id AS machine_id,
              ota.id AS audit_id,
              COUNT(fi.id)::int AS finding_count,
              COALESCE(MAX(f.severity), 'informational') AS severity,
              COALESCE(json_agg(json_build_object('id', f.id, 'summary', f.title, 'severity', f.severity, 'status', fi.status, 'evidence', fi.evidence_summary) ORDER BY fi.created_at DESC) FILTER (WHERE f.id IS NOT NULL), '[]'::json) AS findings
       FROM scan_runs sr
       LEFT JOIN targets t ON t.id = sr.target_id
       LEFT JOIN environments e ON e.id = t.environment_id
       LEFT JOIN one_time_audits ota ON ota.id = sr.one_time_audit_id
       LEFT JOIN finding_instances fi ON fi.run_id = sr.id
       LEFT JOIN findings f ON f.id = fi.finding_id
       WHERE sr.tenant_id = $1
       GROUP BY sr.id, t.id, t.hostname, ota.id, ota.display_name, e.name
       ORDER BY sr.created_at DESC`,
      [tenantId],
    );
    return result.rows;
  }

  @Get('reports/:id')
  async getReport(@Param('id') id: string, @Req() req: Request) {
    const tenantId = this.tenantId(req);
    const result = await this.db.query(
      `SELECT sr.id, sr.id AS report_id, sr.subject_type, sr.status, sr.created_at, sr.completed_at,
              COALESCE(t.hostname, ota.display_name, 'Unknown target') AS title,
              CASE WHEN sr.subject_type = 'managed_target' THEN 'Managed machine' ELSE 'One-time audit' END AS source,
              COALESCE(e.name, 'Unassigned') AS env,
              t.id AS machine_id,
              ota.id AS audit_id,
              COUNT(fi.id)::int AS finding_count,
              COALESCE(MAX(f.severity), 'informational') AS severity,
              COALESCE(json_agg(json_build_object('id', f.id, 'summary', f.title, 'severity', f.severity, 'status', fi.status, 'evidence', fi.evidence_summary) ORDER BY fi.created_at DESC) FILTER (WHERE f.id IS NOT NULL), '[]'::json) AS findings
       FROM scan_runs sr
       LEFT JOIN targets t ON t.id = sr.target_id
       LEFT JOIN environments e ON e.id = t.environment_id
       LEFT JOIN one_time_audits ota ON ota.id = sr.one_time_audit_id
       LEFT JOIN finding_instances fi ON fi.run_id = sr.id
       LEFT JOIN findings f ON f.id = fi.finding_id
       WHERE sr.tenant_id = $1 AND sr.id = $2
       GROUP BY sr.id, t.id, t.hostname, ota.id, ota.display_name, e.name`,
      [tenantId, id],
    );
    if (!result.rows[0]) throw new BadRequestException('report not found');
    const artifacts = await this.db.query(
      `SELECT id, artifact_type, storage_uri, mime_type, size_bytes, parse_status, created_at,
              CASE WHEN storage_uri LIKE 's3://%' THEN '/artifacts/' || id || '/download' ELSE NULL END AS download_path
       FROM artifacts
       WHERE tenant_id = $1 AND run_id = $2 AND parse_status IN ('uploaded','ready')
       ORDER BY CASE artifact_type
         WHEN 'pdf' THEN 1
         WHEN 'markdown' THEN 2
         WHEN 'sarif' THEN 3
         WHEN 'scanner.normalized_findings' THEN 4
         WHEN 'scanner.enrichment_summary' THEN 5
         WHEN 'scanner.raw_output' THEN 6
         ELSE 7
       END, created_at DESC`,
      [tenantId, id],
    );
    return { ...result.rows[0], artifacts: artifacts.rows.map((artifact) => this.publicArtifact(artifact)) };
  }

  @Get('remediation')
  async listRemediation(@Req() req: Request) {
    const tenantId = this.tenantId(req);
    const result = await this.db.query(
      `SELECT ri.id, ri.title, ri.action, ri.instructions AS guidance, ri.status, ri.priority, ri.category,
              f.severity, f.title AS finding_title, f.description,
              fi.evidence_summary,
              COALESCE(t.hostname, ota.display_name, 'Unassigned machine') AS asset,
              COALESCE(e.name, 'Unassigned') AS env,
              COALESCE(t.owner_team, 'Unassigned owner') AS owner,
              t.id AS machine_id,
              fi.run_id,
              ri.created_at, ri.updated_at
       FROM remediation_items ri
       JOIN finding_instances fi ON fi.id = ri.finding_instance_id
       JOIN findings f ON f.id = fi.finding_id
       LEFT JOIN targets t ON t.id = fi.target_id
       LEFT JOIN environments e ON e.id = t.environment_id
       LEFT JOIN one_time_audits ota ON ota.id = fi.one_time_audit_id
       WHERE ri.tenant_id = $1
       ORDER BY COALESCE(t.hostname, ota.display_name, 'Unassigned machine'),
                CASE f.severity WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 WHEN 'low' THEN 4 ELSE 5 END,
                ri.created_at DESC`,
      [tenantId],
    );
    return result.rows;
  }

  @Get('remediation/:id')
  async getRemediation(@Param('id') id: string, @Req() req: Request) {
    const tenantId = this.tenantId(req);
    const result = await this.db.query(
      `SELECT ri.id, ri.title, ri.action, ri.instructions AS guidance, ri.status, ri.priority, ri.category,
              f.severity, f.title AS finding_title, f.description,
              fi.evidence_summary,
              COALESCE(t.hostname, ota.display_name, 'Unassigned machine') AS asset,
              COALESCE(e.name, 'Unassigned') AS env,
              COALESCE(t.owner_team, 'Unassigned owner') AS owner,
              t.id AS machine_id,
              fi.run_id,
              ri.created_at, ri.updated_at
       FROM remediation_items ri
       JOIN finding_instances fi ON fi.id = ri.finding_instance_id
       JOIN findings f ON f.id = fi.finding_id
       LEFT JOIN targets t ON t.id = fi.target_id
       LEFT JOIN environments e ON e.id = t.environment_id
       LEFT JOIN one_time_audits ota ON ota.id = fi.one_time_audit_id
       WHERE ri.tenant_id = $1 AND ri.id = $2`,
      [tenantId, id],
    );
    if (!result.rows[0]) throw new BadRequestException('remediation item not found');
    return result.rows[0];
  }

  @Post('targets')
  async createTarget(@Body() body: Record<string, unknown>, @Req() req: Request) {
    const actor = await this.requirePermission(req, 'inventory_managed_machines', 'add');
    const tenantId = this.tenantId(req);
    const hostname = requireString(body, 'hostname');
    const connectionMode = trimText(body.connection_mode) || 'ssh_push';

    let sshAuthMethod: string | null = null;
    let sshPort: number | null = null;
    let sshUsername: string | null = null;
    let sshCredentialId: string | null = null;

    if (connectionMode === 'ssh_push') {
      sshAuthMethod = trimText(body.ssh_auth_method) === 'ssh_key' ? 'ssh_key' : 'password';
      sshPort = parseSshPort(body);
      sshUsername = requireString(body, 'ssh_username');
      const rawSecret = sshAuthMethod === 'ssh_key' ? requireString(body, 'ssh_private_key') : requireString(body, 'ssh_password');
      const enrollment = assertSshEnrollment(body);
      const credentialType = sshAuthMethod === 'ssh_key' ? 'ssh_key' : 'ssh_password';
      const sealedSecret = sshSeal(JSON.stringify({
        auth_method: sshAuthMethod,
        hostname,
        port: sshPort,
        username: sshUsername,
        secret: rawSecret,
      }));
      const fingerprint = sshFingerprint(rawSecret);
      const env = await this.db.query<{ id: string }>('SELECT id FROM environments WHERE tenant_id=$1 ORDER BY created_at LIMIT 1', [tenantId]);
      const result = await this.db.query(
        `WITH credential AS (
          INSERT INTO credentials (tenant_id, label, credential_type, sealed_secret, fingerprint)
          VALUES ($1,$2,$3,$4,$5) RETURNING id
        ), target AS (
          INSERT INTO targets (tenant_id,hostname,fqdn,ip_address,environment_id,owner_team,platform,connection_mode,ssh_auth_method,ssh_port,ssh_username,ssh_credential_id)
          SELECT $1,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,credential.id FROM credential RETURNING *
        ), host_key_pin AS (
          INSERT INTO ssh_host_key_pins (tenant_id,target_id,ssh_port,algorithm,fingerprint,verified_by)
          SELECT $1, target.id, $14, $16, $17, $18 FROM target
        ), egress_policy AS (
          INSERT INTO target_egress_policies (tenant_id,target_id,cidr,ssh_port)
          SELECT $1, target.id, $19::cidr, $14 FROM target
        ), root_policy AS (
          INSERT INTO target_root_policies (tenant_id,target_id,root_path)
          SELECT $1, target.id, $20 FROM target
        )
        SELECT * FROM target`,
        [tenantId, `${hostname} SSH ${sshAuthMethod === 'ssh_key' ? 'key' : 'password'}`, credentialType, sealedSecret, fingerprint, hostname, body.fqdn ?? null, body.ip_address ?? null, env.rows[0]?.id ?? null, body.owner_team ?? null, body.platform ?? null, connectionMode, sshAuthMethod, sshPort, sshUsername, enrollment.hostKeyAlgorithm, enrollment.hostKeyFingerprint, actor.id, enrollment.allowedCidr, enrollment.rootPath],
      );
      return result.rows[0];
    }

    const env = await this.db.query<{ id: string }>('SELECT id FROM environments WHERE tenant_id=$1 ORDER BY created_at LIMIT 1', [tenantId]);
    const result = await this.db.query(
      'INSERT INTO targets (tenant_id,hostname,fqdn,ip_address,environment_id,owner_team,platform,connection_mode,ssh_auth_method,ssh_port,ssh_username,ssh_credential_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *',
      [
        tenantId,
        hostname,
        body.fqdn ?? null,
        body.ip_address ?? null,
        env.rows[0]?.id ?? null,
        body.owner_team ?? null,
        body.platform ?? null,
        connectionMode,
        sshAuthMethod,
        sshPort,
        sshUsername,
        sshCredentialId,
      ],
    );
    return result.rows[0];
  }
  @Get('remediations/:id/activity')
  async remediationActivity(@Param('id') id: string, @Req() req: Request) {
    const tenantId = this.tenantId(req);
    const result = await this.db.query(
      `SELECT h.id, h.event_type, h.payload, h.created_at, h.actor_user_id, COALESCE(u.display_name, 'System') AS actor_name
       FROM remediation_item_activity h
       LEFT JOIN users u ON u.id = h.actor_user_id
       WHERE h.tenant_id = $1 AND h.remediation_item_id = $2
       ORDER BY h.created_at ASC`,
      [tenantId, id],
    );
    return { activity: result.rows };
  }

  @Patch('remediations/:id/status')
  @Patch('remediation/:id/status')
  async updateRemediationStatus(@Param('id') id: string, @Body() body: Record<string, unknown>, @Req() req: Request) {
    const actor = await this.requirePermission(req, 'remediation_workflows', 'edit');
    const tenantId = this.tenantId(req);
    const newStatus = typeof body.status === 'string' ? body.status.toLowerCase() : '';
    const allowedStatuses = ['open', 'accepted', 'ignored', 'resolved'];
    if (!newStatus || !allowedStatuses.includes(newStatus)) {
      throw new BadRequestException(`invalid status: ${newStatus}. allowed: ${allowedStatuses.join(', ')}`);
    }
    const current = await this.db.query('SELECT id, status, title FROM remediation_items WHERE tenant_id=$1 AND id=$2', [tenantId, id]);
    if (!current.rows[0]) throw new NotFoundException('remediation item not found');
    const updated = await this.db.query('UPDATE remediation_items SET status=$1, updated_at=now() WHERE tenant_id=$2 AND id=$3 RETURNING *', [newStatus, tenantId, id]);
    await this.db.query('INSERT INTO audit_log (tenant_id, actor_user_id, action, resource_type, resource_id, payload) VALUES ($1,$2,$3,$4,$5,$6)', [tenantId, actor.id, 'remediation.status_changed', 'remediation_item', id, { from: current.rows[0].status, to: newStatus, title: current.rows[0].title }]);
    await this.db.query('INSERT INTO remediation_item_activity (tenant_id, remediation_item_id, actor_user_id, event_type, payload) VALUES ($1,$2,$3,$4,$5)', [tenantId, id, actor.id, 'remediation.status_changed', { from: current.rows[0].status, to: newStatus, title: current.rows[0].title }]);
    return updated.rows[0];
  }

  @Get('targets/:id/scan-runs')
  async targetScanRuns(@Param('id') id: string, @Req() req: Request) {
    const tenantId = this.tenantId(req);
    const result = await this.db.query(`SELECT r.id, r.job_id, r.subject_type, r.target_id, r.one_time_audit_id, r.status, r.exit_code, r.started_at, r.completed_at, r.duration_seconds, r.created_at, r.updated_at, r.runtime_context, latest.event_type AS latest_event_type, latest.message AS latest_event_message, latest.progress_percent AS latest_progress_percent, latest.created_at AS latest_event_at, COALESCE(json_agg(jsonb_build_object('id', a.id, 'artifact_type', a.artifact_type, 'content_type', CASE a.artifact_type WHEN 'pdf' THEN 'application/pdf' WHEN 'markdown' THEN 'text/markdown; charset=utf-8' WHEN 'sarif' THEN 'application/sarif+json' ELSE 'application/json' END, 'size_bytes', a.size_bytes, 'parse_status', a.parse_status, 'created_at', a.created_at, 'download_path', CASE WHEN a.storage_uri LIKE 's3://%' THEN '/artifacts/' || a.id || '/download' ELSE NULL END) ORDER BY a.created_at DESC) FILTER (WHERE a.id IS NOT NULL), '[]'::json) AS artifacts FROM scan_runs r LEFT JOIN LATERAL (SELECT event_type, message, progress_percent, created_at FROM job_events e WHERE e.tenant_id=$1 AND e.run_id=r.id ORDER BY created_at DESC LIMIT 1) latest ON TRUE LEFT JOIN artifacts a ON a.tenant_id=$1 AND a.run_id=r.id WHERE r.tenant_id=$1 AND r.target_id=$2 GROUP BY r.id, r.runtime_context, latest.event_type, latest.message, latest.progress_percent, latest.created_at ORDER BY r.created_at DESC`, [tenantId, id]);
    return {
      runs: result.rows.map((run) => ({
        ...this.publicRun(run),
        latest_event_type: run.latest_event_type,
        latest_event_message: run.latest_event_message,
        latest_progress_percent: run.latest_progress_percent,
        latest_event_at: run.latest_event_at,
        artifacts: run.artifacts,
      })),
    };
  }
  @Get('scan-runs/:id/artifacts') async runArtifacts(@Param('id') id: string, @Req() req: Request) { const tenantId = this.tenantId(req); const result = await this.db.query("SELECT id, artifact_type, storage_uri, size_bytes, parse_status, created_at FROM artifacts WHERE tenant_id=$1 AND run_id=$2 AND parse_status IN ('uploaded','ready') ORDER BY created_at DESC", [tenantId, id]); return { artifacts: result.rows.map((artifact) => this.publicArtifact(artifact)) }; }
  @Patch('targets/:id') async updateTarget(@Param('id') id: string, @Body() body: Record<string, unknown>, @Req() req: Request) { await this.requirePermission(req, 'inventory_managed_machines', 'edit'); const tenantId = this.tenantId(req); const current = await this.db.query('SELECT * FROM targets WHERE tenant_id=$1 AND id=$2', [tenantId, id]); if (!current.rows[0]) throw new BadRequestException('target not found'); const fields = ['hostname', 'fqdn', 'ip_address', 'owner_team', 'platform', 'connection_mode', 'monitoring_enabled'] as const; const updates: string[] = []; const params: unknown[] = [tenantId, id]; for (const field of fields) { if (Object.prototype.hasOwnProperty.call(body, field)) { updates.push(`${field}=$${params.length + 1}`); params.push(body[field]); } } if (!updates.length) return current.rows[0]; const result = await this.db.query(`UPDATE targets SET ${updates.join(', ')}, updated_at=now() WHERE tenant_id=$1 AND id=$2 RETURNING *`, params); return result.rows[0]; }
  @Delete('targets/:id') async deleteTarget(@Param('id') id: string, @Req() req: Request) {
    const actor = await this.requireAdmin(req);
    const tenantId = this.tenantId(req);
    const target = await this.db.query<{ id: string; hostname: string }>('SELECT id, hostname FROM targets WHERE tenant_id = $1 AND id = $2', [tenantId, id]);
    if (!target.rows[0]) throw new BadRequestException('target not found');
    const runs = await this.db.query<{ id: string }>('SELECT id FROM scan_runs WHERE tenant_id = $1 AND target_id = $2', [tenantId, id]);
    const jobResult = await this.db.query<{ id: string }>('SELECT id FROM scan_jobs WHERE tenant_id = $1 AND target_id = $2', [tenantId, id]);
    const runIds = runs.rows.map((row) => row.id);
    const jobIds = jobResult.rows.map((row) => row.id);
    const affected = { runs: runIds.length, jobs: jobIds.length, scheduled_target: target.rows[0].hostname };
    if (runIds.length) {
      await this.db.query('DELETE FROM job_events WHERE tenant_id=$1 AND run_id = ANY($2::uuid[])', [tenantId, runIds]);
      await this.db.query('DELETE FROM artifacts WHERE tenant_id=$1 AND run_id = ANY($2::uuid[])', [tenantId, runIds]);
      await this.db.query('DELETE FROM remediation_items WHERE tenant_id=$1 AND finding_instance_id IN (SELECT id FROM finding_instances WHERE tenant_id=$1 AND target_id=$2)', [tenantId, id]);
      await this.db.query('DELETE FROM finding_instances WHERE tenant_id=$1 AND run_id = ANY($2::uuid[])', [tenantId, runIds]);
      await this.db.query('DELETE FROM notification_events WHERE tenant_id=$1 AND run_id = ANY($2::uuid[])', [tenantId, runIds]);
    }
    await this.db.query('DELETE FROM job_events WHERE tenant_id=$1 AND job_id = ANY($2::uuid[])', [tenantId, jobIds]);
    await this.db.query('DELETE FROM scan_runs WHERE tenant_id=$1 AND id = ANY($2::uuid[])', [tenantId, runIds]);
    await this.db.query('DELETE FROM scan_jobs WHERE tenant_id=$1 AND id = ANY($2::uuid[])', [tenantId, jobIds]);
    await this.db.query('DELETE FROM notification_events WHERE tenant_id=$1 AND target_id=$2', [tenantId, id]);
    await this.db.query('DELETE FROM target_status_checks WHERE tenant_id=$1 AND target_id=$2', [tenantId, id]);
    await this.db.query('DELETE FROM schedules WHERE tenant_id=$1 AND target_id=$2', [tenantId, id]);
    await this.db.query('DELETE FROM target_identities WHERE tenant_id=$1 AND target_id=$2', [tenantId, id]);
    await this.db.query('DELETE FROM target_group_members tgm USING target_groups tg WHERE tgm.target_group_id=tg.id AND tg.tenant_id=$1 AND tgm.target_id=$2', [tenantId, id]);
    await this.db.query('DELETE FROM targets WHERE tenant_id=$1 AND id=$2', [tenantId, id]);
    await this.db.query('INSERT INTO audit_log (tenant_id, actor_user_id, action, resource_type, resource_id, payload) VALUES ($1,$2,$3,$4,$5,$6)', [tenantId, actor.id, 'target.deleted', 'target', id, affected]);
    return { deleted: true, id, affected };
  }
  @Get('one-time-audits/:id') async oneTimeAudit(@Param('id') id: string, @Req() req: Request) { const tenantId = this.tenantId(req); const result = await this.db.query('SELECT * FROM one_time_audits WHERE tenant_id=$1 AND id=$2', [tenantId, id]); if (!result.rows[0]) throw new BadRequestException('one-time audit not found'); return result.rows[0]; }
  @Get('engagements')
  async listEngagements(@Req() req: Request) {
    const tenantId = this.tenantId(req);
    const result = await this.db.query('SELECT id, name, owner_team, scope, budget, expires_at, revoked_at, owner_authorized, created_by, created_at FROM engagements WHERE tenant_id=$1 ORDER BY created_at DESC', [tenantId]);
    return result.rows;
  }
  @Get('identity/groups')
  async listIdentityGroups(@Req() req: Request) { const actor = await this.requireAdmin(req); return (this.accessGovernance ?? new AccessGovernanceService(this.db)).listGroups(actor.tenant_id); }
  @Post('identity/groups')
  async createIdentityGroup(@Body() body: Record<string, unknown>, @Req() req: Request) { const actor = await this.requireAdmin(req); return (this.accessGovernance ?? new AccessGovernanceService(this.db)).createGroup(actor.tenant_id, requireString(body, 'name'), actor.id); }
  @Post('identity/groups/:id/members')
  async addIdentityGroupMember(@Param('id') id: string, @Body() body: Record<string, unknown>, @Req() req: Request) { const actor = await this.requireAdmin(req); return (this.accessGovernance ?? new AccessGovernanceService(this.db)).addMember(actor.tenant_id, id, requireString(body, 'user_id'), actor.id); }
  @Get('identity/devices')
  async listIdentityDevices(@Req() req: Request) { const actor = this.principal(req); return (this.accessGovernance ?? new AccessGovernanceService(this.db)).listDevices(actor.tenantId, actor.userId); }
  @Post('identity/devices/:id/revoke')
  async revokeIdentityDevice(@Param('id') id: string, @Req() req: Request) { const actor = this.principal(req); return (this.accessGovernance ?? new AccessGovernanceService(this.db)).revokeDevice(actor.tenantId, id, actor.userId); }
  @Post('identity/break-glass')
  async beginIdentityBreakGlass(@Body() body: Record<string, unknown>, @Req() req: Request) { const actor = await this.requireAdmin(req); return (this.accessGovernance ?? new AccessGovernanceService(this.db)).beginBreakGlass({ tenantId: actor.tenant_id, actorId: actor.id, reason: requireString(body, 'reason'), ticketReference: requireString(body, 'ticket_reference'), expiresAt: new Date(requireString(body, 'expires_at')) }); }
  @Post('engagements')
  async createEngagement(@Body() body: Record<string, unknown>, @Req() req: Request) {
    const actor = await this.requireAdmin(req);
    const service = this.authorization ?? new AuthorizationService(this.db);
    return service.createEngagement({ tenantId: actor.tenant_id, name: requireString(body, 'name'), ownerTeam: requireString(body, 'owner_team'), scope: (body.scope && typeof body.scope === 'object' && !Array.isArray(body.scope) ? body.scope : {}) as Record<string, unknown>, budget: (body.budget && typeof body.budget === 'object' && !Array.isArray(body.budget) ? body.budget : {}) as Record<string, unknown>, expiresAt: new Date(requireString(body, 'expires_at')), createdBy: actor.id });
  }
  @Post('engagements/:id/approvals')
  async approveEngagement(@Param('id') id: string, @Body() body: Record<string, unknown>, @Req() req: Request) {
    const actor = await this.requireAdmin(req);
    const role = body.role === 'owner' || body.role === 'reviewer' || body.role === 'security' ? body.role : null;
    if (!role) throw new BadRequestException('approval role is required');
    const service = this.authorization ?? new AuthorizationService(this.db);
    return service.approveEngagement({ tenantId: actor.tenant_id, engagementId: id, approverId: actor.id, role });
  }
  @Post('engagements/:id/revoke')
  async revokeEngagement(@Param('id') id: string, @Body() body: Record<string, unknown>, @Req() req: Request) {
    const actor = await this.requireAdmin(req);
    return (this.authorization ?? new AuthorizationService(this.db)).revokeEngagement(actor.tenant_id, id, actor.id, requireString(body, 'reason'));
  }
  @Post('policies/simulate')
  async simulatePolicy(@Body() body: Record<string, unknown>, @Req() req: Request) {
    const principal = this.principal(req);
    const engagementId = requireUuid(body, 'engagement_id');
    const policyBundleId = requireUuid(body, 'policy_bundle_id');
    const requestedScope = (body.scope && typeof body.scope === 'object' && !Array.isArray(body.scope) ? body.scope : {}) as Record<string, unknown>;
    const [engagement, policy] = await Promise.all([
      this.db.query<{ id: string }>('SELECT id FROM engagements WHERE tenant_id=$1 AND id=$2', [principal.tenantId, engagementId]),
      this.db.query<{ id: string }>('SELECT id FROM policy_bundles WHERE tenant_id=$1 AND id=$2', [principal.tenantId, policyBundleId]),
    ]);
    const decision = await (this.authorization ?? new AuthorizationService(this.db)).simulate({ tenantId: principal.tenantId, engagementId, policyBundleId, requestedScope });
    await this.db.query('INSERT INTO policy_simulations (tenant_id,policy_bundle_id,engagement_id,requested_scope,allowed,reason,simulated_by) VALUES ($1,$2,$3,$4,$5,$6,$7)', [principal.tenantId, policy.rows[0]?.id ?? null, engagement.rows[0]?.id ?? null, requestedScope, decision.allowed, decision.reason ?? null, principal.userId]);
    return decision;
  }
  @Post('targets/:id/scan-jobs') async runTarget(@Param('id') id: string, @Body() body: Record<string, unknown>, @Req() req: Request) { await this.requirePermission(req, 'scan_jobs_live_progress', 'add'); await this.requireExecutionAuthorization(req, body); return this.createJob('managed_target', id, null, body, req); }
  @Get('scan-jobs/:id') async job(@Param('id') id: string, @Req() req: Request) { const tenantId = this.tenantId(req); const result = await this.db.query('SELECT * FROM scan_jobs WHERE tenant_id=$1 AND id=$2', [tenantId, id]); if (!result.rows[0]) throw new BadRequestException('scan job not found'); return result.rows[0]; }
  @Get('scan-runs/:id') async run(@Param('id') id: string, @Req() req: Request) { const tenantId = this.tenantId(req); const result = await this.db.query('SELECT id, job_id, subject_type, target_id, one_time_audit_id, status, exit_code, started_at, completed_at, duration_seconds, created_at, updated_at, runtime_context FROM scan_runs WHERE tenant_id=$1 AND id=$2', [tenantId, id]); if (!result.rows[0]) throw new BadRequestException('scan run not found'); return this.publicRun(result.rows[0]); }
  @Post('scan-runs/:id/cancel')
  async cancelRun(@Param('id') id: string, @Body() body: Record<string, unknown>, @Req() req: Request) {
    const actor = await this.requirePermission(req, 'scan_jobs_live_progress', 'edit');
    const tenantId = this.tenantId(req);
    const reason = typeof body.reason === 'string' && body.reason.trim() ? body.reason.trim().slice(0, 512) : 'operator request';
    const cancellation = await this.db.query<{ status: string }>(`WITH locked_run AS (
      SELECT id, job_id, status FROM scan_runs WHERE tenant_id=$1 AND id=$2 FOR UPDATE
    ), newly_cancelled AS (
      UPDATE scan_runs sr SET status='cancelled', cancellation_requested_at=now(), cancellation_requested_by=$3,
        cancellation_reason=$4, completed_at=now(), updated_at=now()
      FROM locked_run lr
      WHERE sr.id=lr.id AND sr.status <> 'cancelled' AND sr.status NOT IN ('completed','failed')
      RETURNING sr.id, sr.job_id
    ), cancelled_run AS (
      SELECT id, job_id FROM newly_cancelled
      UNION ALL
      SELECT lr.id, lr.job_id FROM locked_run lr WHERE lr.status='cancelled'
    ), cancelled_job AS (
      UPDATE scan_jobs sj SET status='cancelled', completed_at=now(), updated_at=now()
      FROM cancelled_run cr
      WHERE sj.tenant_id=$1 AND sj.id=cr.job_id AND sj.status NOT IN ('completed','failed','cancelled')
    ), revoked_grants AS (
      UPDATE worker_execution_grants g SET revoked_at=now()
      FROM cancelled_run cr
      WHERE g.tenant_id=$1 AND g.run_id=cr.id AND g.revoked_at IS NULL
    ), revoked_pending_dispatches AS (
      DELETE FROM scan_dispatch_outbox o USING cancelled_run cr
      WHERE o.tenant_id=$1 AND o.run_id=cr.id AND o.published_at IS NULL
    ), removed_artifact_events AS (
      DELETE FROM job_events e USING cancelled_run cr
      WHERE e.tenant_id=$1 AND e.run_id=cr.id AND e.event_type='artifact.uploaded'
    ), quarantined_artifacts AS (
      UPDATE artifacts a SET parse_status='quarantined'
      FROM cancelled_run cr
      WHERE a.tenant_id=$1 AND a.run_id=cr.id AND a.parse_status <> 'quarantined'
      RETURNING a.id, a.storage_uri
    ), cleanup_candidates AS (
      SELECT id, storage_uri FROM quarantined_artifacts
      UNION
      SELECT a.id, a.storage_uri FROM artifacts a JOIN cancelled_run cr ON cr.id=a.run_id
      WHERE a.tenant_id=$1 AND a.parse_status='quarantined'
    ), cleanup_work AS (
      INSERT INTO artifact_cleanup_work (tenant_id,run_id,artifact_id,storage_uri,reason,status)
      SELECT $1,$2,id,storage_uri,'run_cancelled','pending' FROM cleanup_candidates
      ON CONFLICT (tenant_id,artifact_id) DO UPDATE SET storage_uri=EXCLUDED.storage_uri, updated_at=now()
    ), cancellation_event AS (
      INSERT INTO job_events (tenant_id,run_id,event_type,message,payload)
      SELECT $1,id,'scan.cancelled','Scan cancelled',$5 FROM newly_cancelled
    ), cancellation_audit AS (
      INSERT INTO audit_log (tenant_id,actor_user_id,action,resource_type,resource_id,payload)
      SELECT $1,$3,'scan.cancelled','scan_run',id,$6 FROM newly_cancelled
    ), final_state AS (
      SELECT 'cancelled'::text AS status FROM cancelled_run
    )
    SELECT fs.status FROM final_state fs`, [tenantId, id, actor.id, reason, { reason, actor_id: actor.id }, { reason }]);
    if (!cancellation.rows[0]) throw new ConflictException('scan run cannot be cancelled');
    // Cleanup work is durable at this point; Redis dispatch is only an accelerator.
    await this.enqueueArtifactCleanup(tenantId, id).catch(() => undefined);
    return { id, status: 'cancelled' };
  }

  @Post('runs/:id/events')
  async workerEvent(@Param('id') id: string, @Body() body: Record<string, unknown>, @Req() req: Request) {
    this.requireInternalWorker(req);
    const eventType = requireString(body, 'type');
    const attempt = requireWorkerAttempt(body.attempt);
    const capability = await this.requireWorkerCapability(req, id, attempt, eventType);
    const transition = this.workerEventTransition(eventType);
    const tenantId = capability.tenantId;
    const message = typeof body.message === 'string' ? body.message : eventType;
    const replay = await this.db.query(`SELECT 1 FROM job_events
      WHERE tenant_id=$1 AND run_id=$2 AND event_type=$3 AND payload->>'attempt'=$4::text LIMIT 1`, [tenantId, id, eventType, attempt]);
    if (replay.rows[0]) return { accepted: true, run_id: id, event_type: eventType };
    const result = await this.db.query(`WITH authorized AS (
      SELECT sr.id AS run_id, sr.job_id, sj.retry_count, sj.retry_max_attempts FROM scan_runs sr
      JOIN scan_jobs sj ON sj.id=sr.job_id AND sj.tenant_id=sr.tenant_id
      JOIN worker_execution_grants g ON g.tenant_id=sr.tenant_id AND g.run_id=sr.id
      WHERE sr.tenant_id=$1 AND sr.id=$2 AND g.id=$3 AND g.attempt=$4
        AND g.worker_id='worker-node' AND g.action='ssh_execute' AND g.consumed_at IS NOT NULL
        AND g.revoked_at IS NULL AND g.expires_at > now() AND sr.cancellation_requested_at IS NULL
        AND $4 <= sj.retry_max_attempts
        AND ($5 <> 'job.retry_scheduled' OR (sj.retry_count=$4-1 AND $4 < sj.retry_max_attempts))
    ), transitioned_run AS (
      UPDATE scan_runs sr SET status=$6, lease_owner=CASE WHEN $5='job.claimed' THEN 'worker-node' ELSE sr.lease_owner END,
        lease_expires_at=CASE WHEN $5='job.claimed' THEN now()+interval '15 minutes' ELSE sr.lease_expires_at END,
        started_at=CASE WHEN $6='running' THEN COALESCE(sr.started_at, now()) ELSE sr.started_at END,
        completed_at=CASE WHEN $6 IN ('completed','failed') THEN now() ELSE sr.completed_at END,
        heartbeat_at=now(), updated_at=now()
      FROM authorized a
      WHERE sr.id=a.run_id AND (
        ($5='job.claimed' AND sr.status='pending')
        OR ($5 IN ('job.running','parse.started','parse.succeeded','artifact.upload_requested','artifact.upload_succeeded') AND sr.status IN ('leased','running'))
        OR ($5 IN ('job.succeeded','job.failed') AND sr.status IN ('leased','running'))
        OR ($5='job.retry_scheduled' AND sr.status IN ('pending','leased','running'))
      ) RETURNING sr.id, sr.job_id
    ), transitioned_job AS (
      UPDATE scan_jobs sj SET status=$7, started_at=CASE WHEN $7 IN ('leased','running') THEN COALESCE(sj.started_at, now()) ELSE sj.started_at END,
        completed_at=CASE WHEN $7 IN ('completed','failed') THEN now() ELSE sj.completed_at END,
        retry_count=CASE WHEN $5='job.retry_scheduled' THEN sj.retry_count+1 ELSE sj.retry_count END,
        next_retry_at=CASE WHEN $5='job.retry_scheduled' THEN now() ELSE sj.next_retry_at END, updated_at=now()
      FROM transitioned_run tr WHERE sj.id=tr.job_id AND sj.tenant_id=$1 RETURNING sj.id
    ), revoked_attempt AS (
      UPDATE worker_execution_grants g SET revoked_at=now() FROM transitioned_run tr
      WHERE $5='job.retry_scheduled' AND g.tenant_id=$1 AND g.run_id=tr.id AND g.id=$3 AND g.revoked_at IS NULL
    ), next_attempt AS (
      INSERT INTO worker_execution_grants (tenant_id,run_id,worker_id,action,attempt,expires_at)
      SELECT $1,tr.id,'worker-node','ssh_execute',$4+1,NULL FROM transitioned_run tr WHERE $5='job.retry_scheduled'
      ON CONFLICT (tenant_id,run_id,action,attempt) DO NOTHING
    ), persisted_event AS (
      INSERT INTO job_events (tenant_id,job_id,run_id,event_type,message,payload)
      SELECT $1,tr.job_id,tr.id,$5,$8,$9 FROM transitioned_run tr JOIN transitioned_job tj ON tj.id=tr.job_id
      RETURNING run_id
    ) SELECT * FROM persisted_event`, [tenantId, id, capability.grantId, attempt, eventType, transition.runStatus, transition.jobStatus, message, body]);
    if (!result.rows[0]) throw new ForbiddenException('Worker event unavailable');
    return { accepted: true, run_id: id, event_type: eventType };
  }

  @Post('internal/worker/runs/:id/ssh-grant')
  async workerSshGrant(@Param('id') id: string, @Body() body: Record<string, unknown>, @Req() req: Request) {
    this.requireInternalWorker(req);
    const attempt = requireWorkerAttempt(body.attempt);
    const { grantLifetimeMs } = workerExecutionTimeBudget();
    const result = await this.db.query(`WITH locked_run AS (
      SELECT sr.id, sr.tenant_id, sr.job_id, sj.retry_count, sj.retry_max_attempts FROM scan_runs sr
      JOIN scan_jobs sj ON sj.id=sr.job_id AND sj.tenant_id=sr.tenant_id
      WHERE sr.id=$1 AND sr.cancellation_requested_at IS NULL
        AND sj.status IN ('queued','leased','running')
      FOR UPDATE
    ), recovered_run AS (
      -- Recovery is API-owned: an internal request cannot skip attempts or revive
      -- a live lease. A replacement exists only for the exact next BullMQ attempt
      -- after the consumed predecessor has expired.
      UPDATE scan_runs sr SET status='pending', lease_owner=NULL, lease_expires_at=NULL, heartbeat_at=now(), updated_at=now()
      FROM locked_run lr
      WHERE sr.id=lr.id AND sr.status IN ('leased','running') AND $3 > 1 AND $3 <= lr.retry_max_attempts
        AND lr.retry_count=$3-2
        AND NOT EXISTS (SELECT 1 FROM worker_execution_grants current WHERE current.tenant_id=lr.tenant_id AND current.run_id=sr.id AND current.action='ssh_execute' AND current.attempt=$3)
        AND EXISTS (SELECT 1 FROM worker_execution_grants previous WHERE previous.tenant_id=lr.tenant_id AND previous.run_id=sr.id AND previous.action='ssh_execute' AND previous.attempt=$3-1 AND previous.consumed_at IS NOT NULL AND previous.revoked_at IS NULL AND previous.expires_at <= now())
      RETURNING sr.id, sr.tenant_id, sr.job_id
    ), revoked_recovered_attempt AS (
      UPDATE worker_execution_grants previous SET revoked_at=now()
      FROM recovered_run rr
      WHERE previous.tenant_id=rr.tenant_id AND previous.run_id=rr.id AND previous.action='ssh_execute' AND previous.attempt=$3-1 AND previous.revoked_at IS NULL AND previous.expires_at <= now()
    ), recovered_job AS (
      UPDATE scan_jobs sj SET status='queued', retry_count=sj.retry_count+1, next_retry_at=now(), updated_at=now()
      FROM recovered_run rr WHERE sj.tenant_id=rr.tenant_id AND sj.id=rr.job_id AND sj.status IN ('leased','running')
      RETURNING sj.id
    ), recovered_event AS (
      INSERT INTO job_events (tenant_id,job_id,run_id,event_type,message,payload)
      SELECT rr.tenant_id,rr.job_id,rr.id,'job.retry_scheduled','Expired worker lease recovered for BullMQ retry',jsonb_build_object('attempt',$3-1,'recovered',true)
      FROM recovered_run rr JOIN recovered_job rj ON rj.id=rr.job_id
      ON CONFLICT DO NOTHING
    ), recovered_consumed_grant AS (
      -- Insert the recovered grant already consumed: data-modifying CTEs share a
      -- snapshot, so a newly inserted grant must not depend on a later UPDATE to
      -- become usable in this same fail-closed recovery transition.
      INSERT INTO worker_execution_grants (tenant_id,run_id,worker_id,action,attempt,expires_at,consumed_at)
      SELECT rr.tenant_id,rr.id,'worker-node','ssh_execute',$3,now()+($2 * interval '1 millisecond'),now() FROM recovered_run rr
      ON CONFLICT (tenant_id,run_id,action,attempt) DO NOTHING
      RETURNING id,tenant_id,run_id,attempt,expires_at,revoked_at
    ), consumed_grant AS (
      UPDATE worker_execution_grants g SET consumed_at=now(), expires_at=now()+($2 * interval '1 millisecond')
      FROM locked_run lr
      JOIN scan_runs sr ON sr.id=lr.id AND sr.tenant_id=lr.tenant_id
      JOIN scan_jobs sj ON sj.id=sr.job_id AND sj.tenant_id=sr.tenant_id
      JOIN targets t ON t.id=sr.target_id AND t.tenant_id=sr.tenant_id
      JOIN credentials c ON c.id=t.ssh_credential_id AND c.tenant_id=t.tenant_id AND c.disabled_at IS NULL
      JOIN ssh_host_key_pins p ON p.target_id=t.id AND p.tenant_id=t.tenant_id AND p.ssh_port=t.ssh_port AND p.revoked_at IS NULL
      JOIN target_egress_policies e ON e.target_id=t.id AND e.tenant_id=t.tenant_id AND e.ssh_port=t.ssh_port AND e.enabled=true
      JOIN target_root_policies rp ON rp.target_id=t.id AND rp.tenant_id=t.tenant_id AND rp.enabled=true
      WHERE g.tenant_id=lr.tenant_id AND g.run_id=lr.id AND g.attempt=$3 AND $3 <= sj.retry_max_attempts AND g.worker_id='worker-node' AND g.action='ssh_execute'
        AND g.consumed_at IS NULL AND g.revoked_at IS NULL AND g.expires_at IS NULL
        AND sr.id=g.run_id AND sr.tenant_id=g.tenant_id AND sr.subject_type='managed_target'
        AND sr.status='pending' AND sr.cancellation_requested_at IS NULL AND sj.status='queued'
      RETURNING g.id AS grant_id, g.run_id, g.attempt AS grant_attempt, g.expires_at AS grant_expires_at, g.revoked_at AS grant_revoked_at,
        sj.retry_max_attempts,
        sr.runtime_context, sr.status AS run_status, sr.cancellation_requested_at,
        t.hostname, t.ssh_port, t.ssh_username, t.ssh_auth_method, t.ssh_credential_id,
        c.sealed_secret, c.disabled_at AS credential_disabled_at,
        p.algorithm, p.fingerprint, p.revoked_at AS host_key_revoked_at,
        e.cidr::text AS cidr, e.ssh_port AS policy_port, e.enabled AS policy_enabled,
        rp.root_path, rp.enabled AS root_enabled
    ), active_consumed_grant AS (
      -- A response may be lost after the API has consumed the grant. Replaying
      -- the exact active attempt returns its same capability without another
      -- state transition; all cancellation, terminal, expiry, and revocation
      -- controls are checked again before any credential is released.
      SELECT g.id AS grant_id, g.run_id, g.attempt AS grant_attempt, g.expires_at AS grant_expires_at, g.revoked_at AS grant_revoked_at,
        sj.retry_max_attempts,
        sr.runtime_context, sr.status AS run_status, sr.cancellation_requested_at,
        t.hostname, t.ssh_port, t.ssh_username, t.ssh_auth_method, t.ssh_credential_id,
        c.sealed_secret, c.disabled_at AS credential_disabled_at,
        p.algorithm, p.fingerprint, p.revoked_at AS host_key_revoked_at,
        e.cidr::text AS cidr, e.ssh_port AS policy_port, e.enabled AS policy_enabled,
        rp.root_path, rp.enabled AS root_enabled
      FROM worker_execution_grants g
      JOIN locked_run lr ON lr.id=g.run_id AND lr.tenant_id=g.tenant_id
      JOIN scan_runs sr ON sr.id=g.run_id AND sr.tenant_id=g.tenant_id
      JOIN scan_jobs sj ON sj.id=sr.job_id AND sj.tenant_id=sr.tenant_id
      JOIN targets t ON t.id=sr.target_id AND t.tenant_id=sr.tenant_id
      JOIN credentials c ON c.id=t.ssh_credential_id AND c.tenant_id=t.tenant_id AND c.disabled_at IS NULL
      JOIN ssh_host_key_pins p ON p.target_id=t.id AND p.tenant_id=t.tenant_id AND p.ssh_port=t.ssh_port AND p.revoked_at IS NULL
      JOIN target_egress_policies e ON e.target_id=t.id AND e.tenant_id=t.tenant_id AND e.ssh_port=t.ssh_port AND e.enabled=true
      JOIN target_root_policies rp ON rp.target_id=t.id AND rp.tenant_id=t.tenant_id AND rp.enabled=true
      WHERE g.tenant_id=lr.tenant_id AND g.run_id=lr.id AND g.attempt=$3 AND $3 <= sj.retry_max_attempts
        AND g.worker_id='worker-node' AND g.action='ssh_execute' AND g.consumed_at IS NOT NULL
        AND g.expires_at > now() AND g.revoked_at IS NULL
        AND sr.subject_type='managed_target' AND sr.status='pending' AND sr.cancellation_requested_at IS NULL AND sj.status='queued'
    ), recovered_context AS (
      SELECT rc.id AS grant_id, rc.run_id, rc.attempt AS grant_attempt, rc.expires_at AS grant_expires_at, rc.revoked_at AS grant_revoked_at,
        sj.retry_max_attempts,
        sr.runtime_context, sr.status AS run_status, sr.cancellation_requested_at,
        t.hostname, t.ssh_port, t.ssh_username, t.ssh_auth_method, t.ssh_credential_id,
        c.sealed_secret, c.disabled_at AS credential_disabled_at,
        p.algorithm, p.fingerprint, p.revoked_at AS host_key_revoked_at,
        e.cidr::text AS cidr, e.ssh_port AS policy_port, e.enabled AS policy_enabled,
        rp.root_path, rp.enabled AS root_enabled
      FROM recovered_consumed_grant rc
      JOIN scan_runs sr ON sr.id=rc.run_id AND sr.tenant_id=rc.tenant_id AND sr.cancellation_requested_at IS NULL
      JOIN scan_jobs sj ON sj.id=sr.job_id AND sj.tenant_id=sr.tenant_id AND sj.status='queued' AND rc.attempt <= sj.retry_max_attempts
      JOIN targets t ON t.id=sr.target_id AND t.tenant_id=sr.tenant_id
      JOIN credentials c ON c.id=t.ssh_credential_id AND c.tenant_id=t.tenant_id AND c.disabled_at IS NULL
      JOIN ssh_host_key_pins p ON p.target_id=t.id AND p.tenant_id=t.tenant_id AND p.ssh_port=t.ssh_port AND p.revoked_at IS NULL
      JOIN target_egress_policies e ON e.target_id=t.id AND e.tenant_id=t.tenant_id AND e.ssh_port=t.ssh_port AND e.enabled=true
      JOIN target_root_policies rp ON rp.target_id=t.id AND rp.tenant_id=t.tenant_id AND rp.enabled=true
    ) SELECT * FROM consumed_grant UNION ALL SELECT * FROM active_consumed_grant UNION ALL SELECT * FROM recovered_context`, [id, grantLifetimeMs, attempt]);
    const row = result.rows[0] as Record<string, unknown> | undefined;
    assertSshGrantControls(row);
    const context = row.runtime_context && typeof row.runtime_context === 'object' ? row.runtime_context as Record<string, unknown> : {};
    const scanTarget = validateScanTarget(context.scan_target);
    const security = assertSshLaunchRequirements({
      target: row,
      hostKeyPin: { algorithm: row.algorithm, fingerprint: row.fingerprint, revoked_at: row.host_key_revoked_at },
      egressPolicy: { cidr: row.cidr, ssh_port: row.policy_port, enabled: row.policy_enabled },
      rootPolicy: { root_path: row.root_path, enabled: row.root_enabled },
      workerGrant: { id: row.grant_id, expires_at: row.grant_expires_at, consumed_at: null },
    });
    const decrypted = sshUnseal(row.sealed_secret);
    if (decrypted.auth_method !== row.ssh_auth_method || decrypted.hostname !== security.host || Number(decrypted.port) !== security.port || decrypted.username !== row.ssh_username || typeof decrypted.secret !== 'string' || !decrypted.secret) {
      throw new ForbiddenException('SSH execution grant unavailable');
    }
    const credential = row.ssh_auth_method === 'ssh_key'
      ? { username: String(row.ssh_username), privateKey: decrypted.secret }
      : { username: String(row.ssh_username), password: decrypted.secret };
    return { runId: id, grantId: row.grant_id, attempt, maxAttempts: Number(row.retry_max_attempts), workerCapability: this.workerCapability(id, String(row.grant_id)), host: security.host, port: security.port, hostKeyPin: security.hostKeyPin, permittedCidrs: security.permittedCidrs, enrolledRoot: security.enrolledRoot, scanTarget, credential };
  }

  @Post('internal/worker/artifact-cleanup/reconcile')
  async reconcileArtifactCleanup(@Body() body: Record<string, unknown>, @Req() req: Request) {
    this.requireInternalWorker(req);
    const summary = await this.artifacts.reconcileCleanup(requireString(body, 'runId'));
    return { accepted: true, ...summary };
  }

  @Get('internal/worker/runs/:id/control')
  async workerRunControl(@Param('id') id: string, @Req() req: Request) {
    this.requireInternalWorker(req);
    const result = await this.db.query('SELECT status, cancellation_requested_at FROM scan_runs WHERE id=$1', [id]);
    const row = result.rows[0] as Record<string, unknown> | undefined;
    if (!row) throw new ForbiddenException('Worker run control unavailable');
    return { runId: id, cancelled: row.status === 'cancelled' || Boolean(row.cancellation_requested_at) };
  }

  @Get('scan-runs/:id/events')
  async events(@Param('id') id: string, @Req() req: Request) {
    await this.requirePermission(req, 'scan_jobs_live_progress', 'read');
    const tenantId = this.tenantId(req);
    const result = await this.db.query(
      `SELECT e.event_type, e.progress_percent, e.created_at
       FROM job_events e
       WHERE e.tenant_id=$1 AND e.run_id=$2 AND e.event_type = ANY($3::text[])
       ORDER BY e.created_at ASC`,
      [tenantId, id, Object.keys(PUBLIC_SCAN_RUN_EVENT)],
    );
    const events = result.rows.flatMap((event) => {
      const safeEvent = this.publicRunEvent(event);
      return safeEvent ? [safeEvent] : [];
    });
    return { events };
  }

  @Get('artifacts/:id/download')
  async downloadArtifact(@Param('id') id: string, @Req() req: Request, @Res() res: Response) {
    const tenantId = this.tenantId(req);
    const result = await this.db.query("SELECT id, artifact_type, storage_uri, mime_type, size_bytes FROM artifacts WHERE tenant_id=$1 AND id=$2 AND parse_status IN ('uploaded','ready')", [tenantId, id]);
    const artifact = result.rows[0];
    if (!artifact) throw new NotFoundException('artifact not found');
    if (!String(artifact.storage_uri).startsWith('s3://')) throw new BadRequestException('artifact body is not downloadable');
    const object = await this.artifacts.download(artifact.storage_uri);
    const extension = artifact.artifact_type === 'markdown' ? 'md' : artifact.artifact_type === 'scanner.normalized_findings' || artifact.artifact_type === 'scanner.enrichment_summary' || artifact.artifact_type === 'scanner.raw_output' ? 'json' : artifact.artifact_type;
    res.setHeader('Content-Type', ARTIFACT_CONTENT_TYPES[artifact.artifact_type] ?? 'application/octet-stream');
    res.setHeader('Content-Length', String(artifact.size_bytes || object.ContentLength || ''));
    res.setHeader('Content-Disposition', `attachment; filename="shore-sentinel-${artifact.artifact_type}.${extension}"`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', 'sandbox');
    const body = object.Body;
    if (!body) throw new NotFoundException('artifact object body not found');
    if (body instanceof Readable) return body.pipe(res);
    return Readable.fromWeb(body as never).pipe(res);
  }

  @Post('artifacts')
  async workerArtifact(@Body() body: Record<string, unknown>, @Req() req: Request) {
    this.requireInternalWorker(req);
    const runId = requireString(body, 'runId');
    const attempt = requireWorkerAttempt(body.attempt ?? 1);
    const capability = await this.requireWorkerCapability(req, runId, attempt);
    const artifactType = validateArtifactType(requireString(body, 'kind'));
    const bodyBase64 = body.bodyBase64;
    const decodedByteLength = validateCanonicalWorkerArtifactBase64(bodyBase64);
    const buffer = Buffer.from(bodyBase64 as string, 'base64');
    if (buffer.length !== decodedByteLength) throw new BadRequestException('bodyBase64 must be canonical base64');
    const sha256 = createHash('sha256').update(buffer).digest('hex');
    const contentType = typeof body.contentType === 'string' ? body.contentType : undefined;
    const storage = this.artifacts.prepare(runId, artifactType);
    const tenantId = capability.tenantId;
    const reservation = await this.db.query(`WITH locked_run AS (
      SELECT id FROM scan_runs WHERE tenant_id=$1 AND id=$2 FOR UPDATE
    )
    INSERT INTO artifacts (tenant_id,run_id,artifact_type,storage_uri,sha256,mime_type,size_bytes,parse_status,retention_expires_at)
    SELECT $1,$2,$3,$4,$5,$6,$7,'processing',now()+interval '90 days'
    FROM locked_run lr
    JOIN scan_runs sr ON sr.id=lr.id AND sr.tenant_id=$1
    JOIN worker_execution_grants g ON g.tenant_id=sr.tenant_id AND g.run_id=sr.id
    WHERE sr.status IN ('pending','leased','running') AND sr.cancellation_requested_at IS NULL
      AND g.worker_id='worker-node' AND g.action='ssh_execute'
      AND g.attempt=$8 AND g.consumed_at IS NOT NULL AND g.revoked_at IS NULL AND g.expires_at > now()
    ON CONFLICT(run_id,artifact_type,sha256) DO UPDATE SET parse_status=artifacts.parse_status
    RETURNING *`, [tenantId, runId, artifactType, storage.storage_uri, sha256, contentType ?? null, buffer.length, attempt]);
    const artifact = reservation.rows[0];
    if (!artifact) throw new ForbiddenException('Worker capability unavailable');
    if (artifact.storage_uri !== storage.storage_uri) return artifact;

    try {
      await this.artifacts.store(storage.storage_uri, buffer, contentType);
    } catch {
      await this.discardReservedArtifact(tenantId, runId, artifact.id, storage.storage_uri);
      throw new Error('artifact storage failed');
    }

    const finalization = await this.db.query(`WITH locked_run AS (
      SELECT id FROM scan_runs WHERE tenant_id=$1 AND id=$2 FOR UPDATE
    ), finalized_artifact AS (
      UPDATE artifacts a SET parse_status='uploaded'
      FROM locked_run lr
      JOIN scan_runs sr ON sr.id=lr.id AND sr.tenant_id=$1
      JOIN worker_execution_grants g ON g.tenant_id=sr.tenant_id AND g.run_id=sr.id
      WHERE a.tenant_id=$1 AND a.id=$3 AND a.storage_uri=$4 AND a.parse_status='processing'
        AND sr.status IN ('pending','leased','running') AND sr.cancellation_requested_at IS NULL
        AND g.worker_id='worker-node' AND g.action='ssh_execute'
        AND g.attempt=$7 AND g.consumed_at IS NOT NULL AND g.revoked_at IS NULL AND g.expires_at > now()
      RETURNING a.*
    ), uploaded_event AS (
      INSERT INTO job_events (tenant_id,run_id,event_type,message,payload)
      SELECT $1,run_id,'artifact.uploaded',$5,$6 FROM finalized_artifact
    )
    SELECT * FROM finalized_artifact`, [tenantId, runId, artifact.id, storage.storage_uri, `${artifactType} artifact stored`, { artifact_id: artifact.id, metadata: body.metadata ?? {} }, attempt]);
    if (!finalization.rows[0]) {
      await this.discardReservedArtifact(tenantId, runId, artifact.id, storage.storage_uri);
      throw new ForbiddenException('Worker capability unavailable');
    }
    return finalization.rows[0];
  }

  private async enqueueArtifactCleanup(tenantId: string, runId: string) {
    await this.queue.enqueue('artifact_processing', { type: 'artifact.cleanup', tenantId, runId });
  }

  private async discardReservedArtifact(tenantId: string, runId: string, artifactId: string, storageUri: string) {
    await this.db.query(`WITH quarantined_artifact AS (
      UPDATE artifacts SET parse_status='quarantined'
      WHERE tenant_id=$1 AND id=$2 AND storage_uri=$3
      RETURNING id, run_id, storage_uri
    )
    INSERT INTO artifact_cleanup_work (tenant_id,run_id,artifact_id,storage_uri,reason,status)
    SELECT $1,run_id,id,storage_uri,'artifact_finalization_compensation','pending' FROM quarantined_artifact
    ON CONFLICT (tenant_id,artifact_id) DO UPDATE SET storage_uri=EXCLUDED.storage_uri, updated_at=now()`, [tenantId, artifactId, storageUri]);
    await this.enqueueArtifactCleanup(tenantId, runId);
  }


  @Get('events/stream') @Header('Content-Type', 'text/event-stream') async stream(@Res() res: Response) { res.write(`event: ready\ndata: ${JSON.stringify({ ok: true, at: new Date().toISOString() })}\n\n`); const timer = setInterval(() => res.write(`event: heartbeat\ndata: ${JSON.stringify({ at: new Date().toISOString() })}\n\n`), 15000); res.on('close', () => clearInterval(timer)); }

  private rememberMe(body: Record<string, unknown>) {
    const value = body.remember_me ?? body.rememberMe;
    return value === true || value === 1 || value === '1' || value === 'true' || value === 'on';
  }

  private async createJob(subjectType: 'managed_target', targetId: string, oneTimeAuditId: null, body: Record<string, unknown>, req: Request) {
    assertExactlyOneSubject(subjectType, targetId, oneTimeAuditId);
    const principal = this.principal(req);
    const tenantId = principal.tenantId;
    const requesterId = principal.userId;
    const retryPolicy = workerRetryPolicyFromEnv();
    const mode = body.mode ?? 'ssh_push';
    const runtimeContext = { scan_target: validateScanTarget(body.scan_target) };
    if (mode !== 'ssh_push') throw new BadRequestException('managed-machine v1.1 accepts SSH push scans only');
    const enrollment = await this.db.query(`SELECT t.hostname, t.ssh_port, t.ssh_credential_id, c.disabled_at AS credential_disabled_at,
      p.algorithm, p.fingerprint, p.revoked_at, e.cidr::text AS cidr, e.ssh_port AS policy_port, e.enabled AS policy_enabled,
      r.root_path, r.enabled AS root_enabled
      FROM targets t
      LEFT JOIN credentials c ON c.id=t.ssh_credential_id AND c.tenant_id=t.tenant_id
      LEFT JOIN ssh_host_key_pins p ON p.target_id=t.id AND p.tenant_id=t.tenant_id AND p.ssh_port=t.ssh_port AND p.revoked_at IS NULL
      LEFT JOIN target_egress_policies e ON e.target_id=t.id AND e.tenant_id=t.tenant_id AND e.ssh_port=t.ssh_port AND e.enabled=true
      LEFT JOIN target_root_policies r ON r.target_id=t.id AND r.tenant_id=t.tenant_id AND r.enabled=true
      WHERE t.tenant_id=$1 AND t.id=$2`, [tenantId, targetId]);
    const security = enrollment.rows[0];
    assertSshLaunchRequirements({
      target: security,
      hostKeyPin: security ? { algorithm: security.algorithm, fingerprint: security.fingerprint, revoked_at: security.revoked_at } : null,
      egressPolicy: security ? { cidr: security.cidr, ssh_port: security.policy_port, enabled: security.policy_enabled } : null,
      rootPolicy: security ? { root_path: security.root_path, enabled: security.root_enabled } : null,
      workerGrant: { id: 'pending', expires_at: new Date(Date.now() + 60_000).toISOString(), consumed_at: null },
    });
    const created = await this.db.query<{ job: Record<string, unknown>; run: Record<string, unknown>; dispatch_id: string }>(`WITH job AS (
      INSERT INTO scan_jobs (tenant_id,subject_type,target_id,one_time_audit_id,requested_by,mode,priority,scanner_version,status,retry_max_attempts,retry_backoff_ms)
      VALUES ($1,$2,$3,$4,$14,$5,$6,$7,'queued',$12,$13) RETURNING *
    ), run AS (
      INSERT INTO scan_runs (tenant_id,job_id,subject_type,target_id,one_time_audit_id,status,runtime_context,app_version,scanner_bundle_version,scanner_script_sha256)
      SELECT $1,job.id,$2,$3,$4,'pending',$8,$9,$10,$11 FROM job RETURNING *
    ), grant AS (
      INSERT INTO worker_execution_grants (tenant_id,run_id,worker_id,action,attempt,expires_at)
      SELECT $1,run.id,'worker-node','ssh_execute',1,NULL FROM run
    ), queued_event AS (
      INSERT INTO job_events (tenant_id,job_id,run_id,event_type,message,progress_percent)
      SELECT $1,job.id,run.id,'job.queued','Scan job queued',0 FROM job CROSS JOIN run
    ), dispatch AS (
      INSERT INTO scan_dispatch_outbox (tenant_id,job_id,run_id,queue_type,payload)
      SELECT $1,job.id,run.id,'scan_jobs',jsonb_build_object(
        'id',job.id,'jobId',job.id,'runId',run.id,'run_id',run.id,
        'subjectType',run.subject_type,'subject_type',run.subject_type,
        'targetId',run.target_id,'target_id',run.target_id,
        'oneTimeAuditId',run.one_time_audit_id,'one_time_audit_id',run.one_time_audit_id
      ) FROM job CROSS JOIN run
      ON CONFLICT (tenant_id,run_id,queue_type) DO NOTHING
      RETURNING id
    )
    SELECT row_to_json(job) AS job, row_to_json(run) AS run, dispatch.id AS dispatch_id
    FROM job CROSS JOIN run CROSS JOIN dispatch`, [tenantId, subjectType, targetId, oneTimeAuditId, mode, body.priority ?? 50, body.scanner_version ?? null, runtimeContext, '1.1.0', body.scanner_bundle_version ?? null, body.scanner_script_sha256 ?? null, retryPolicy.attempts, retryPolicy.backoff.delay, requesterId]);
    const creation = created.rows[0];
    if (!creation) throw new Error('scan dispatch creation failed');
    let queue: Record<string, unknown> = { queued: false, reason: 'dispatch pending' };
    try { queue = await this.queue.deliverScanDispatch(creation.dispatch_id); } catch { /* durable outbox retry retains the pending dispatch */ }
    return { job: creation.job, run: this.publicRun(creation.run), queue };
  }

  private scannerOutput(subjectType: 'managed_target', targetId: string, oneTimeAuditId: null, body: Record<string, unknown>) {
    if (body.scannerOutput && typeof body.scannerOutput === 'object') return body.scannerOutput;
    const subjectId = targetId ?? oneTimeAuditId ?? 'unknown-subject';
    return {
      contractVersion: scannerBundleContractVersion(),
      scanner: { name: 'shore-sentinel-api-placeholder', version: body.scanner_version ?? '0.1.0' },
      target: { assetId: subjectId, subjectType },
      findings: [],
      collectedAt: new Date().toISOString(),
    };
  }

  private workerEventTransition(eventType: string) {
    if (eventType === RUN_EVENT_TYPE.jobClaimed) return { runStatus: 'leased', jobStatus: 'leased' };
    if (new Set<string>([RUN_EVENT_TYPE.jobRunning, RUN_EVENT_TYPE.parseStarted, RUN_EVENT_TYPE.parseSucceeded, RUN_EVENT_TYPE.artifactUploadRequested, RUN_EVENT_TYPE.artifactUploadSucceeded]).has(eventType)) return { runStatus: 'running', jobStatus: 'running' };
    if (eventType === RUN_EVENT_TYPE.jobSucceeded) return { runStatus: 'completed', jobStatus: 'completed' };
    if (eventType === RUN_EVENT_TYPE.jobFailed) return { runStatus: 'failed', jobStatus: 'failed' };
    if (eventType === RUN_EVENT_TYPE.jobRetryScheduled) return { runStatus: 'pending', jobStatus: 'queued' };
    throw new BadRequestException(`Unsupported worker event type: ${eventType}`);
  }

  private setSessionCookie(res: Response, token: string, rememberMe = false) {
    res.cookie('shore_session', token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: rememberMe ? THIRTY_DAYS_SECONDS * 1000 : undefined,
    });
  }

  private requireInternalWorker(req: Request) {
    const expected = process.env.INTERNAL_WORKER_TOKEN;
    const supplied = req.header('authorization')?.replace(/^Bearer\s+/i, '');
    if (!expected || !supplied || expected.length !== supplied.length || !timingSafeEqual(Buffer.from(expected), Buffer.from(supplied))) {
      throw new ForbiddenException('Internal worker authentication failed');
    }
  }

  private workerCapability(runId: string, grantId: string) {
    const secret = process.env.SHORE_SENTINEL_SECRET_KEY;
    if (!secret || secret.length < 32) throw new ForbiddenException('Worker capability unavailable');
    return createHmac('sha256', secret).update(`${runId}:${grantId}`).digest('base64url');
  }

  private async requireWorkerCapability(req: Request, runId: string, attempt: number, replayEventType?: string) {
    const supplied = req.header('x-worker-capability');
    if (!supplied) throw new ForbiddenException('Worker capability unavailable');
    // Do not touch event history on ordinary rejected writes. The retry replay path
    // is the sole exception because its previous transition may have committed
    // while the worker lost the response and the consumed grant was revoked.
    const retryReplay = replayEventType === RUN_EVENT_TYPE.jobRetryScheduled;
    const result = retryReplay
      ? await this.db.query(`SELECT g.id AS grant_id, sr.tenant_id FROM worker_execution_grants g
          JOIN scan_runs sr ON sr.id=g.run_id AND sr.tenant_id=g.tenant_id
          JOIN scan_jobs sj ON sj.id=sr.job_id AND sj.tenant_id=sr.tenant_id
          WHERE g.run_id=$1 AND g.attempt=$2 AND g.worker_id='worker-node' AND g.action='ssh_execute'
            AND g.consumed_at IS NOT NULL AND sr.status='pending' AND sr.cancellation_requested_at IS NULL
            AND sj.status='queued' AND EXISTS (
              SELECT 1 FROM job_events e WHERE e.tenant_id=sr.tenant_id AND e.run_id=$1
                AND e.event_type='job.retry_scheduled' AND e.payload->>'attempt'=$2::text
            )`, [runId, attempt])
      : await this.db.query(`SELECT g.id AS grant_id, sr.tenant_id FROM worker_execution_grants g
          JOIN scan_runs sr ON sr.id=g.run_id AND sr.tenant_id=g.tenant_id
          JOIN scan_jobs sj ON sj.id=sr.job_id AND sj.tenant_id=sr.tenant_id
          WHERE g.run_id=$1 AND g.attempt=$2 AND g.worker_id='worker-node' AND g.action='ssh_execute'
            AND g.consumed_at IS NOT NULL AND g.revoked_at IS NULL AND g.expires_at > now()
            AND sr.status IN ('pending','leased','running') AND sr.cancellation_requested_at IS NULL
            AND sj.status IN ('queued','leased','running')`, [runId, attempt]);
    const grantId = result.rows[0]?.grant_id;
    const tenantId = result.rows[0]?.tenant_id;
    if (typeof grantId !== 'string' || typeof tenantId !== 'string') throw new ForbiddenException('Worker capability unavailable');
    const expected = this.workerCapability(runId, grantId);
    if (expected.length !== supplied.length || !timingSafeEqual(Buffer.from(expected), Buffer.from(supplied))) {
      throw new ForbiddenException('Worker capability unavailable');
    }
    return { grantId, tenantId };
  }

  private principal(req: Request): RequestPrincipal {
    const principal = (req as Request & { principal?: RequestPrincipal }).principal;
    if (!principal || !principal.userId || !principal.tenantId || !Array.isArray(principal.roles)) {
      throw new ForbiddenException('Authenticated request principal required');
    }
    return principal;
  }

  private async requireExecutionAuthorization(req: Request, body: Record<string, unknown>) {
    if ((this.db as DatabaseService & { enforceEnterpriseAuthorization?: boolean }).enforceEnterpriseAuthorization !== true) return;
    const principal = this.principal(req);
    const engagementId = requireString(body, 'engagement_id');
    const policyBundleId = requireString(body, 'policy_bundle_id');
    const expectedPolicyHash = requireString(body, 'policy_hash');
    const scope = (body.scope && typeof body.scope === 'object' && !Array.isArray(body.scope) ? body.scope : {}) as Record<string, unknown>;
    const decision = await (this.authorization ?? new AuthorizationService(this.db)).authorize({ tenantId: principal.tenantId, engagementId, policyBundleId, expectedPolicyHash, requestedScope: scope });
    if (!decision.allowed) throw new ForbiddenException(`Execution authorization denied: ${decision.reason ?? 'policy decision unavailable'}`);
    return decision;
  }

  private tenantId(req: Request) {
    return this.principal(req).tenantId;
  }

  private async requireTenantUser(tenantId: string, userId: string) {
    const target = await this.db.query<{ id: string }>('SELECT id FROM users WHERE tenant_id=$1 AND id=$2', [tenantId, userId]);
    if (!target.rows[0]) throw new BadRequestException('user not found');
  }

  private async requireAdmin(req: Request) {
    const principal = this.principal(req);
    if (!principal.roles.includes('admin')) throw new ForbiddenException('Admin role required');
    return { id: principal.userId, tenant_id: principal.tenantId, roles: principal.roles };
  }

  private async requirePermission(req: Request, feature: string, action: string) {
    const principal = this.principal(req);
    const roles = principal.roles.map((role) => role.toLowerCase());
    const permitted = roles.some((role) => ROLE_MATRIX[role]?.[feature]?.includes(action));
    if (!permitted) throw new ForbiddenException('Insufficient permissions');
    return { id: principal.userId, tenant_id: principal.tenantId, roles: principal.roles };
  }

  private machineHardwareSummary(machine: Record<string, unknown>) {
    const text = (value: unknown) => typeof value === 'string' && value.trim() ? value.trim().slice(0, 128) : null;
    const timestamp = (value: unknown) => {
      if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString();
      if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) return null;
      return value;
    };
    const sshPort = Number(machine.ssh_port);
    const sshAuthMethod = machine.ssh_auth_method === 'password' || machine.ssh_auth_method === 'ssh_key'
      ? machine.ssh_auth_method
      : null;
    return {
      status: text(machine.status),
      platform: text(machine.platform),
      agent_version: text(machine.agent_version),
      scanner_bundle_version: text(machine.scanner_bundle_version),
      last_seen_at: timestamp(machine.last_seen_at),
      heartbeat_at: timestamp(machine.latest_heartbeat_at),
      ssh_port: Number.isInteger(sshPort) && sshPort >= 1 && sshPort <= 65535 ? sshPort : null,
      ssh_auth_method: sshAuthMethod,
    };
  }

  private publicRunEvent(event: Record<string, unknown>) {
    const eventType = typeof event.event_type === 'string' ? event.event_type : '';
    const definition = PUBLIC_SCAN_RUN_EVENT[eventType];
    if (!definition) return null;
    const progress = Number(event.progress_percent);
    const createdAt = event.created_at instanceof Date
      ? event.created_at.toISOString()
      : typeof event.created_at === 'string' && !Number.isNaN(Date.parse(event.created_at))
        ? event.created_at
        : null;
    return {
      event_type: eventType,
      status: definition.status,
      progress_percent: Number.isInteger(progress) && progress >= 0 && progress <= 100 ? progress : null,
      created_at: createdAt,
      message: definition.message,
    };
  }

  private publicRun(run: Record<string, unknown>) {
    const context = run.runtime_context;
    const rawScanTarget = context && typeof context === 'object' && !Array.isArray(context) ? (context as Record<string, unknown>).scan_target : undefined;
    let scanTarget: string | undefined;
    try { scanTarget = validateScanTarget(rawScanTarget); } catch { scanTarget = undefined; }
    return {
      id: run.id,
      job_id: run.job_id,
      subject_type: run.subject_type,
      target_id: run.target_id,
      one_time_audit_id: run.one_time_audit_id,
      status: run.status,
      exit_code: run.exit_code,
      started_at: run.started_at,
      completed_at: run.completed_at,
      duration_seconds: run.duration_seconds,
      created_at: run.created_at,
      updated_at: run.updated_at,
      scan_target: scanTarget,
    };
  }

  private publicArtifact(artifact: Record<string, unknown>) {
    const artifactType = String(artifact.artifact_type);
    return {
      id: artifact.id,
      artifact_type: artifactType,
      content_type: ARTIFACT_CONTENT_TYPES[artifactType] ?? 'application/octet-stream',
      size_bytes: artifact.size_bytes,
      parse_status: artifact.parse_status,
      created_at: artifact.created_at,
      download_path: String(artifact.storage_uri ?? '').startsWith('s3://') ? `/artifacts/${artifact.id}/download` : null,
    };
  }

  private token(req: Request) { const cookieToken = (req as Request & { cookies?: Record<string, string> }).cookies?.shore_session; const auth = req.header('authorization'); return cookieToken ?? (auth?.startsWith('Bearer ') ? auth.slice(7) : undefined); }

  // ── User management ──────────────────────────────────────────────

  @Get('users')
  async listUsers(@Req() req: Request) {
    await this.requireAdmin(req);
    const tenantId = this.tenantId(req);
    const result = await this.db.query(
      `SELECT u.id, u.email, u.display_name, u.disabled_at, u.created_at, u.updated_at,
              json_agg(r.name ORDER BY r.name) AS roles
       FROM users u
       LEFT JOIN user_roles ur ON ur.user_id = u.id
       LEFT JOIN roles r ON r.id = ur.role_id
       WHERE u.tenant_id = $1
       GROUP BY u.id
       ORDER BY u.created_at DESC`,
      [tenantId],
    );
    return result.rows;
  }

  @Get('users/roles')
  async listRoles(@Req() req: Request) {
    await this.requireAdmin(req);
    const result = await this.db.query('SELECT name, description FROM roles ORDER BY name');
    return result.rows;
  }

  @Post('users')
  async createUser(@Body() body: Record<string, unknown>, @Req() req: Request) {
    const actor = await this.requireAdmin(req);
    const tenantId = this.tenantId(req);
    const email = requireString(body, 'email');
    const displayName = requireString(body, 'display_name');
    const password = requireString(body, 'password');
    const roles = Array.isArray(body.roles) ? body.roles as string[] : ['operator'];

    const existing = await this.db.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows[0]) throw new ConflictException('Email already exists');

    const passwordHash = await bcrypt.hash(password, 12);
    const created = await this.db.query<{ id: string }>(
      'INSERT INTO users (tenant_id, email, display_name, password_hash) VALUES ($1,$2,$3,$4) RETURNING id',
      [tenantId, email, displayName, passwordHash],
    );
    const userId = created.rows[0].id;

    for (const roleName of roles) {
      await this.db.query(
        'INSERT INTO user_roles (user_id, role_id) SELECT $1, id FROM roles WHERE name = $2 ON CONFLICT DO NOTHING',
        [userId, roleName],
      );
    }

    await this.db.query(
      'INSERT INTO audit_log (tenant_id, actor_user_id, action, resource_type, resource_id, payload) VALUES ($1,$2,$3,$4,$5,$6)',
      [tenantId, actor.id, 'user.created', 'user', userId, { email, displayName, roles }],
    );

    return { id: userId, email, display_name: displayName, roles };
  }

  @Patch('users/:id')
  async updateUser(@Param('id') id: string, @Body() body: Record<string, unknown>, @Req() req: Request) {
    const actor = await this.requireAdmin(req);
    const tenantId = this.tenantId(req);
    await this.requireTenantUser(tenantId, id);
    const fields: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (typeof body.email === 'string') { fields.push(`email = $${idx++}`); values.push(body.email); }
    if (typeof body.display_name === 'string') { fields.push(`display_name = $${idx++}`); values.push(body.display_name); }

    if (fields.length > 0) {
      fields.push(`updated_at = now()`);
      values.push(tenantId, id);
      await this.db.query(`UPDATE users SET ${fields.join(', ')} WHERE tenant_id = $${idx++} AND id = $${idx}`, values);
    }

    if (Array.isArray(body.roles)) {
      await this.db.query('DELETE FROM user_roles WHERE user_id = $1 AND EXISTS (SELECT 1 FROM users WHERE tenant_id=$2 AND id=$1)', [id, tenantId]);
      for (const roleName of body.roles as string[]) {
        await this.db.query(
          'INSERT INTO user_roles (user_id, role_id) SELECT $1, id FROM roles WHERE name = $2 AND EXISTS (SELECT 1 FROM users WHERE tenant_id=$3 AND id=$1) ON CONFLICT DO NOTHING',
          [id, roleName, tenantId],
        );
      }
    }

    await this.db.query(
      'INSERT INTO audit_log (tenant_id, actor_user_id, action, resource_type, resource_id, payload) VALUES ($1,$2,$3,$4,$5,$6)',
      [tenantId, actor.id, 'user.updated', 'user', id, { updated_fields: Object.keys(body) }],
    );

    const result = await this.db.query(
      `SELECT u.id, u.email, u.display_name, u.disabled_at, u.created_at, u.updated_at,
              json_agg(r.name ORDER BY r.name) AS roles
       FROM users u
       LEFT JOIN user_roles ur ON ur.user_id = u.id
       LEFT JOIN roles r ON r.id = ur.role_id
       WHERE u.tenant_id = $1 AND u.id = $2
       GROUP BY u.id`,
      [tenantId, id],
    );
    return result.rows[0];
  }

  @Post('users/:id/reset-password')
  async resetPassword(@Param('id') id: string, @Body() body: Record<string, unknown>, @Req() req: Request) {
    const actor = await this.requireAdmin(req);
    const tenantId = this.tenantId(req);
    await this.requireTenantUser(tenantId, id);
    const password = requireString(body, 'password');
    const passwordHash = await bcrypt.hash(password, 12);
    await this.db.query('UPDATE users SET password_hash = $1, updated_at = now() WHERE tenant_id = $2 AND id = $3', [passwordHash, tenantId, id]);
    await this.db.query(
      'INSERT INTO audit_log (tenant_id, actor_user_id, action, resource_type, resource_id, payload) VALUES ($1,$2,$3,$4,$5,$6)',
      [tenantId, actor.id, 'user.password_reset', 'user', id, {}],
    );
    return { ok: true };
  }

  @Delete('users/:id')
  async deleteUser(@Param('id') id: string, @Req() req: Request) {
    const actor = await this.requireAdmin(req);
    const tenantId = this.tenantId(req);
    await this.requireTenantUser(tenantId, id);
    await this.db.query(
      'INSERT INTO audit_log (tenant_id, actor_user_id, action, resource_type, resource_id, payload) VALUES ($1,$2,$3,$4,$5,$6)',
      [tenantId, actor.id, 'user.deleted', 'user', id, { actor_user_id_detached: true }],
    );
    await this.db.query('UPDATE audit_log SET actor_user_id = NULL WHERE tenant_id=$1 AND actor_user_id = $2', [tenantId, id]);
    await this.db.query('DELETE FROM user_roles WHERE user_id = $1 AND EXISTS (SELECT 1 FROM users WHERE tenant_id=$2 AND id=$1)', [id, tenantId]);
    await this.db.query('DELETE FROM users WHERE tenant_id=$1 AND id=$2', [tenantId, id]);
    return { ok: true };
  }

  @Post('users/:id/disable')
  async disableUser(@Param('id') id: string, @Req() req: Request) {
    const actor = await this.requireAdmin(req);
    const tenantId = this.tenantId(req);
    await this.requireTenantUser(tenantId, id);
    await this.db.query("UPDATE users SET disabled_at = now(), updated_at = now() WHERE tenant_id = $1 AND id = $2", [tenantId, id]);
    await this.db.query(
      'INSERT INTO audit_log (tenant_id, actor_user_id, action, resource_type, resource_id, payload) VALUES ($1,$2,$3,$4,$5,$6)',
      [tenantId, actor.id, 'user.disabled', 'user', id, {}],
    );
    return { ok: true };
  }

  @Post('users/:id/enable')
  async enableUser(@Param('id') id: string, @Req() req: Request) {
    const actor = await this.requireAdmin(req);
    const tenantId = this.tenantId(req);
    await this.requireTenantUser(tenantId, id);
    await this.db.query('UPDATE users SET disabled_at = NULL, updated_at = now() WHERE tenant_id = $1 AND id = $2', [tenantId, id]);
    await this.db.query(
      'INSERT INTO audit_log (tenant_id, actor_user_id, action, resource_type, resource_id, payload) VALUES ($1,$2,$3,$4,$5,$6)',
      [tenantId, actor.id, 'user.enabled', 'user', id, {}],
    );
    return { ok: true };
  }
}
