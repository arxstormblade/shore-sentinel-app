import { BadRequestException, Body, Controller, Delete, Get, Header, NotFoundException, Param, Patch, Post, Req, Res } from '@nestjs/common';
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
  @Get('settings/current') async settings() { const tenantId = await this.db.tenantId(); const result = await this.db.query('SELECT s.*, t.slug AS tenant_slug FROM settings s JOIN tenants t ON t.id=s.tenant_id WHERE s.tenant_id=$1', [tenantId]); return result.rows[0]; }
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
    await this.db.query('DELETE FROM target_group_members WHERE target_id=$2', [tenantId, id]);
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
