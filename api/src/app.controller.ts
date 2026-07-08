import { BadRequestException, Body, ConflictException, Controller, Delete, ForbiddenException, Get, Header, NotFoundException, Param, Patch, Post, Req, Res } from '@nestjs/common';
import bcrypt from 'bcryptjs';
import { createCipheriv, createHash, randomBytes } from 'node:crypto';
import { Readable } from 'node:stream';
import type { Request, Response } from 'express';
import { RUN_EVENT_TYPE, scannerBundleContractVersion } from '@shore-sentinel/shared';
import { ArtifactService } from './artifact.service.js';
import { AuthService } from './auth.service.js';
import { DatabaseService } from './database.service.js';
import { QueueService } from './queue.service.js';
import { UpdateService } from './update.service.js';
import { assertExactlyOneSubject, requireString, validateArtifactComplete, validateArtifactType } from './validation.js';

const THIRTY_DAYS_SECONDS = 60 * 60 * 24 * 30;

function sshSeal(plaintext: string) {
  const keySeed = process.env.SHORE_SENTINEL_SECRET_KEY || 'shore-sentinel-dev-secret-key';
  const key = createHash('sha256').update(keySeed).digest();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString('base64url')}:${ciphertext.toString('base64url')}:${tag.toString('base64url')}`;
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

@Controller()
export class AppController {
  constructor(
    private readonly db: DatabaseService,
    private readonly auth: AuthService,
    private readonly queue: QueueService,
    private readonly artifacts: ArtifactService,
    private readonly updates: UpdateService,
  ) {}

  @Get('health') health() { return { ok: true, service: 'shore-sentinel-api' }; }
  @Get('ready') async ready() { await this.db.query('SELECT 1'); return { ok: this.db.isReady(), database: 'ok', redis: await this.queue.health().catch((error) => ({ configured: true, error: error.message })) }; }
  @Post('auth/register') async register(@Body() body: Record<string, unknown>, @Res({ passthrough: true }) res: Response) { const rememberMe = this.rememberMe(body); const result = await this.auth.register(requireString(body, 'name'), requireString(body, 'email'), requireString(body, 'password'), rememberMe); this.setSessionCookie(res, result.token, rememberMe); return { user: result.user }; }
  @Post('auth/login') async login(@Body() body: Record<string, unknown>, @Res({ passthrough: true }) res: Response) { const rememberMe = this.rememberMe(body); const result = await this.auth.login(requireString(body, 'email'), requireString(body, 'password'), rememberMe); this.setSessionCookie(res, result.token, rememberMe); return { user: result.user }; }
  @Post('auth/logout') logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) { this.auth.logout(this.token(req)); res.clearCookie('shore_session'); return { ok: true }; }
  @Get('auth/me') async me(@Req() req: Request) { return this.auth.me(this.token(req)); }
  @Get('settings/current') async settings() { const tenantId = await this.db.tenantId(); const result = await this.db.query('SELECT s.*, t.slug AS tenant_slug FROM settings s JOIN tenants t ON t.id=s.tenant_id WHERE s.tenant_id=$1', [tenantId]); return result.rows[0]; }

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
  async listTargets() {
    const tenantId = await this.db.tenantId();
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
  async getTarget(@Param('id') id: string) {
    const tenantId = await this.db.tenantId();
    const result = await this.db.query(
      `SELECT t.id, t.hostname AS name, t.hostname, t.fqdn, t.ip_address::text AS ip_address,
              COALESCE(e.name, 'Unassigned') AS env,
              COALESCE(t.owner_team, 'Unassigned owner') AS owner,
              COALESCE(t.platform, 'unknown') AS platform,
              COALESCE(t.status, 'unknown') AS status,
              t.connection_mode, t.ssh_auth_method, t.ssh_port, t.ssh_username,
              t.last_seen_at, t.last_successful_scan_at, t.created_at,
              COUNT(DISTINCT fi.id)::int AS finding_count,
              COUNT(DISTINCT ri.id) FILTER (WHERE ri.status IN ('open','accepted'))::int AS remediation_count
       FROM targets t
       LEFT JOIN environments e ON e.id = t.environment_id
       LEFT JOIN scan_runs sr ON sr.target_id = t.id
       LEFT JOIN finding_instances fi ON fi.target_id = t.id
       LEFT JOIN remediation_items ri ON ri.finding_instance_id = fi.id
       WHERE t.tenant_id = $1 AND t.id = $2
       GROUP BY t.id, e.name`,
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
    return { ...result.rows[0], reports: reports.rows, remediations: remediation.rows };
  }

  @Get('one-time-audits')
  async listAudits() {
    const tenantId = await this.db.tenantId();
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
  async listReports() {
    const tenantId = await this.db.tenantId();
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
  async getReport(@Param('id') id: string) {
    const tenantId = await this.db.tenantId();
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
       WHERE tenant_id = $1 AND run_id = $2
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
    return { ...result.rows[0], artifacts: artifacts.rows };
  }

  @Get('remediation')
  async listRemediation() {
    const tenantId = await this.db.tenantId();
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
  async getRemediation(@Param('id') id: string) {
    const tenantId = await this.db.tenantId();
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
  async createTarget(@Body() body: Record<string, unknown>) {
    const tenantId = await this.db.tenantId();
    const hostname = requireString(body, 'hostname');
    const connectionMode = trimText(body.connection_mode) || 'ssh_push';
    const env = await this.db.query<{ id: string }>('SELECT id FROM environments WHERE tenant_id=$1 ORDER BY created_at LIMIT 1', [tenantId]);

    let sshAuthMethod: string | null = null;
    let sshPort: number | null = null;
    let sshUsername: string | null = null;
    let sshCredentialId: string | null = null;

    if (connectionMode === 'ssh_push') {
      sshAuthMethod = trimText(body.ssh_auth_method) === 'ssh_key' ? 'ssh_key' : 'password';
      sshPort = parseSshPort(body);
      sshUsername = requireString(body, 'ssh_username');
      const rawSecret = sshAuthMethod === 'ssh_key' ? requireString(body, 'ssh_private_key') : requireString(body, 'ssh_password');
      const credentialType = sshAuthMethod === 'ssh_key' ? 'ssh_key' : 'ssh_password';
      const sealedSecret = sshSeal(JSON.stringify({
        auth_method: sshAuthMethod,
        hostname,
        port: sshPort,
        username: sshUsername,
        secret: rawSecret,
      }));
      const fingerprint = sshFingerprint(rawSecret);
      const credential = await this.db.query<{ id: string }>(
        'INSERT INTO credentials (tenant_id, label, credential_type, sealed_secret, fingerprint) VALUES ($1,$2,$3,$4,$5) RETURNING id',
        [tenantId, `${hostname} SSH ${sshAuthMethod === 'ssh_key' ? 'key' : 'password'}`, credentialType, sealedSecret, fingerprint],
      );
      sshCredentialId = credential.rows[0].id;
    }

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
  @Post('targets/:id/scan-jobs') async runTarget(@Param('id') id: string, @Body() body: Record<string, unknown>) { return this.createJob('managed_target', id, null, body); }
  @Get('scan-jobs/:id') async job(@Param('id') id: string) { const result = await this.db.query('SELECT * FROM scan_jobs WHERE id=$1', [id]); if (!result.rows[0]) throw new BadRequestException('scan job not found'); return result.rows[0]; }
  @Get('scan-runs/:id') async run(@Param('id') id: string) { const result = await this.db.query('SELECT * FROM scan_runs WHERE id=$1', [id]); if (!result.rows[0]) throw new BadRequestException('scan run not found'); return result.rows[0]; }

  @Post('runs/:id/events')
  async workerEvent(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    const tenantId = await this.db.tenantId();
    const eventType = requireString(body, 'type');
    const message = typeof body.message === 'string' ? body.message : eventType;
    await this.applyWorkerEventState(id, eventType);
    await this.db.query('INSERT INTO job_events (tenant_id,run_id,event_type,message,payload) VALUES ($1,$2,$3,$4,$5)', [tenantId, id, eventType, message, body]);
    return { accepted: true, run_id: id, event_type: eventType };
  }

  @Get('scan-runs/:id/events') async events(@Param('id') id: string) { const result = await this.db.query('SELECT * FROM job_events WHERE run_id=$1 ORDER BY created_at', [id]); return { events: result.rows }; }
  @Post('artifacts/upload-init') async uploadInit(@Body() body: Record<string, unknown>) { return this.artifacts.createUpload(requireString(body, 'run_id'), validateArtifactType(requireString(body, 'artifact_type')), typeof body.mime_type === 'string' ? body.mime_type : undefined); }

  @Get('artifacts/:id/download')
  async downloadArtifact(@Param('id') id: string, @Res() res: Response) {
    const tenantId = await this.db.tenantId();
    const result = await this.db.query('SELECT id, artifact_type, storage_uri, mime_type, size_bytes FROM artifacts WHERE tenant_id=$1 AND id=$2', [tenantId, id]);
    const artifact = result.rows[0];
    if (!artifact) throw new NotFoundException('artifact not found');
    if (!String(artifact.storage_uri).startsWith('s3://')) throw new BadRequestException('artifact body is not downloadable');
    const object = await this.artifacts.download(artifact.storage_uri);
    const extension = artifact.artifact_type === 'markdown' ? 'md' : artifact.artifact_type === 'scanner.normalized_findings' || artifact.artifact_type === 'scanner.enrichment_summary' || artifact.artifact_type === 'scanner.raw_output' ? 'json' : artifact.artifact_type;
    res.setHeader('Content-Type', artifact.mime_type || object.ContentType || 'application/octet-stream');
    res.setHeader('Content-Length', String(artifact.size_bytes || object.ContentLength || ''));
    res.setHeader('Content-Disposition', `inline; filename="shore-sentinel-${artifact.artifact_type}.${extension}"`);
    const body = object.Body;
    if (!body) throw new NotFoundException('artifact object body not found');
    if (body instanceof Readable) return body.pipe(res);
    return Readable.fromWeb(body as never).pipe(res);
  }

  @Post('artifacts')
  async workerArtifact(@Body() body: Record<string, unknown>) {
    const tenantId = await this.db.tenantId();
    const runId = requireString(body, 'runId');
    const artifactType = validateArtifactType(requireString(body, 'kind'));
    const bodyBase64 = requireString(body, 'bodyBase64');
    const buffer = Buffer.from(bodyBase64, 'base64');
    const sha256 = createHash('sha256').update(buffer).digest('hex');
    const storageUri = `api://worker-handoff/${runId}/${artifactType}/${sha256}`;
    const result = await this.db.query("INSERT INTO artifacts (tenant_id,run_id,artifact_type,storage_uri,sha256,mime_type,size_bytes,parse_status,retention_expires_at) VALUES ($1,$2,$3,$4,$5,$6,$7,'uploaded',now()+interval '90 days') ON CONFLICT(run_id,artifact_type,sha256) DO UPDATE SET parse_status='uploaded' RETURNING *", [tenantId, runId, artifactType, storageUri, sha256, body.contentType ?? null, buffer.length]);
    await this.queue.enqueue('artifact_processing', { artifactId: result.rows[0].id, artifact_id: result.rows[0].id, runId, run_id: runId, artifactType, artifact_type: artifactType });
    await this.db.query("INSERT INTO job_events (tenant_id,run_id,event_type,message,payload) VALUES ($1,$2,'artifact.uploaded',$3,$4)", [tenantId, runId, `${artifactType} artifact uploaded through API handoff`, { artifact_id: result.rows[0].id, metadata: body.metadata ?? {} }]);
    return result.rows[0];
  }

  @Post('artifacts/upload-complete') async uploadComplete(@Body() body: Record<string, unknown>) { const tenantId = await this.db.tenantId(); const runId = requireString(body, 'run_id'); const storageUri = requireString(body, 'storage_uri'); const { artifactType, sha256, sizeBytes } = validateArtifactComplete(body); const result = await this.db.query("INSERT INTO artifacts (tenant_id,run_id,artifact_type,storage_uri,sha256,mime_type,size_bytes,parse_status,retention_expires_at) VALUES ($1,$2,$3,$4,$5,$6,$7,'uploaded',now()+interval '90 days') ON CONFLICT(run_id,artifact_type,sha256) DO UPDATE SET parse_status='uploaded' RETURNING *", [tenantId, runId, artifactType, storageUri, sha256, body.mime_type ?? null, sizeBytes]); await this.queue.enqueue('artifact_processing', { artifactId: result.rows[0].id, artifact_id: result.rows[0].id, runId, run_id: runId, artifactType, artifact_type: artifactType }); await this.db.query("INSERT INTO job_events (tenant_id,run_id,event_type,message,payload) VALUES ($1,$2,'artifact.uploaded',$3,$4)", [tenantId, runId, `${artifactType} artifact uploaded`, { artifact_id: result.rows[0].id }]); return result.rows[0]; }
  @Get('events/stream') @Header('Content-Type', 'text/event-stream') async stream(@Res() res: Response) { res.write(`event: ready\ndata: ${JSON.stringify({ ok: true, at: new Date().toISOString() })}\n\n`); const timer = setInterval(() => res.write(`event: heartbeat\ndata: ${JSON.stringify({ at: new Date().toISOString() })}\n\n`), 15000); res.on('close', () => clearInterval(timer)); }

  private rememberMe(body: Record<string, unknown>) {
    const value = body.remember_me ?? body.rememberMe;
    return value === true || value === 1 || value === '1' || value === 'true' || value === 'on';
  }

  private async createJob(subjectType: 'managed_target', targetId: string, oneTimeAuditId: null, body: Record<string, unknown>) {
    assertExactlyOneSubject(subjectType, targetId, oneTimeAuditId);
    const tenantId = await this.db.tenantId();
    const mode = body.mode ?? 'ssh_push';
    const job = await this.db.query('INSERT INTO scan_jobs (tenant_id,subject_type,target_id,one_time_audit_id,mode,priority,scanner_version,status) VALUES ($1,$2,$3,$4,$5,$6,$7,\'queued\') RETURNING *', [tenantId, subjectType, targetId, oneTimeAuditId, mode, body.priority ?? 50, body.scanner_version ?? null]);
    const run = await this.db.query('INSERT INTO scan_runs (tenant_id,job_id,subject_type,target_id,one_time_audit_id,status,runtime_context,app_version,scanner_bundle_version,scanner_script_sha256) VALUES ($1,$2,$3,$4,$5,\'pending\',$6,$7,$8,$9) RETURNING *', [tenantId, job.rows[0].id, subjectType, targetId, oneTimeAuditId, body.runtime_context ?? {}, '0.1.0', body.scanner_bundle_version ?? null, body.scanner_script_sha256 ?? null]);
    await this.db.query("INSERT INTO job_events (tenant_id,job_id,run_id,event_type,message,progress_percent) VALUES ($1,$2,$3,'job.queued','Scan job queued',0)", [tenantId, job.rows[0].id, run.rows[0].id]);
    const queue = await this.queue.enqueue('scan_jobs', {
      id: job.rows[0].id,
      jobId: job.rows[0].id,
      runId: run.rows[0].id,
      run_id: run.rows[0].id,
      subjectType,
      subject_type: subjectType,
      targetId,
      target_id: targetId,
      oneTimeAuditId,
      one_time_audit_id: oneTimeAuditId,
      scannerOutput: this.scannerOutput(subjectType, targetId, oneTimeAuditId, body),
    });
    return { job: job.rows[0], run: run.rows[0], queue };
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

  private async applyWorkerEventState(runId: string, eventType: string) {
    if (eventType === RUN_EVENT_TYPE.jobClaimed) {
      await this.db.query("UPDATE scan_runs SET status='leased', lease_owner='worker-node', lease_expires_at=now()+interval '15 minutes', updated_at=now() WHERE id=$1", [runId]);
      await this.db.query("UPDATE scan_jobs SET status='leased', started_at=COALESCE(started_at, now()), updated_at=now() WHERE id=(SELECT job_id FROM scan_runs WHERE id=$1)", [runId]);
      return;
    }
    if (eventType === RUN_EVENT_TYPE.jobRunning || eventType === RUN_EVENT_TYPE.parseStarted || eventType === RUN_EVENT_TYPE.parseSucceeded) {
      await this.db.query("UPDATE scan_runs SET status='running', started_at=COALESCE(started_at, now()), heartbeat_at=now(), updated_at=now() WHERE id=$1", [runId]);
      await this.db.query("UPDATE scan_jobs SET status='running', started_at=COALESCE(started_at, now()), updated_at=now() WHERE id=(SELECT job_id FROM scan_runs WHERE id=$1)", [runId]);
      return;
    }
    if (eventType === RUN_EVENT_TYPE.jobSucceeded) {
      await this.db.query("UPDATE scan_runs SET status='completed', completed_at=now(), heartbeat_at=now(), updated_at=now() WHERE id=$1", [runId]);
      await this.db.query("UPDATE scan_jobs SET status='completed', completed_at=now(), updated_at=now() WHERE id=(SELECT job_id FROM scan_runs WHERE id=$1)", [runId]);
      return;
    }
    if (eventType === RUN_EVENT_TYPE.jobFailed) {
      await this.db.query("UPDATE scan_runs SET status='failed', completed_at=now(), heartbeat_at=now(), updated_at=now() WHERE id=$1", [runId]);
      await this.db.query("UPDATE scan_jobs SET status='failed', completed_at=now(), updated_at=now() WHERE id=(SELECT job_id FROM scan_runs WHERE id=$1)", [runId]);
    }
  }

  private setSessionCookie(res: Response, token: string, rememberMe = false) {
    res.cookie('shore_session', token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: rememberMe ? THIRTY_DAYS_SECONDS * 1000 : undefined,
    });
  }

  private async requireAdmin(req: Request) {
    const user = await this.auth.me(this.token(req));
    const roles = Array.isArray(user?.roles) ? user.roles : [];
    if (!roles.includes('admin')) throw new ForbiddenException('Admin role required');
    return user;
  }

  private token(req: Request) { const cookieToken = (req as Request & { cookies?: Record<string, string> }).cookies?.shore_session; const auth = req.header('authorization'); return cookieToken ?? (auth?.startsWith('Bearer ') ? auth.slice(7) : undefined); }

  // ── User management ──────────────────────────────────────────────

  @Get('users')
  async listUsers(@Req() req: Request) {
    const tenantId = await this.db.tenantId();
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
  async listRoles() {
    const result = await this.db.query('SELECT name, description FROM roles ORDER BY name');
    return result.rows;
  }

  @Post('users')
  async createUser(@Body() body: Record<string, unknown>) {
    const tenantId = await this.db.tenantId();
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
      [tenantId, null, 'user.created', 'user', userId, { email, displayName, roles }],
    );

    return { id: userId, email, display_name: displayName, roles };
  }

  @Patch('users/:id')
  async updateUser(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    const tenantId = await this.db.tenantId();
    const fields: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (typeof body.email === 'string') { fields.push(`email = $${idx++}`); values.push(body.email); }
    if (typeof body.display_name === 'string') { fields.push(`display_name = $${idx++}`); values.push(body.display_name); }

    if (fields.length > 0) {
      fields.push(`updated_at = now()`);
      values.push(id);
      await this.db.query(`UPDATE users SET ${fields.join(', ')} WHERE id = $${idx}`, values);
    }

    if (Array.isArray(body.roles)) {
      await this.db.query('DELETE FROM user_roles WHERE user_id = $1', [id]);
      for (const roleName of body.roles as string[]) {
        await this.db.query(
          'INSERT INTO user_roles (user_id, role_id) SELECT $1, id FROM roles WHERE name = $2 ON CONFLICT DO NOTHING',
          [id, roleName],
        );
      }
    }

    await this.db.query(
      'INSERT INTO audit_log (tenant_id, actor_user_id, action, resource_type, resource_id, payload) VALUES ($1,$2,$3,$4,$5,$6)',
      [tenantId, null, 'user.updated', 'user', id, { updated_fields: Object.keys(body) }],
    );

    const result = await this.db.query(
      `SELECT u.id, u.email, u.display_name, u.disabled_at, u.created_at, u.updated_at,
              json_agg(r.name ORDER BY r.name) AS roles
       FROM users u
       LEFT JOIN user_roles ur ON ur.user_id = u.id
       LEFT JOIN roles r ON r.id = ur.role_id
       WHERE u.id = $1
       GROUP BY u.id`,
      [id],
    );
    return result.rows[0];
  }

  @Post('users/:id/reset-password')
  async resetPassword(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    const tenantId = await this.db.tenantId();
    const password = requireString(body, 'password');
    const passwordHash = await bcrypt.hash(password, 12);
    await this.db.query('UPDATE users SET password_hash = $1, updated_at = now() WHERE id = $2', [passwordHash, id]);
    await this.db.query(
      'INSERT INTO audit_log (tenant_id, actor_user_id, action, resource_type, resource_id, payload) VALUES ($1,$2,$3,$4,$5,$6)',
      [tenantId, null, 'user.password_reset', 'user', id, {}],
    );
    return { ok: true };
  }

  @Delete('users/:id')
  async deleteUser(@Param('id') id: string) {
    const tenantId = await this.db.tenantId();
    await this.db.query(
      'INSERT INTO audit_log (tenant_id, actor_user_id, action, resource_type, resource_id, payload) VALUES ($1,$2,$3,$4,$5,$6)',
      [tenantId, null, 'user.deleted', 'user', id, { actor_user_id_detached: true }],
    );
    await this.db.query('UPDATE audit_log SET actor_user_id = NULL WHERE actor_user_id = $1', [id]);
    await this.db.query('DELETE FROM user_roles WHERE user_id = $1', [id]);
    await this.db.query('DELETE FROM users WHERE id = $1', [id]);
    return { ok: true };
  }

  @Post('users/:id/disable')
  async disableUser(@Param('id') id: string) {
    const tenantId = await this.db.tenantId();
    await this.db.query("UPDATE users SET disabled_at = now(), updated_at = now() WHERE id = $1", [id]);
    await this.db.query(
      'INSERT INTO audit_log (tenant_id, actor_user_id, action, resource_type, resource_id, payload) VALUES ($1,$2,$3,$4,$5,$6)',
      [tenantId, null, 'user.disabled', 'user', id, {}],
    );
    return { ok: true };
  }

  @Post('users/:id/enable')
  async enableUser(@Param('id') id: string) {
    const tenantId = await this.db.tenantId();
    await this.db.query('UPDATE users SET disabled_at = NULL, updated_at = now() WHERE id = $1', [id]);
    await this.db.query(
      'INSERT INTO audit_log (tenant_id, actor_user_id, action, resource_type, resource_id, payload) VALUES ($1,$2,$3,$4,$5,$6)',
      [tenantId, null, 'user.enabled', 'user', id, {}],
    );
    return { ok: true };
  }
}
