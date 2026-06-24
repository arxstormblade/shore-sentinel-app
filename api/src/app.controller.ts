import { BadRequestException, Body, ConflictException, Controller, Delete, Get, Header, NotFoundException, Param, Patch, Post, Req, Res } from '@nestjs/common';
import bcrypt from 'bcryptjs';
import { createHash } from 'node:crypto';
import type { Request, Response } from 'express';
import { RUN_EVENT_TYPE, scannerBundleContractVersion } from '@shore-sentinel/shared';
import { ArtifactService } from './artifact.service.js';
import { AuthService } from './auth.service.js';
import { DatabaseService } from './database.service.js';
import { QueueService } from './queue.service.js';
import { assertExactlyOneSubject, requireString, validateArtifactComplete, validateArtifactType } from './validation.js';

@Controller()
export class AppController {
  constructor(private readonly db: DatabaseService, private readonly auth: AuthService, private readonly queue: QueueService, private readonly artifacts: ArtifactService) {}

  @Get('health') health() { return { ok: true, service: 'shore-sentinel-api' }; }
  @Get('ready') async ready() { await this.db.query('SELECT 1'); return { ok: this.db.isReady(), database: 'ok', redis: await this.queue.health().catch((error) => ({ configured: true, error: error.message })) }; }
  @Post('auth/register') async register(@Body() body: Record<string, unknown>, @Res({ passthrough: true }) res: Response) { const result = await this.auth.register(requireString(body, 'name'), requireString(body, 'email'), requireString(body, 'password')); this.setSessionCookie(res, result.token); return { user: result.user }; }
  @Post('auth/login') async login(@Body() body: Record<string, unknown>, @Res({ passthrough: true }) res: Response) { const result = await this.auth.login(requireString(body, 'email'), requireString(body, 'password'), body.rememberMe === true || body.rememberMe === 'true' || body.rememberMe === 'on'); this.setSessionCookie(res, result.token, body.rememberMe === true || body.rememberMe === 'true' || body.rememberMe === 'on'); return { user: result.user }; }
  @Post('auth/logout') logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) { this.auth.logout(this.token(req)); res.clearCookie('shore_session'); return { ok: true }; }
  @Get('auth/me') async me(@Req() req: Request) { return this.auth.me(this.token(req)); }

  @Get('users')
  async listUsers() {
    const tenantId = await this.db.tenantId();
    const result = await this.db.query(
      `SELECT u.id, u.email, u.display_name, u.disabled_at, u.created_at, u.updated_at,
              COALESCE(json_agg(r.name ORDER BY r.name) FILTER (WHERE r.name IS NOT NULL), '[]'::json) AS roles
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
    const roles = Array.isArray(body.roles) ? body.roles.map(String) : ['operator'];
    const existing = await this.db.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows[0]) throw new ConflictException('Email already exists');
    const passwordHash = await bcrypt.hash(password, 12);
    const created = await this.db.query<{ id: string }>('INSERT INTO users (tenant_id, email, display_name, password_hash) VALUES ($1,$2,$3,$4) RETURNING id', [tenantId, email, displayName, passwordHash]);
    const userId = created.rows[0].id;
    for (const roleName of roles) await this.db.query('INSERT INTO user_roles (user_id, role_id) SELECT $1, id FROM roles WHERE name = $2 ON CONFLICT DO NOTHING', [userId, roleName]);
    await this.db.query('INSERT INTO audit_log (tenant_id, actor_user_id, action, resource_type, resource_id, payload) VALUES ($1,$2,$3,$4,$5,$6)', [tenantId, null, 'user.created', 'user', userId, { email, displayName, roles }]);
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
    if (typeof body.password === 'string' && body.password.length > 0) { fields.push(`password_hash = $${idx++}`); values.push(await bcrypt.hash(body.password, 12)); }
    if (fields.length > 0) {
      fields.push('updated_at = now()');
      values.push(tenantId, id);
      await this.db.query(`UPDATE users SET ${fields.join(', ')} WHERE tenant_id = $${idx++} AND id = $${idx}`, values);
    }
    if (Array.isArray(body.roles)) {
      await this.db.query('DELETE FROM user_roles WHERE user_id = $1', [id]);
      for (const roleName of body.roles.map(String)) await this.db.query('INSERT INTO user_roles (user_id, role_id) SELECT $1, id FROM roles WHERE name = $2 ON CONFLICT DO NOTHING', [id, roleName]);
    }
    await this.db.query('INSERT INTO audit_log (tenant_id, actor_user_id, action, resource_type, resource_id, payload) VALUES ($1,$2,$3,$4,$5,$6)', [tenantId, null, 'user.updated', 'user', id, { updated_fields: Object.keys(body) }]);
    const result = await this.db.query(
      `SELECT u.id, u.email, u.display_name, u.disabled_at, u.created_at, u.updated_at,
              COALESCE(json_agg(r.name ORDER BY r.name) FILTER (WHERE r.name IS NOT NULL), '[]'::json) AS roles
       FROM users u
       LEFT JOIN user_roles ur ON ur.user_id = u.id
       LEFT JOIN roles r ON r.id = ur.role_id
       WHERE u.tenant_id = $1 AND u.id = $2
       GROUP BY u.id`,
      [tenantId, id],
    );
    if (!result.rows[0]) throw new BadRequestException('user not found');
    return result.rows[0];
  }

  @Post('users/:id/reset-password')
  async resetPassword(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    const tenantId = await this.db.tenantId();
    const passwordHash = await bcrypt.hash(requireString(body, 'password'), 12);
    await this.db.query('UPDATE users SET password_hash = $1, updated_at = now() WHERE tenant_id = $2 AND id = $3', [passwordHash, tenantId, id]);
    await this.db.query('INSERT INTO audit_log (tenant_id, actor_user_id, action, resource_type, resource_id, payload) VALUES ($1,$2,$3,$4,$5,$6)', [tenantId, null, 'user.password_reset', 'user', id, {}]);
    return { ok: true };
  }

  @Delete('users/:id')
  async deleteUser(@Param('id') id: string) {
    const tenantId = await this.db.tenantId();
    await this.db.query('DELETE FROM user_roles WHERE user_id = $1', [id]);
    await this.db.query('DELETE FROM users WHERE tenant_id = $1 AND id = $2', [tenantId, id]);
    await this.db.query('INSERT INTO audit_log (tenant_id, actor_user_id, action, resource_type, resource_id, payload) VALUES ($1,$2,$3,$4,$5,$6)', [tenantId, null, 'user.deleted', 'user', id, {}]);
    return { ok: true };
  }

  @Post('users/:id/disable')
  async disableUser(@Param('id') id: string) {
    const tenantId = await this.db.tenantId();
    await this.db.query('UPDATE users SET disabled_at = now(), updated_at = now() WHERE tenant_id = $1 AND id = $2', [tenantId, id]);
    await this.db.query('INSERT INTO audit_log (tenant_id, actor_user_id, action, resource_type, resource_id, payload) VALUES ($1,$2,$3,$4,$5,$6)', [tenantId, null, 'user.disabled', 'user', id, {}]);
    return { ok: true };
  }

  @Post('users/:id/enable')
  async enableUser(@Param('id') id: string) {
    const tenantId = await this.db.tenantId();
    await this.db.query('UPDATE users SET disabled_at = NULL, updated_at = now() WHERE tenant_id = $1 AND id = $2', [tenantId, id]);
    await this.db.query('INSERT INTO audit_log (tenant_id, actor_user_id, action, resource_type, resource_id, payload) VALUES ($1,$2,$3,$4,$5,$6)', [tenantId, null, 'user.enabled', 'user', id, {}]);
    return { ok: true };
  }

  @Get('settings/current') async settings() { const tenantId = await this.db.tenantId(); const result = await this.db.query('SELECT s.*, t.slug AS tenant_slug FROM settings s JOIN tenants t ON t.id=s.tenant_id WHERE s.tenant_id=$1', [tenantId]); return result.rows[0]; }
  @Get('dashboard/metrics')
  async dashboardMetrics() {
    const tenantId = await this.db.tenantId();
    const severityCounts = { critical: 0, high: 0, medium: 0, low: 0, informational: 0 };
    const severityResult = await this.db.query('SELECT f.severity, count(*)::int AS count FROM finding_instances fi JOIN findings f ON f.id=fi.finding_id WHERE fi.tenant_id=$1 GROUP BY f.severity', [tenantId]);
    for (const row of severityResult.rows) {
      const severity = String(row.severity || '').toLowerCase();
      if (Object.prototype.hasOwnProperty.call(severityCounts, severity)) severityCounts[severity as keyof typeof severityCounts] = Number(row.count) || 0;
    }
    const recentRuns = await this.db.query(`SELECT r.id, r.status, r.subject_type, r.target_id, r.one_time_audit_id, r.created_at, r.completed_at, COALESCE(t.hostname, a.display_name, 'unknown subject') AS subject_name FROM scan_runs r LEFT JOIN targets t ON t.id=r.target_id LEFT JOIN one_time_audits a ON a.id=r.one_time_audit_id WHERE r.tenant_id=$1 ORDER BY r.created_at DESC LIMIT 5`, [tenantId]);
    return { severityCounts, totalFindings: Object.values(severityCounts).reduce((sum, count) => sum + count, 0), recentRuns: recentRuns.rows };
  }
  @Get('scan-runs')
  async scanRuns() {
    const tenantId = await this.db.tenantId();
    const result = await this.db.query(`SELECT r.id, r.status, r.subject_type, r.target_id, r.one_time_audit_id, r.created_at, r.started_at, r.completed_at, COALESCE(t.hostname, a.display_name, 'unknown subject') AS subject_name, COALESCE(count(DISTINCT fi.id), 0)::int AS findings_count, COALESCE(json_agg(DISTINCT jsonb_build_object('id', ar.id, 'artifact_type', ar.artifact_type, 'mime_type', ar.mime_type, 'size_bytes', ar.size_bytes, 'created_at', ar.created_at)) FILTER (WHERE ar.id IS NOT NULL), '[]'::json) AS artifacts FROM scan_runs r LEFT JOIN targets t ON t.id=r.target_id LEFT JOIN one_time_audits a ON a.id=r.one_time_audit_id LEFT JOIN finding_instances fi ON fi.tenant_id=$1 AND fi.run_id=r.id LEFT JOIN artifacts ar ON ar.tenant_id=$1 AND ar.run_id=r.id WHERE r.tenant_id=$1 GROUP BY r.id, t.hostname, a.display_name ORDER BY r.created_at DESC LIMIT 50`, [tenantId]);
    return result.rows;
  }

  @Get('findings')
  async findings() {
    const tenantId = await this.db.tenantId();
    const result = await this.db.query(`SELECT fi.id, fi.status, fi.evidence_summary, fi.created_at, f.title, f.category, f.severity, f.description, r.id AS run_id, r.status AS run_status, COALESCE(t.hostname, a.display_name, 'unknown subject') AS subject_name, ri.id AS remediation_id, ri.title AS remediation_title, ri.action AS remediation_action, ri.instructions AS remediation_instructions, ri.status AS remediation_status FROM finding_instances fi JOIN findings f ON f.id=fi.finding_id JOIN scan_runs r ON r.id=fi.run_id LEFT JOIN targets t ON t.id=fi.target_id LEFT JOIN one_time_audits a ON a.id=fi.one_time_audit_id LEFT JOIN remediation_items ri ON ri.finding_instance_id=fi.id WHERE fi.tenant_id=$1 ORDER BY CASE f.severity WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 WHEN 'low' THEN 4 ELSE 5 END, fi.created_at DESC LIMIT 100`, [tenantId]);
    return result.rows;
  }

  @Get('targets') async targets() { const tenantId = await this.db.tenantId(); const result = await this.db.query('SELECT t.*, e.name AS environment_name, e.slug AS environment_slug FROM targets t LEFT JOIN environments e ON e.id=t.environment_id WHERE t.tenant_id=$1 ORDER BY t.created_at DESC', [tenantId]); return result.rows; }
  @Get('targets/:id') async target(@Param('id') id: string) { const tenantId = await this.db.tenantId(); const result = await this.db.query('SELECT t.*, e.name AS environment_name, e.slug AS environment_slug FROM targets t LEFT JOIN environments e ON e.id=t.environment_id WHERE t.tenant_id=$1 AND t.id=$2', [tenantId, id]); if (!result.rows[0]) throw new BadRequestException('target not found'); return result.rows[0]; }
  @Get('targets/:id/scan-runs') async targetScanRuns(@Param('id') id: string) { const tenantId = await this.db.tenantId(); const result = await this.db.query(`SELECT r.*, latest.event_type AS latest_event_type, latest.message AS latest_event_message, latest.progress_percent AS latest_progress_percent, latest.created_at AS latest_event_at, COALESCE(json_agg(jsonb_build_object('id', a.id, 'artifact_type', a.artifact_type, 'storage_uri', a.storage_uri, 'sha256', a.sha256, 'mime_type', a.mime_type, 'size_bytes', a.size_bytes, 'parse_status', a.parse_status, 'created_at', a.created_at) ORDER BY a.created_at DESC) FILTER (WHERE a.id IS NOT NULL), '[]'::json) AS artifacts FROM scan_runs r LEFT JOIN LATERAL (SELECT event_type, message, progress_percent, created_at FROM job_events e WHERE e.tenant_id=$1 AND e.run_id=r.id ORDER BY e.created_at DESC LIMIT 1) latest ON TRUE LEFT JOIN artifacts a ON a.tenant_id=$1 AND a.run_id=r.id WHERE r.tenant_id=$1 AND r.target_id=$2 GROUP BY r.id, latest.event_type, latest.message, latest.progress_percent, latest.created_at ORDER BY r.created_at DESC`, [tenantId, id]); return { runs: result.rows }; }
  @Get('scan-runs/:id/artifacts') async runArtifacts(@Param('id') id: string) { const tenantId = await this.db.tenantId(); const result = await this.db.query('SELECT * FROM artifacts WHERE tenant_id=$1 AND run_id=$2 ORDER BY created_at DESC', [tenantId, id]); return { artifacts: result.rows }; }
  @Patch('targets/:id') async updateTarget(@Param('id') id: string, @Body() body: Record<string, unknown>) { const tenantId = await this.db.tenantId(); const current = await this.db.query('SELECT * FROM targets WHERE tenant_id=$1 AND id=$2', [tenantId, id]); if (!current.rows[0]) throw new BadRequestException('target not found'); const fields = ['hostname', 'fqdn', 'ip_address', 'owner_team', 'platform', 'connection_mode', 'monitoring_enabled'] as const; const updates: string[] = []; const params: unknown[] = [tenantId, id]; for (const field of fields) { if (Object.prototype.hasOwnProperty.call(body, field)) { updates.push(`${field}=$${params.length + 1}`); params.push(body[field]); } } if (!updates.length) return current.rows[0]; const result = await this.db.query(`UPDATE targets SET ${updates.join(', ')}, updated_at=now() WHERE tenant_id=$1 AND id=$2 RETURNING *`, params); return result.rows[0]; }
  @Delete('targets/:id') async deleteTarget(@Param('id') id: string) { const tenantId = await this.db.tenantId(); const target = await this.db.query('SELECT id FROM targets WHERE tenant_id=$1 AND id=$2', [tenantId, id]); if (!target.rows[0]) throw new BadRequestException('target not found'); const jobs = await this.db.query<{ id: string }>('SELECT id FROM scan_jobs WHERE tenant_id=$1 AND target_id=$2', [tenantId, id]); const runs = await this.db.query<{ id: string }>('SELECT id FROM scan_runs WHERE tenant_id=$1 AND target_id=$2', [tenantId, id]); const jobIds = jobs.rows.map((row) => row.id); const runIds = runs.rows.map((row) => row.id); if (runIds.length) { await this.db.query('DELETE FROM job_events WHERE tenant_id=$1 AND run_id = ANY($2::uuid[])', [tenantId, runIds]); await this.db.query('DELETE FROM artifacts WHERE tenant_id=$1 AND run_id = ANY($2::uuid[])', [tenantId, runIds]); await this.db.query('DELETE FROM remediation_items WHERE tenant_id=$1 AND finding_instance_id IN (SELECT id FROM finding_instances WHERE tenant_id=$1 AND target_id=$2)', [tenantId, id]); await this.db.query('DELETE FROM finding_instances WHERE tenant_id=$1 AND run_id = ANY($2::uuid[])', [tenantId, runIds]); await this.db.query('DELETE FROM notification_events WHERE tenant_id=$1 AND run_id = ANY($2::uuid[])', [tenantId, runIds]); }
    await this.db.query('DELETE FROM job_events WHERE tenant_id=$1 AND job_id = ANY($2::uuid[])', [tenantId, jobIds]);
    await this.db.query('DELETE FROM scan_runs WHERE tenant_id=$1 AND id = ANY($2::uuid[])', [tenantId, runIds]);
    await this.db.query('DELETE FROM scan_jobs WHERE tenant_id=$1 AND id = ANY($2::uuid[])', [tenantId, jobIds]);
    await this.db.query('DELETE FROM notification_events WHERE tenant_id=$1 AND target_id=$2', [tenantId, id]);
    await this.db.query('DELETE FROM target_status_checks WHERE tenant_id=$1 AND target_id=$2', [tenantId, id]);
    await this.db.query('DELETE FROM schedules WHERE tenant_id=$1 AND target_id=$2', [tenantId, id]);
    await this.db.query('DELETE FROM target_identities WHERE tenant_id=$1 AND target_id=$2', [tenantId, id]);
    await this.db.query('DELETE FROM target_group_members WHERE target_id=$1', [id]);
    await this.db.query('DELETE FROM targets WHERE tenant_id=$1 AND id=$2', [tenantId, id]);
    return { deleted: true, id };
  }
  @Get('one-time-audits') async oneTimeAudits() { const tenantId = await this.db.tenantId(); const result = await this.db.query('SELECT * FROM one_time_audits WHERE tenant_id=$1 ORDER BY created_at DESC', [tenantId]); return result.rows; }
  @Get('one-time-audits/:id') async oneTimeAudit(@Param('id') id: string) { const tenantId = await this.db.tenantId(); const result = await this.db.query('SELECT * FROM one_time_audits WHERE tenant_id=$1 AND id=$2', [tenantId, id]); if (!result.rows[0]) throw new BadRequestException('one-time audit not found'); return result.rows[0]; }
  @Post('one-time-audits') async createAudit(@Body() body: Record<string, unknown>) { const tenantId = await this.db.tenantId(); const result = await this.db.query('INSERT INTO one_time_audits (tenant_id,display_name,hostname,ip_address,connection_mode) VALUES ($1,$2,$3,$4,$5) RETURNING *', [tenantId, requireString(body, 'display_name'), body.hostname ?? null, body.ip_address ?? null, body.connection_mode ?? 'ssh_push']); return result.rows[0]; }
  @Post('targets') async createTarget(@Body() body: Record<string, unknown>) { const tenantId = await this.db.tenantId(); const env = await this.db.query<{ id: string }>('SELECT id FROM environments WHERE tenant_id=$1 ORDER BY created_at LIMIT 1', [tenantId]); const result = await this.db.query('INSERT INTO targets (tenant_id,hostname,fqdn,ip_address,environment_id,owner_team,platform,connection_mode) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *', [tenantId, requireString(body, 'hostname'), body.fqdn ?? null, body.ip_address ?? null, env.rows[0]?.id ?? null, body.owner_team ?? null, body.platform ?? null, body.connection_mode ?? 'ssh_push']); return result.rows[0]; }
  @Post('one-time-audits/:id/run') async runAudit(@Param('id') id: string, @Body() body: Record<string, unknown>) { return this.createJob('one_time_audit', null, id, body); }
  @Post('targets/:id/scan-jobs') async runTarget(@Param('id') id: string, @Body() body: Record<string, unknown>) { return this.createJob('managed_target', id, null, body); }
  @Get('scan-jobs/:id') async job(@Param('id') id: string) { const result = await this.db.query('SELECT * FROM scan_jobs WHERE id=$1', [id]); if (!result.rows[0]) throw new BadRequestException('scan job not found'); return result.rows[0]; }
  @Get('scan-runs/:id') async run(@Param('id') id: string) { const result = await this.db.query('SELECT * FROM scan_runs WHERE id=$1', [id]); if (!result.rows[0]) throw new BadRequestException('scan run not found'); return result.rows[0]; }

  @Post('runs/:id/events')
  async workerEvent(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    const tenantId = await this.db.tenantId();
    const eventType = requireString(body, 'type');
    const message = typeof body.message === 'string' ? body.message : eventType;
    const progressPercent = typeof body.progress_percent === 'number'
      ? body.progress_percent
      : typeof body.progressPercent === 'number'
        ? body.progressPercent
        : ({
            'job.queued': 0,
            'job.claimed': 10,
            'job.running': 25,
            'parse.started': 45,
            'parse.succeeded': 60,
            'artifact.upload_requested': 75,
            'artifact.upload_succeeded': 85,
            'job.retry_scheduled': 90,
            'job.succeeded': 100,
            'job.failed': 100,
          } as Record<string, number | undefined>)[eventType] ?? null;
    await this.applyWorkerEventState(id, eventType);
    await this.db.query('INSERT INTO job_events (tenant_id,run_id,event_type,message,progress_percent,payload) VALUES ($1,$2,$3,$4,$5,$6)', [tenantId, id, eventType, message, progressPercent, body]);
    return { accepted: true, run_id: id, event_type: eventType };
  }

  @Get('scan-runs/:id/events') async events(@Param('id') id: string) { const result = await this.db.query('SELECT * FROM job_events WHERE run_id=$1 ORDER BY created_at', [id]); return { events: result.rows }; }
  @Post('artifacts/upload-init') async uploadInit(@Body() body: Record<string, unknown>) { return this.artifacts.createUpload(requireString(body, 'run_id'), validateArtifactType(requireString(body, 'artifact_type')), typeof body.mime_type === 'string' ? body.mime_type : undefined); }

  @Post('artifacts')
  async workerArtifact(@Body() body: Record<string, unknown>) {
    const tenantId = await this.db.tenantId();
    const runId = requireString(body, 'runId');
    const artifactType = validateArtifactType(requireString(body, 'kind'));
    const bodyBase64 = requireString(body, 'bodyBase64');
    const buffer = Buffer.from(bodyBase64, 'base64');
    const sha256 = createHash('sha256').update(buffer).digest('hex');
    const stored = await this.artifacts.storeWorkerArtifact(runId, artifactType, buffer, typeof body.contentType === 'string' ? body.contentType : undefined);
    const storageUri = stored.storage_uri;
    const result = await this.db.query("INSERT INTO artifacts (tenant_id,run_id,artifact_type,storage_uri,sha256,mime_type,size_bytes,parse_status,retention_expires_at) VALUES ($1,$2,$3,$4,$5,$6,$7,'uploaded',now()+interval '90 days') ON CONFLICT(run_id,artifact_type,sha256) DO UPDATE SET parse_status='uploaded', storage_uri=EXCLUDED.storage_uri, mime_type=EXCLUDED.mime_type RETURNING *", [tenantId, runId, artifactType, storageUri, sha256, body.contentType ?? null, buffer.length]);
    if (artifactType === 'scanner.normalized_findings') await this.persistNormalizedFindings(tenantId, runId, result.rows[0].id, buffer);
    await this.queue.enqueue('artifact_processing', { artifactId: result.rows[0].id, artifact_id: result.rows[0].id, runId, run_id: runId, artifactType, artifact_type: artifactType });
    await this.db.query("INSERT INTO job_events (tenant_id,run_id,event_type,message,payload) VALUES ($1,$2,'artifact.uploaded',$3,$4)", [tenantId, runId, `${artifactType} artifact uploaded through API handoff`, { artifact_id: result.rows[0].id, metadata: body.metadata ?? {} }]);
    return result.rows[0];
  }

  @Get('artifacts/:id/download')
  async downloadArtifact(@Param('id') id: string, @Res() res: Response) {
    const tenantId = await this.db.tenantId();
    const result = await this.db.query('SELECT * FROM artifacts WHERE tenant_id=$1 AND id=$2', [tenantId, id]);
    const artifact = result.rows[0];
    if (!artifact) throw new NotFoundException('artifact not found');
    const stream = await this.artifacts.readArtifact(artifact.storage_uri);
    const extension = artifact.artifact_type === 'markdown' ? 'md' : String(artifact.artifact_type).replace(/[^a-z0-9]/gi, '-');
    res.setHeader('content-type', artifact.mime_type || 'application/octet-stream');
    res.setHeader('content-disposition', `inline; filename="shore-sentinel-${artifact.run_id}-${artifact.artifact_type}.${extension}"`);
    stream.pipe(res);
  }

  @Post('artifacts/upload-complete') async uploadComplete(@Body() body: Record<string, unknown>) { const tenantId = await this.db.tenantId(); const runId = requireString(body, 'run_id'); const storageUri = requireString(body, 'storage_uri'); const { artifactType, sha256, sizeBytes } = validateArtifactComplete(body); const result = await this.db.query("INSERT INTO artifacts (tenant_id,run_id,artifact_type,storage_uri,sha256,mime_type,size_bytes,parse_status,retention_expires_at) VALUES ($1,$2,$3,$4,$5,$6,$7,'uploaded',now()+interval '90 days') ON CONFLICT(run_id,artifact_type,sha256) DO UPDATE SET parse_status='uploaded' RETURNING *", [tenantId, runId, artifactType, storageUri, sha256, body.mime_type ?? null, sizeBytes]); await this.queue.enqueue('artifact_processing', { artifactId: result.rows[0].id, artifact_id: result.rows[0].id, runId, run_id: runId, artifactType, artifact_type: artifactType }); await this.db.query("INSERT INTO job_events (tenant_id,run_id,event_type,message,payload) VALUES ($1,$2,'artifact.uploaded',$3,$4)", [tenantId, runId, `${artifactType} artifact uploaded`, { artifact_id: result.rows[0].id }]); return result.rows[0]; }
  @Get('events/stream') @Header('Content-Type', 'text/event-stream') async stream(@Res() res: Response) { res.write(`event: ready\ndata: ${JSON.stringify({ ok: true, at: new Date().toISOString() })}\n\n`); const timer = setInterval(() => res.write(`event: heartbeat\ndata: ${JSON.stringify({ at: new Date().toISOString() })}\n\n`), 15000); res.on('close', () => clearInterval(timer)); }

  private normalizeFindingSeverity(value: unknown) {
    const severity = String(value || 'informational').toLowerCase();
    if (severity === 'critical' || severity === 'high' || severity === 'low' || severity === 'informational') return severity;
    if (severity === 'moderate' || severity === 'medium' || severity === 'med') return 'medium';
    if (severity === 'info') return 'informational';
    if (severity === 'crit') return 'critical';
    return 'informational';
  }

  private textValue(value: unknown, fallback = ''): string {
    if (typeof value === 'string') return value;
    if (value == null) return fallback;
    if (Array.isArray(value)) return value.map((item) => this.textValue(item)).filter(Boolean).join('\n');
    if (typeof value === 'object') {
      const record = value as Record<string, unknown>;
      const primary = record.instruction ?? record.action ?? record.recommendation ?? record.remediation ?? record.description ?? record.summary ?? record.title;
      const parts = [this.textValue(primary, fallback)];
      if (typeof record.file_path === 'string' && record.file_path) parts.push(`File: ${record.file_path}`);
      if (typeof record.command === 'string' && record.command) parts.push(`Command: ${record.command}`);
      return parts.filter((part) => part && part !== '[object Object]').join('\n') || fallback;
    }
    return String(value);
  }

  private evidenceSummary(value: unknown) {
    if (Array.isArray(value)) return value.map((item) => this.textValue(item)).filter(Boolean).join('\n').slice(0, 4000);
    return this.textValue(value).slice(0, 4000);
  }

  private async persistNormalizedFindings(tenantId: string, runId: string, artifactId: string, buffer: Buffer) {
    const parsed = JSON.parse(buffer.toString('utf8')) as unknown;
    const findings = Array.isArray(parsed) ? parsed : [];
    const run = await this.db.query('SELECT id, target_id, one_time_audit_id FROM scan_runs WHERE tenant_id=$1 AND id=$2', [tenantId, runId]);
    const runRow = run.rows[0];
    if (!runRow) throw new BadRequestException('scan run not found');
    await this.db.query('DELETE FROM remediation_items WHERE tenant_id=$1 AND finding_instance_id IN (SELECT id FROM finding_instances WHERE tenant_id=$1 AND run_id=$2)', [tenantId, runId]);
    await this.db.query('DELETE FROM finding_instances WHERE tenant_id=$1 AND run_id=$2', [tenantId, runId]);
    for (const raw of findings) {
      if (!raw || typeof raw !== 'object') continue;
      const finding = raw as Record<string, unknown>;
      const scannerFindingId = this.textValue(finding.id || finding.findingId || finding.title || `finding-${runId}`).slice(0, 500);
      const title = this.textValue(finding.title || finding.name || scannerFindingId, scannerFindingId).slice(0, 500);
      const category = this.textValue(finding.category || 'agent-security-selfcheck', 'agent-security-selfcheck').slice(0, 200);
      const severity = this.normalizeFindingSeverity(finding.severity);
      const description = this.textValue(finding.description || finding.summary || '').slice(0, 4000);
      const persisted = await this.db.query(
        `INSERT INTO findings (tenant_id, scanner_finding_id, title, category, severity, description)
         VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT(tenant_id, scanner_finding_id) DO UPDATE SET title=EXCLUDED.title, category=EXCLUDED.category, severity=EXCLUDED.severity, description=EXCLUDED.description, updated_at=now()
         RETURNING id`,
        [tenantId, scannerFindingId, title, category, severity, description],
      );
      const instance = await this.db.query(
        'INSERT INTO finding_instances (tenant_id,finding_id,run_id,target_id,one_time_audit_id,status,evidence_summary,source_artifact_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id',
        [tenantId, persisted.rows[0].id, runId, runRow.target_id ?? null, runRow.one_time_audit_id ?? null, 'open', this.evidenceSummary(finding.evidence), artifactId],
      );
      const remediation = finding.remediation || finding.recommendation;
      if (remediation) {
        await this.db.query(
          'INSERT INTO remediation_items (tenant_id,finding_instance_id,source,priority,category,title,action,instructions,status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)',
          [tenantId, instance.rows[0].id, 'scanner_generated', severity, category, `Remediate: ${title}`.slice(0, 500), this.textValue(remediation).slice(0, 1000), this.textValue(remediation).slice(0, 4000), 'open'],
        );
      }
    }
  }

  private async createJob(subjectType: 'managed_target' | 'one_time_audit', targetId: string | null, oneTimeAuditId: string | null, body: Record<string, unknown>) {
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

  private scannerOutput(subjectType: 'managed_target' | 'one_time_audit', targetId: string | null, oneTimeAuditId: string | null, body: Record<string, unknown>) {
    if (body.scannerOutput && typeof body.scannerOutput === 'object') return body.scannerOutput;
    const subjectId = targetId ?? oneTimeAuditId ?? 'unknown-subject';
    return {
      contractVersion: scannerBundleContractVersion(),
      scanner: { name: 'shore-sentinel-bundled-scanner', version: body.scanner_version ?? '3.4.0' },
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

  private setSessionCookie(res: Response, token: string, rememberMe = false) { res.cookie('shore_session', token, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: rememberMe ? 1000 * 60 * 60 * 24 * 30 : undefined }); }
  private token(req: Request) { const cookieToken = (req as Request & { cookies?: Record<string, string> }).cookies?.shore_session; const auth = req.header('authorization'); return cookieToken ?? (auth?.startsWith('Bearer ') ? auth.slice(7) : undefined); }
}
