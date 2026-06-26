import test from 'node:test';
import assert from 'node:assert/strict';
import { ARTIFACT_KIND, QUEUES, scannerBundleContractVersion } from '@shore-sentinel/shared';
import { BadRequestException } from '@nestjs/common';
import { AppController } from '../src/app.controller.js';

function controller() {
  const calls: string[] = [];
  const queueCalls: { queueName: string; payload: Record<string, unknown> }[] = [];
  const rows: Record<string, unknown>[] = [];
  let savedViewsListCalls = 0;
  const db = {
    isReady: () => true,
    tenantId: async () => 'tenant-1',
    query: async (sql: string, params: unknown[] = []) => {
      calls.push(sql);
      if (sql.includes('UPDATE targets SET')) return { rows: [{ id: 'target-1', hostname: params[2] ?? 'alpha-ws-01', fqdn: params[3] ?? 'alpha-ws-01.example.test', owner_team: params[4] ?? 'Desktop Engineering', platform: params[5] ?? 'windows', connection_mode: params[6] ?? 'pull_checkin' }] };
      if (sql.includes('INSERT INTO saved_views')) return { rows: [{ id: 'sv-1', slug: params[1], title: params[2], view_type: params[3], filters: params[4], sort_by: params[5], is_pinned: params[6] ?? false }] };
      if (sql.includes('DELETE FROM saved_views')) return { rows: [{ id: 'sv-1' }] };
      if (sql.includes('saved_views WHERE tenant_id') && sql.includes('ORDER BY')) {
        savedViewsListCalls += 1;
        if (savedViewsListCalls === 1) return { rows: [] };
        return { rows: [
          { id: 'sv-1', slug: 'high-findings', title: 'High findings', view_type: 'high_findings', sort_by: 'severity', is_pinned: false, filters: { severity: 'critical,high' } },
          { id: 'sv-2', slug: 'unreviewed-remediation', title: 'Unreviewed remediation', view_type: 'unreviewed_remediation', sort_by: 'date', is_pinned: false, filters: { status: 'needs_review' } },
          { id: 'sv-3', slug: 'failed-scans', title: 'Failed scans', view_type: 'failed_scans', sort_by: 'date', is_pinned: false, filters: { runStatus: 'failed' } },
          { id: 'sv-4', slug: 'recently-completed', title: 'Recently completed scans', view_type: 'recently_completed', sort_by: 'date', is_pinned: false, filters: { runStatus: 'completed', timeRange: 'Last 30 days' } },
        ] };
      }
      if (sql.includes('saved_views WHERE tenant_id') && sql.includes('slug = $2')) return { rows: [{ id: 'sv-1', slug: 'high-findings', title: 'High findings', view_type: 'high_findings', sort_by: 'severity', is_pinned: false }] };
      if (sql.includes('saved_views WHERE tenant_id') && sql.includes('slug=$2')) return { rows: [{ id: 'sv-1', slug: 'high-findings', title: 'High findings', view_type: 'high_findings', sort_by: 'severity', is_pinned: false }] };
      if (sql.includes('SELECT f.severity, count(*)::int AS count')) return { rows: [{ severity: 'high', count: 2 }, { severity: 'medium', count: 1 }] };
      if (sql.includes("date_trunc('day', fi.created_at)")) return { rows: [
        { bucket_date: '2026-06-24', severity: 'high', count: 1 },
        { bucket_date: '2026-06-25', severity: 'medium', count: 2 },
      ] };
      if (sql.includes('COALESCE(sum(CASE f.severity')) return { rows: [
        { id: 'run-1', completed_at: '2026-06-25T00:00:00.000Z', subject_name: 'alpha-ws-01', risk_points: 23, findings_count: 3 },
      ] };
      if (sql.includes('fixed_findings')) return { rows: [{ new_findings: 3, fixed_findings: 1, open_findings: 2 }] };
      if (sql.includes('SELECT ri.status, count(*)::int AS count FROM remediation_items')) return { rows: [{ status: 'needs_review', count: 3 }, { status: 'fixed', count: 1 }] };
      if (sql.includes('FROM scan_runs r LEFT JOIN targets') && sql.includes('LIMIT 50')) return { rows: [{ id: 'run-1', status: 'completed', subject_name: 'alpha-ws-01', findings_count: 3, artifacts: [{ id: 'artifact-1', artifact_type: 'pdf' }] }] };
      if (sql.includes('FROM scan_runs r LEFT JOIN targets') && sql.includes('LIMIT 5')) return { rows: [{ id: 'run-1', status: 'completed', subject_name: 'alpha-ws-01' }] };
      if (sql.includes('FROM finding_instances fi JOIN findings')) return { rows: [{ id: 'finding-instance-1', title: 'High risk issue', severity: 'high', remediation_action: 'Fix it', subject_name: 'alpha-ws-01', remediation_status: 'needs_review' }] };
      if (sql.includes('INSERT INTO scan_jobs')) return { rows: [{ id: 'job-1', tenant_id: params[0], subject_type: params[1], target_id: params[2], one_time_audit_id: params[3], status: 'queued' }] };
      if (sql.includes('INSERT INTO scan_runs')) return { rows: [{ id: 'run-1', job_id: params[1], subject_type: params[2], target_id: params[3], one_time_audit_id: params[4], status: 'pending' }] };
      if (sql.includes('INSERT INTO artifacts')) return { rows: [{ id: 'artifact-1', run_id: params[1], artifact_type: params[2], storage_uri: params[3], sha256: params[4], size_bytes: params[6] }] };
      if (sql.includes('SELECT id, target_id, one_time_audit_id FROM scan_runs')) return { rows: [{ id: 'run-1', target_id: 'target-1', one_time_audit_id: null }] };
      if (sql.includes('INSERT INTO findings')) return { rows: [{ id: 'finding-1', scanner_finding_id: params[1], title: params[2], severity: params[4] }] };
      if (sql.includes('INSERT INTO finding_instances')) return { rows: [{ id: 'finding-instance-1' }] };
      if (sql.includes('INSERT INTO remediation_items')) return { rows: [{ id: 'remediation-1', finding_instance_id: params[1], title: params[5], status: params[8] }] };
      if (sql.includes('INSERT INTO one_time_audits')) return { rows: [{ id: 'audit-1', display_name: params[1], status: 'draft' }] };
      if (sql.includes('INSERT INTO targets')) return { rows: [{ id: 'target-1', hostname: params[1], status: 'unknown' }] };
      if (sql.includes('SELECT id FROM environments')) return { rows: [{ id: 'env-1' }] };
      if (sql.includes('SELECT * FROM targets WHERE tenant_id=$1 AND id=$2')) return { rows: [{ id: 'target-1', hostname: 'alpha-ws-01', fqdn: 'alpha-ws-01.example.test', owner_team: 'Desktop Engineering', platform: 'windows', connection_mode: 'pull_checkin', monitoring_enabled: true }] };
      if (sql.includes('SELECT id FROM targets WHERE tenant_id=$1 AND id=$2')) return { rows: [{ id: 'target-1' }] };
      if (sql.includes('SELECT id, hostname FROM targets WHERE tenant_id = $1 AND id = $2')) return { rows: [{ id: 'target-1', hostname: 'alpha-ws-01' }] };
      if (sql.includes('SELECT * FROM artifacts WHERE tenant_id=$1 AND run_id=$2')) return { rows: [{ id: 'artifact-1', artifact_type: ARTIFACT_KIND.scannerRawOutput, storage_uri: 's3://bucket/runs/run-1/file.json', sha256: 'a'.repeat(64), mime_type: 'application/json', size_bytes: 12 }] };
      if (sql.includes('SELECT r.*') && sql.includes('FROM scan_runs r')) return { rows: [{ id: 'run-1', status: 'completed', latest_event_type: 'job.succeeded', latest_progress_percent: 100, artifacts: [{ id: 'artifact-1', artifact_type: ARTIFACT_KIND.scannerRawOutput }] }] };
      if (sql.includes('SELECT id FROM scan_runs WHERE id=$1')) {
        if (params[0] === 'nonexistent-run') return { rows: [] };
        return { rows: [{ id: params[0] }] };
      }
      if (sql.includes('FROM finding_instances fi') && sql.includes('JOIN findings f')) {
        if (params[1] === 'run-empty' || params[1] === 'nonexistent-run') return { rows: [] };
        return { rows: [{ finding_instance_id: 'finding-instance-1', finding_status: 'open', finding_id: 'finding-1', title: 'High risk issue', category: 'agent-security', severity: 'high', description: 'Evidence summary', remediation_id: 'remediation-1', remediation_title: 'Remediate: High risk issue', remediation_action: 'Fix it safely', remediation_instructions: 'Apply the recommended hardening step', remediation_status: 'needs_review', run_id: 'run-1' }] };
      }
      if (sql.includes('SELECT ri.id, ri.status, ri.title, ri.action, ri.instructions, ri.priority, ri.category, ri.due_date')) return { rows: [{ id: 'remediation-1', status: 'needs_review', title: 'Remediate: High risk issue', action: 'Fix it safely', severity: 'high', owner_name: 'Local Operator', evidence_artifact_type: 'pdf', subject_name: 'alpha-ws-01', finding_instance_id: 'finding-instance-1', run_id: 'run-1' }] };
      if (sql.includes('SELECT ri.id, ri.status, ri.title, ri.action, ri.instructions, ri.priority, ri.category, ri.file_path')) return { rows: [{ id: 'remediation-1', status: 'needs_review', title: 'Remediate: High risk issue', action: 'Fix it safely', owner_name: 'Local Operator', owner_email: 'operator@example.test', due_date: '2026-07-01', evidence_artifact_id: 'artifact-1', evidence_artifact_type: 'pdf', evidence_mime_type: 'application/pdf', evidence_size_bytes: 2048, evidence_storage_uri: 's3://bucket/runs/run-1/file.pdf', finding_instance_id: 'finding-instance-1', finding_title: 'High risk issue', severity: 'high', finding_description: 'Evidence summary', subject_name: 'alpha-ws-01' }] };
      if (sql.includes('FROM remediation_item_comments')) return { rows: [{ id: 'comment-1', body: 'Assigned to local operator', author_name: 'Local Operator', created_at: '2026-06-25T00:00:00.000Z' }] };
      if (sql.includes('FROM remediation_item_activity')) return { rows: [{ id: 'activity-1', event_type: 'remediation.status_changed', actor_name: 'System', payload: { from: 'needs_review', to: 'in_progress' }, created_at: '2026-06-25T00:05:00.000Z' }] };
      if (sql.includes('INSERT INTO remediation_item_comments')) return { rows: [{ id: 'comment-1', body: params[3], author_user_id: params[2] }] };
      if (sql.includes('INSERT INTO remediation_item_activity')) return { rows: [{ id: 'activity-1' }] };
      if (sql.includes('FROM remediation_items ri')) return { rows: [{ id: 'remediation-1', status: 'needs_review', title: 'Remediate: High risk issue', action: 'Fix it safely', severity: 'high', subject_name: 'alpha-ws-01', finding_instance_id: 'finding-instance-1', run_id: 'run-1', owner_name: 'Local Operator', due_date: '2026-07-01', evidence_artifact_type: 'pdf' }] };
      if (sql.includes('SELECT status, count(*)::int AS count FROM remediation_items')) return { rows: [{ status: 'needs_review', count: 2 }, { status: 'in_progress', count: 1 }] };
      if (sql.includes('UPDATE remediation_items SET status=')) return { rows: [{ id: params[2], status: params[0], title: 'Remediate: test' }] };
      if (sql.includes('SELECT id FROM remediation_items WHERE tenant_id=$1 AND id=$2')) return { rows: [{ id: params[1] }] };
      if (sql.includes('SELECT id, status, title FROM remediation_items WHERE tenant_id=$1 AND id=$2')) return { rows: [{ id: params[1], status: 'needs_review', title: 'Remediate: test' }] };
      if (sql.includes('UPDATE remediation_items SET') && sql.includes('RETURNING *')) return { rows: [{ id: params[1], status: 'needs_review', title: 'Remediate: test', due_date: '2026-07-01' }] };
      if (sql.includes('WHERE fi.tenant_id=$1 AND f.severity IN')) return { rows: [{ id: 'fi-1', title: 'Critical issue', severity: 'critical', remediation_status: 'needs_review', subject_name: 'alpha-ws-01' }] };
      if (sql.includes("WHERE ri.tenant_id = $1 AND ri.status = 'needs_review'")) return { rows: [{ id: 'remediation-1', status: 'needs_review', title: 'Remediate: High risk issue', severity: 'high', subject_name: 'alpha-ws-01', run_id: 'run-1' }] };
      if (sql.includes("WHERE r.tenant_id=$1 AND r.status='failed'")) return { rows: [{ id: 'run-failed', status: 'failed', subject_name: 'alpha-ws-01', findings_count: 0 }] };
      if (sql.includes("WHERE r.tenant_id=$1 AND r.status='completed'") && sql.includes('GROUP BY')) return { rows: [{ id: 'run-1', status: 'completed', subject_name: 'alpha-ws-01', findings_count: 3 }] };
      if (sql.includes('DELETE FROM targets')) return { rows: [] };
      rows.push({ sql, params }); return { rows: [] };
    }
  };
  const authCalls: { method: string; args: unknown[] }[] = [];
  const auth = {
    register: async (...args: unknown[]) => { authCalls.push({ method: 'register', args }); return { token: 'token-1', user: { id: 'user-1', email: args[1], display_name: args[0] } }; },
    login: async (...args: unknown[]) => { authCalls.push({ method: 'login', args }); return { token: 'token-1', user: { id: 'user-1', email: args[0], display_name: 'Local Operator' } }; },
  };
  const queue = {
    health: async () => ({ configured: false }),
    enqueue: async (queueName: string, payload: Record<string, unknown>) => {
      queueCalls.push({ queueName, payload });
      return { queued: true, queue: queueName === 'scan_jobs' ? QUEUES.scanJobs : QUEUES.artifactProcessing, payload };
    }
  };
  const artifacts = {
    createUpload: async (runId: string, artifactType: string) => ({ object_key: `runs/${runId}/file.${artifactType}`, storage_uri: `s3://bucket/runs/${runId}/file.${artifactType}`, upload_url: null }),
    storeWorkerArtifact: async (runId: string, artifactType: string) => ({ object_key: `runs/${runId}/handoff.${artifactType}`, storage_uri: `s3://bucket/runs/${runId}/handoff.${artifactType}` }),
    readArtifact: async () => { throw new Error('not implemented in test'); },
  };
  return { app: new AppController(db as never, auth as never, queue as never, artifacts as never), calls, queryRows: rows, queueCalls, authCalls };
}

test('one-time audit run endpoint returns job, run, and BullMQ queue envelope', async () => {
  const { app } = controller();
  const result = await app.runAudit('audit-1', { scanner_bundle_version: 'scanner-v1' });
  assert.equal(result.job.subject_type, 'one_time_audit');
  assert.equal(result.job.one_time_audit_id, 'audit-1');
  assert.equal(result.run.status, 'pending');
  assert.equal(result.queue.queued, true);
  assert.equal(result.queue.queue, QUEUES.scanJobs);
});

test('managed target scan-job endpoint enqueues worker-compatible payload', async () => {
  const { app, queueCalls } = controller();
  const result = await app.runTarget('target-1', { priority: 80 });
  assert.equal(result.job.subject_type, 'managed_target');
  assert.equal(result.job.target_id, 'target-1');
  assert.equal(result.job.one_time_audit_id, null);
  assert.equal(queueCalls[0].queueName, 'scan_jobs');
  assert.equal(queueCalls[0].payload.runId, 'run-1');
  assert.equal(queueCalls[0].payload.run_id, 'run-1');
  assert.equal(queueCalls[0].payload.jobId, 'job-1');
  assert.equal((queueCalls[0].payload.scannerOutput as Record<string, unknown>).contractVersion, scannerBundleContractVersion());
});

test('artifact upload init response exposes object key, storage uri, and upload url field', async () => {
  const { app } = controller();
  const result = await app.uploadInit({ run_id: 'run-1', artifact_type: 'json' });
  assert.equal(result.object_key, 'runs/run-1/file.json');
  assert.equal(result.storage_uri, 's3://bucket/runs/run-1/file.json');
  assert.equal(result.upload_url, null);
});

test('register endpoint creates local account through AuthService and sets session cookie', async () => {
  const { app, authCalls } = controller();
  const cookies: { name: string; value: string; options: Record<string, unknown> }[] = [];
  const result = await app.register(
    { name: 'Local Operator', email: 'operator@example.test', password: 'ChangeMe123!' },
    { cookie: (name: string, value: string, options: Record<string, unknown>) => cookies.push({ name, value, options }) } as never,
  );
  assert.equal(authCalls[0].method, 'register');
  assert.deepEqual(authCalls[0].args, ['Local Operator', 'operator@example.test', 'ChangeMe123!']);
  assert.equal(cookies[0].name, 'shore_session');
  assert.equal(cookies[0].value, 'token-1');
  assert.equal(result.user.email, 'operator@example.test');
});

test('login endpoint honors remember-me with a 30 day session cookie', async () => {
  const { app, authCalls } = controller();
  const cookies: { name: string; value: string; options: Record<string, unknown> }[] = [];
  const result = await app.login(
    { email: 'operator@example.test', password: 'ChangeMe123!', rememberMe: true },
    { cookie: (name: string, value: string, options: Record<string, unknown>) => cookies.push({ name, value, options }) } as never,
  );

  assert.equal(authCalls[0].method, 'login');
  assert.deepEqual(authCalls[0].args, ['operator@example.test', 'ChangeMe123!', true]);
  assert.equal(cookies[0].name, 'shore_session');
  assert.equal(cookies[0].value, 'token-1');
  assert.equal(cookies[0].options.maxAge, 1000 * 60 * 60 * 24 * 30);
  assert.equal(result.user.email, 'operator@example.test');
});

test('worker artifact handoff accepts canonical shared artifact kinds', async () => {
  const { app, queueCalls } = controller();
  const result = await app.workerArtifact({
    runId: 'run-1',
    kind: ARTIFACT_KIND.scannerRawOutput,
    contentType: 'application/json',
    bodyBase64: Buffer.from(JSON.stringify({ ok: true })).toString('base64'),
  });
  assert.equal(result.artifact_type, ARTIFACT_KIND.scannerRawOutput);
  assert.equal(queueCalls[0].queueName, 'artifact_processing');
  assert.equal(queueCalls[0].payload.artifactType, ARTIFACT_KIND.scannerRawOutput);
});

test('normalized findings artifact populates dashboard finding tables', async () => {
  const { app, calls } = controller();
  await app.workerArtifact({
    runId: 'run-1',
    kind: ARTIFACT_KIND.normalizedFindings,
    contentType: 'application/json',
    bodyBase64: Buffer.from(JSON.stringify([
      { id: 'check-high', title: 'High risk issue', severity: 'high', category: 'agent-security', description: 'Evidence summary', remediation: { file_path: '/app/AGENTS.md', instruction: 'Fix it safely' } },
      { id: 'check-moderate', title: 'Moderate issue', severity: 'moderate', category: 'agent-security' },
    ])).toString('base64'),
  });

  assert.equal(calls.some((sql) => sql.includes('INSERT INTO findings')), true);
  assert.equal(calls.some((sql) => sql.includes('INSERT INTO finding_instances')), true);
  assert.equal(calls.some((sql) => sql.includes('DELETE FROM finding_instances')), true);
  const remediationInsert = calls.find((sql) => sql.includes('INSERT INTO remediation_items'));
  assert.ok(remediationInsert, 'expected remediation insert for object remediation');
});

test('dashboard metrics aggregate live findings by severity', async () => {
  const { app } = controller();
  const result = await app.dashboardMetrics();
  assert.deepEqual(result.severityCounts, { critical: 0, high: 2, medium: 1, low: 0, informational: 0 });
  assert.equal(result.totalFindings, 3);
});

test('dashboard trends expose severity history, risk score, finding movement, and posture benchmark', async () => {
  const { app } = controller();
  const result = await app.dashboardTrends();
  assert.equal(result.severityTrends.length, 2);
  assert.equal(result.severityTrends[0].high, 1);
  assert.equal(result.riskScoreHistory[0].risk_score, 77);
  assert.deepEqual(result.findingMovement, { newFindings: 3, fixedFindings: 1, openFindings: 2 });
  assert.equal(result.postureBenchmark.targetScore, 90);
  assert.equal(result.postureBenchmark.status, 'watch');
});

test('scan runs endpoint returns recent scans with artifacts and finding counts', async () => {
  const { app } = controller();
  const result = await app.scanRuns();
  assert.equal(result[0].id, 'run-1');
  assert.equal(result[0].findings_count, 3);
  assert.equal(result[0].artifacts[0].artifact_type, 'pdf');
});

test('findings endpoint returns actionable findings with remediation guidance', async () => {
  const { app } = controller();
  const result = await app.findings();
  assert.equal(result[0].severity, 'high');
  assert.equal(result[0].remediation_action, 'Fix it');
});

test('managed target update endpoint persists editable machine fields', async () => {
  const { app, calls } = controller();
  const result = await app.updateTarget('target-1', {
    hostname: 'alpha-ws-01',
    fqdn: 'alpha-ws-01.example.test',
    owner_team: 'Desktop Engineering',
    platform: 'windows',
    connection_mode: 'pull_checkin',
  });

  assert.equal(result.id, 'target-1');
  assert.equal(result.hostname, 'alpha-ws-01');
  assert.equal(calls.some((sql) => sql.includes('UPDATE targets SET')), true);
});

test('managed target delete endpoint removes dependent scan data before deleting the machine', async () => {
  const { app, calls } = controller();
  const result = await app.deleteTarget('target-1');

  assert.equal(result.deleted, true);
  assert.deepEqual(result.affected, { runs: 0, jobs: 0, scheduled_target: 'alpha-ws-01' });
  assert.equal(calls.some((sql) => sql.includes('DELETE FROM scan_jobs')), true);
  assert.equal(calls.some((sql) => sql.includes('DELETE FROM targets')), true);
});

test('managed target scan run endpoint returns the live run history with artifacts', async () => {
  const { app } = controller();
  const result = await app.targetScanRuns('target-1');

  assert.ok(Array.isArray(result.runs));
  assert.equal(result.runs[0].id, 'run-1');
  assert.equal(result.runs[0].artifacts[0].artifact_type, ARTIFACT_KIND.scannerRawOutput);
});

test('remediations endpoint returns workflow items with status and finding context', async () => {
  const { app } = controller();
  const result = await app.remediations();
  assert.equal(result.length, 1);
  assert.equal(result[0].id, 'remediation-1');
  assert.equal(result[0].status, 'needs_review');
  assert.equal(result[0].severity, 'high');
  assert.equal(result[0].subject_name, 'alpha-ws-01');
});

test('remediations endpoint filters by status query param', async () => {
  const { app, calls } = controller();
  await app.remediations('in_progress');
  const filterQuery = calls.find((sql) => sql.includes('FROM remediation_items ri') && sql.includes('AND ri.status = $2'));
  assert.ok(filterQuery, 'expected status filter clause');
});

test('status counts endpoint aggregates by workflow status', async () => {
  const { app } = controller();
  const result = await app.remediationStatusCounts();
  assert.equal(result.needs_review, 2);
  assert.equal(result.in_progress, 1);
  assert.equal(result.fixed, 0);
  assert.equal(result.accepted_risk, 0);
});

test('GET remediation detail returns assignment, evidence, comments, and activity history', async () => {
  const { app } = controller();
  const result: any = await app.remediation('remediation-1');
  assert.equal(result.id, 'remediation-1');
  assert.equal(result.owner_name, 'Local Operator');
  assert.equal(result.due_date, '2026-07-01');
  assert.equal(result.comments[0].body, 'Assigned to local operator');
  assert.equal(result.activity[0].event_type, 'remediation.status_changed');
});


test('PATCH remediation item updates assignment and due date', async () => {
  const { app, calls } = controller();
  const result = await app.updateRemediation('remediation-1', { owner_user_id: 'user-1', due_date: '2026-07-01' });
  assert.equal(result.id, 'remediation-1');
  assert.equal(calls.some((sql) => sql.includes('UPDATE remediation_items SET') && sql.includes('owner_user_id = $3')), true);
  assert.equal(calls.some((sql) => sql.includes('INSERT INTO remediation_item_activity')), true);
});

test('POST remediation comment appends comment and activity entry', async () => {
  const { app, calls } = controller();
  const result = await app.addRemediationComment('remediation-1', { comment: 'Ready for review', author_user_id: 'user-1' });
  assert.equal(result.body, 'Ready for review');
  assert.equal(calls.some((sql) => sql.includes('INSERT INTO remediation_item_comments')), true);
  assert.equal(calls.some((sql) => sql.includes('INSERT INTO remediation_item_activity')), true);
});

test('GET remediation comments and activity endpoints expose timeline records', async () => {
  const { app } = controller();
  const comments = await app.remediationComments('remediation-1');
  const activity = await app.remediationActivity('remediation-1');
  assert.equal(comments.comments[0].author_name, 'Local Operator');
  assert.equal(activity.activity[0].actor_name, 'System');
});

test('PATCH remediation status transitions records audit log', async () => {
  const { app, calls } = controller();
  const result = await app.updateRemediationStatus('remediation-1', { status: 'in_progress' });
  assert.equal(result.status, 'in_progress');
  const updateCall = calls.find((sql) => sql.includes('UPDATE remediation_items SET status='));
  const auditCall = calls.filter((sql) => sql.includes('INSERT INTO audit_log')).pop();
  assert.ok(updateCall, 'expected status update query');
  assert.ok(auditCall, 'expected audit log insert');
});

test('PATCH remediation status rejects invalid values', async () => {
  const { app } = controller();
  await assert.rejects(
    () => app.updateRemediationStatus('remediation-1', { status: 'deleted' }),
    (err: unknown) => err instanceof BadRequestException && /invalid status/.test((err as Error).message),
  );
});

test('PATCH remediation status creates needs_review items from scanner findings', async () => {
  const { app, calls } = controller();
  await app.workerArtifact({
    runId: 'run-1',
    kind: ARTIFACT_KIND.normalizedFindings,
    contentType: 'application/json',
    bodyBase64: Buffer.from(JSON.stringify([
      { id: 'check-new', title: 'New finding', severity: 'medium', remediation: { instruction: 'Patch it' } },
    ])).toString('base64'),
  });
  const remediationInsert = calls.find((sql) => sql.includes('INSERT INTO remediation_items'));
  assert.ok(remediationInsert, 'expected remediation insert for new finding');
});

test('findings endpoint exposes remediation_status for list filtering', async () => {
  const { app } = controller();
  const result = await app.findings();
  assert.ok('remediation_status' in result[0], 'findings row should include remediation_status');
});

test('scan run findings endpoint returns findings with remediation for a specific run', async () => {
  const { app } = controller();
  const result = await app.runFindings('run-1');
  assert.ok(Array.isArray(result.findings));
  assert.equal(result.findings.length, 1);
  assert.equal(result.findings[0].finding_instance_id, 'finding-instance-1');
  assert.equal(result.findings[0].severity, 'high');
  assert.equal(result.findings[0].remediation_id, 'remediation-1');
  assert.equal(result.findings[0].remediation_status, 'needs_review');
});

test('scan run findings endpoint returns empty array for run with no findings', async () => {
  const { app } = controller();
  const result = await app.runFindings('run-empty');
  assert.ok(Array.isArray(result.findings));
  assert.equal(result.findings.length, 0);
});

test('scan run findings endpoint rejects unknown run id', async () => {
  const { app } = controller();
  await assert.rejects(
    () => app.runFindings('nonexistent-run'),
    (err: unknown) => err instanceof BadRequestException && /scan run not found/.test((err as Error).message),
  );
});

test('saved-views endpoint seeds four preset operational views on first call', async () => {
  const { app, calls } = controller();
  const result = await app.listSavedViews();
  assert.equal(result.length, 4);
  assert.equal(result[0].slug, 'high-findings');
  assert.equal(result[1].slug, 'unreviewed-remediation');
  assert.equal(result[2].slug, 'failed-scans');
  assert.equal(result[3].slug, 'recently-completed');
  assert.equal(calls.some((sql) => sql.includes('INSERT INTO saved_views')), true);
});

test('saved-views data endpoint resolves high findings with severity filter', async () => {
  const { app } = controller();
  const result = await app.getSavedViewData('high-findings');
  assert.equal(result.view_type, 'high_findings');
  assert.equal(result.total, 1);
  const sev = String(result.items[0].severity).toLowerCase();
  assert.ok(sev === 'critical' || sev === 'high', `expected critical or high, got ${sev}`);
});

test('saved-views data endpoint resolves unremediation view', async () => {
  const { app } = controller();
  const result = await app.getSavedViewData('unreviewed-remediation');
  assert.equal(result.view_type, 'unreviewed_remediation');
  assert.equal(result.total, 1);
  assert.equal(result.items[0].status, 'needs_review');
});

test('saved-views data endpoint resolves failed scans view', async () => {
  const { app } = controller();
  const result = await app.getSavedViewData('failed-scans');
  assert.equal(result.view_type, 'failed_scans');
  assert.equal(result.total, 1);
  assert.equal(result.items[0].status, 'failed');
});

test('saved-views data endpoint resolves recently completed scans view', async () => {
  const { app } = controller();
  const result = await app.getSavedViewData('recently-completed');
  assert.equal(result.view_type, 'recently_completed');
  assert.equal(result.total, 1);
  assert.equal(result.items[0].status, 'completed');
});

test('saved-views get by slug returns preset metadata', async () => {
  const { app } = controller();
  const result = await app.getSavedView('high-findings');
  assert.equal(result.title, 'High findings');
  assert.equal(result.view_type, 'high_findings');
});

test('saved-views rejects unknown slug data request', async () => {
  const { app } = controller();
  await assert.rejects(
    () => app.getSavedViewData('totally-unknown'),
    (err: unknown) => err instanceof BadRequestException && /unknown saved view/.test((err as Error).message),
  );
});

test('saved-views create endpoint persists custom view', async () => {
  const { app, calls } = controller();
  const result = await app.createSavedView({ slug: 'custom-view', title: 'My custom view', view_type: 'high_findings', filters: { severity: 'medium' }, sort_by: 'date' });
  assert.equal(result.slug, 'custom-view');
  assert.equal(result.title, 'My custom view');
  assert.equal(calls.some((sql) => sql.includes('INSERT INTO saved_views')), true);
});

test('saved-views create rejects invalid view_type', async () => {
  const { app } = controller();
  await assert.rejects(
    () => app.createSavedView({ slug: 'bad', title: 'Bad', view_type: 'nonsense' }),
    (err: unknown) => err instanceof BadRequestException,
  );
});

test('saved-views delete rejects preset removal', async () => {
  const { app } = controller();
  await assert.rejects(
    () => app.deleteSavedView('high-findings'),
    (err: unknown) => err instanceof BadRequestException && /cannot delete preset/.test((err as Error).message),
  );
});

test('saved-views delete allows custom view removal', async () => {
  const { app } = controller();
  const result = await app.deleteSavedView('some-custom');
  assert.equal(result.deleted, true);
});
