'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { appPath, routePath } from '@/lib/paths';

const FINAL_STATUSES = new Set(['succeeded', 'completed', 'failed', 'cancelled']);
const STATUS_PROGRESS = {
  queued: 0,
  claimed: 10,
  running: 25,
  parsing: 55,
  artifact_uploading: 80,
  retrying: 90,
  succeeded: 100,
  completed: 100,
  failed: 100,
  cancelled: 100,
};

function toReadableTime(value) {
  if (!value) return 'Not available';
  return new Date(value).toLocaleString();
}

function toElapsedSeconds(value) {
  if (!value) return null;
  const started = new Date(value).getTime();
  if (Number.isNaN(started)) return null;
  return Math.max(0, Math.round((Date.now() - started) / 1000));
}

function formatDuration(seconds) {
  if (!Number.isFinite(seconds) || seconds == null) return 'Calculating…';
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  return `${minutes}m ${remaining.toString().padStart(2, '0')}s`;
}

function deriveProgress(run) {
  if (!run) return 0;
  if (typeof run.latest_progress_percent === 'number') return run.latest_progress_percent;
  if (typeof run.progress_percent === 'number') return run.progress_percent;
  return STATUS_PROGRESS[run.status] ?? 0;
}

function deriveProgressMessage(run) {
  return run?.latest_event_message || run?.latest_event_type || run?.status || 'Idle';
}

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function humanize(value, fallback = 'Not available') {
  if (value == null || value === '') return fallback;
  return String(value).replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function remediationGuidance(item) {
  return item.instructions
    || item.action
    || item.guidance
    || item.evidence_summary
    || 'Review the finding evidence, validate the affected control, and apply the recommended hardening change.';
}

export function MachineDetailClient({ machine, initialRuns = [], canManage = false }) {
  const router = useRouter();
  const [runs, setRuns] = useState(() => ensureArray(initialRuns));
  const [activeRunId, setActiveRunId] = useState(() => ensureArray(initialRuns).find((run) => !FINAL_STATUSES.has(run.status))?.id ?? null);
  const [notice, setNotice] = useState('');
  const [scanBusy, setScanBusy] = useState(false);
  const [saveBusy, setSaveBusy] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteStatus, setDeleteStatus] = useState('');
  const [adminCanManage, setAdminCanManage] = useState(Boolean(canManage));
  const [permissionStatus, setPermissionStatus] = useState(canManage ? 'Admin permissions confirmed.' : 'Checking admin permissions…');
  const [draft, setDraft] = useState(() => ({
    hostname: machine.name ?? '',
    fqdn: machine.fqdn ?? '',
    ip_address: machine.ip_address ?? '',
    owner_team: machine.owner ?? '',
    platform: machine.platform ?? 'windows',
    connection_mode: machine.connection_mode ?? 'ssh_push',
    monitoring_enabled: Boolean(machine.monitoring_enabled ?? true),
  }));

  useEffect(() => {
    setRuns(ensureArray(initialRuns));
    setActiveRunId(ensureArray(initialRuns).find((run) => !FINAL_STATUSES.has(run.status))?.id ?? null);
  }, [initialRuns]);

  useEffect(() => {
    setAdminCanManage(Boolean(canManage));
  }, [canManage]);

  useEffect(() => {
    let cancelled = false;
    const refreshCurrentUser = async () => {
      try {
        const response = await fetch(appPath('/api/auth/me'), { cache: 'no-store', credentials: 'same-origin' });
        if (!response.ok) {
          if (!cancelled) setPermissionStatus('Sign in as an admin to enable deletion.');
          return;
        }
        const user = await response.json();
        const roles = Array.isArray(user?.roles) ? user.roles.map((role) => String(role).toLowerCase()) : [];
        const isAdmin = roles.includes('admin');
        if (!cancelled) {
          setAdminCanManage(isAdmin);
          setPermissionStatus(isAdmin ? 'Admin permissions confirmed.' : `Signed in as ${roles.join(', ') || 'non-admin'}; deletion is disabled.`);
        }
      } catch {
        // leave server-provided permission state unchanged
      }
    };
    refreshCurrentUser();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setDraft({
      hostname: machine.name ?? '',
      fqdn: machine.fqdn ?? '',
      ip_address: machine.ip_address ?? '',
      owner_team: machine.owner ?? '',
      platform: machine.platform ?? 'windows',
      connection_mode: machine.connection_mode ?? 'ssh_push',
      monitoring_enabled: Boolean(machine.monitoring_enabled ?? true),
    });
  }, [machine]);

  useEffect(() => {
    if (!activeRunId) return undefined;
    let cancelled = false;
    const refresh = async () => {
      try {
        const [runResponse, eventsResponse, artifactsResponse] = await Promise.all([
          fetch(appPath(`/api/scan-runs/${activeRunId}`), { cache: 'no-store', credentials: 'same-origin' }),
          fetch(appPath(`/api/scan-runs/${activeRunId}/events`), { cache: 'no-store', credentials: 'same-origin' }),
          fetch(appPath(`/api/scan-runs/${activeRunId}/artifacts`), { cache: 'no-store', credentials: 'same-origin' }),
        ]);
        if (!runResponse.ok) return;
        const run = await runResponse.json();
        const eventsPayload = eventsResponse.ok ? await eventsResponse.json() : { events: [] };
        const artifactsPayload = artifactsResponse.ok ? await artifactsResponse.json() : { artifacts: [] };
        const nextRun = {
          ...run,
          events: ensureArray(eventsPayload.events),
          artifacts: ensureArray(artifactsPayload.artifacts),
          latest_event_type: ensureArray(eventsPayload.events).at(-1)?.event_type ?? run.latest_event_type,
          latest_event_message: ensureArray(eventsPayload.events).at(-1)?.message ?? run.latest_event_message,
          latest_progress_percent: ensureArray(eventsPayload.events).at(-1)?.progress_percent ?? run.latest_progress_percent,
        };
        if (cancelled) return;
        setRuns((current) => {
          const remainder = current.filter((item) => item.id !== nextRun.id);
          return [nextRun, ...remainder].sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
        });
        if (FINAL_STATUSES.has(nextRun.status)) setActiveRunId(null);
      } catch {
        // keep the previous live state; the next tick will retry
      }
    };

    refresh();
    const timer = setInterval(refresh, 3000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [activeRunId]);

  const currentRun = useMemo(() => runs.find((run) => run.id === activeRunId) ?? runs.find((run) => !FINAL_STATUSES.has(run.status)) ?? runs[0] ?? null, [activeRunId, runs]);
  const currentProgress = deriveProgress(currentRun);
  const currentEta = (() => {
    if (!currentRun || currentProgress <= 0 || currentProgress >= 100) return null;
    const elapsed = toElapsedSeconds(currentRun.started_at || currentRun.created_at);
    if (!elapsed || elapsed <= 0) return null;
    return Math.ceil((elapsed * (100 - currentProgress)) / currentProgress);
  })();

  async function runScan() {
    setScanBusy(true);
    setNotice('');
    try {
      const response = await fetch(appPath(`/api/targets/${machine.id}/scan-jobs`), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ mode: machine.connection_mode ?? 'ssh_push' }),
      });
      if (!response.ok) throw new Error('Scan launch failed');
      const payload = await response.json();
      if (payload?.run?.id) {
        setRuns((current) => {
          const nextRun = {
            ...payload.run,
            artifacts: [],
            events: [{ event_type: 'job.queued', message: 'Scan job queued', progress_percent: 0 }],
            latest_event_type: 'job.queued',
            latest_event_message: 'Scan job queued',
            latest_progress_percent: 0,
          };
          const remainder = current.filter((item) => item.id !== nextRun.id);
          return [nextRun, ...remainder].sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
        });
        setActiveRunId(payload.run.id);
      }
      setNotice('Scan launched. Live progress is now streaming.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Unable to launch scan.');
    } finally {
      setScanBusy(false);
    }
  }

  function updateField(field, value) {
    setDraft((current) => ({ ...current, [field]: value }));
  }

  async function saveMachine(event) {
    event.preventDefault();
    setSaveBusy(true);
    setNotice('');
    try {
      const response = await fetch(appPath(`/api/targets/${machine.id}`), {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(draft),
      });
      if (!response.ok) throw new Error('Unable to save machine details.');
      const updated = await response.json();
      setDraft({
        hostname: updated.hostname ?? '',
        fqdn: updated.fqdn ?? '',
        ip_address: updated.ip_address ?? '',
        owner_team: updated.owner_team ?? '',
        platform: updated.platform ?? 'windows',
        connection_mode: updated.connection_mode ?? 'ssh_push',
        monitoring_enabled: Boolean(updated.monitoring_enabled ?? true),
      });
      setNotice('Machine details saved.');
      router.refresh();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Unable to save machine details.');
    } finally {
      setSaveBusy(false);
    }
  }

  async function deleteMachine() {
    if (!adminCanManage) {
      setDeleteStatus('Deletion is disabled because admin permissions are not confirmed. Sign out and sign back in with an admin account.');
      return;
    }
    if (!window.confirm(`Delete ${machine.name}? This removes the machine and related scan history.`)) {
      setDeleteStatus('Delete cancelled.');
      return;
    }
    setDeleteBusy(true);
    setNotice('');
    setDeleteStatus('Deleting managed machine…');
    try {
      const response = await fetch(appPath(`/api/targets/${machine.id}`), { method: 'DELETE', credentials: 'same-origin' });
      if (!response.ok) {
        const errorPayload = await response.json().catch(() => ({}));
        throw new Error(errorPayload.message || `Delete failed with HTTP ${response.status}`);
      }
      setDeleteStatus('Managed machine deleted. Returning to inventory…');
      router.replace(routePath('/inventory'));
      router.refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to delete machine.';
      setNotice(message);
      setDeleteStatus(message);
      setDeleteBusy(false);
    }
  }

  const completedRuns = runs.filter((run) => FINAL_STATUSES.has(run.status) || run.latest_event_type === 'job.succeeded');
  const remediationItems = ensureArray(machine.remediations);
  const hasActiveRun = runs.some((run) => !FINAL_STATUSES.has(run.status));
  const activeStatus = currentRun ? deriveProgressMessage(currentRun) : 'Ready for a new scan';
  const lastScanAt = machine.last_successful_scan_at
    || completedRuns[0]?.completed_at
    || completedRuns[0]?.updated_at
    || completedRuns[0]?.created_at;
  const openRemediationCount = Number(machine.remediation_count || remediationItems.length || 0);
  const scanButtonLabel = scanBusy ? 'Launching scan…' : hasActiveRun ? 'Scan in progress' : 'Scan machine';

  return (
    <div className="machine-dossier">
      <section className="machine-dossier-header panel">
        <div className="machine-identity">
          <p className="eye">Managed machine</p>
          <h1>{machine.name}</h1>
          <p>{machine.summary}</p>
        </div>
        <div className="machine-header-actions">
          <span className={`pill ${String(machine.status).toLowerCase() === 'online' ? 'green' : ''}`}>
            {humanize(machine.status)}
          </span>
          <button className="btn machine-scan-action" type="button" onClick={runScan} disabled={scanBusy || hasActiveRun}>
            {scanButtonLabel}
          </button>
        </div>
        {notice ? <p className="machine-action-notice" role="status" aria-live="polite">{notice}</p> : <span className="sr-only" aria-live="polite" />}
      </section>

      <dl className="machine-summary-strip" aria-label="Machine operational summary">
        <div><dt>Environment</dt><dd>{machine.env || 'Unassigned'}</dd></div>
        <div><dt>Owner</dt><dd>{machine.owner || 'Unassigned'}</dd></div>
        <div><dt>Connection</dt><dd>{humanize(machine.connection_mode)}</dd></div>
        <div><dt>Findings</dt><dd>{Number(machine.finding_count || 0)}</dd></div>
        <div><dt>Open remediation</dt><dd>{openRemediationCount}</dd></div>
        <div><dt>Last scan</dt><dd>{toReadableTime(lastScanAt)}</dd></div>
      </dl>

      <section className="machine-progress-band panel" aria-labelledby="machine-progress-title">
        <div className="machine-section-heading">
          <div>
            <p className="section-kicker">Current activity</p>
            <h2 id="machine-progress-title">{hasActiveRun ? 'Scan in progress' : currentRun ? 'Latest scan' : 'Scan readiness'}</h2>
          </div>
          {currentRun ? <span className={`pill ${FINAL_STATUSES.has(currentRun.status) ? 'green' : 'amber'}`}>{humanize(currentRun.status)}</span> : null}
        </div>
        <div className="machine-progress-line">
          <div className="progress-shell" role="progressbar" aria-label="Scan progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow={currentProgress}>
            <div className="progress-fill" style={{ width: `${currentProgress}%` }} />
          </div>
          <strong>{currentProgress}%</strong>
        </div>
        <div className="machine-progress-meta">
          <span>{activeStatus}</span>
          <span>Started {toReadableTime(currentRun?.started_at || currentRun?.created_at)}</span>
          {hasActiveRun ? <span>ETA {currentEta == null ? 'Calculating…' : formatDuration(currentEta)}</span> : null}
        </div>
      </section>

      <section className="machine-section panel" aria-labelledby="machine-remediation-title">
        <div className="machine-section-heading">
          <div><p className="section-kicker">Prioritized work</p><h2 id="machine-remediation-title">Remediation</h2></div>
          <span className="pill">{openRemediationCount} open</span>
        </div>
        {remediationItems.length ? (
          <div className="machine-remediation-list">
            {remediationItems.map((item) => (
              <details className="machine-remediation-item" key={item.id}>
                <summary>
                  <span className="machine-remediation-title"><b>{item.title}</b><small>{humanize(item.status, 'Open')}</small></span>
                  <span className="machine-remediation-meta">
                    <span className={`pill severity-${String(item.severity || 'informational').toLowerCase()}`}>{humanize(item.severity, 'Informational')}</span>
                    <span className="machine-expand-label"><span>Expand details</span><span>Hide details</span></span>
                  </span>
                </summary>
                <div className="machine-remediation-detail">
                  <div><span>Recommended action</span><p>{remediationGuidance(item)}</p></div>
                  <Link className="btn alt" prefetch={false} href={routePath(`/remediation/${item.id}`)}>Open full record</Link>
                </div>
              </details>
            ))}
          </div>
        ) : (
          <div className="machine-compact-empty"><p>No remediation is currently open for this machine.</p><span>Run a new scan to refresh its security posture.</span></div>
        )}
      </section>

      <section className="machine-section panel" aria-labelledby="machine-reports-title">
        <div className="machine-section-heading">
          <div><p className="section-kicker">Evidence history</p><h2 id="machine-reports-title">Recent reports</h2></div>
          <span className="pill">{completedRuns.length}</span>
        </div>
        {completedRuns.length ? (
          <div className="machine-report-list">
            {completedRuns.map((run) => (
              <article className="machine-report-row" key={run.id}>
                <div><b>{run.subject_type === 'managed_target' ? 'Managed machine scan' : 'Security report'}</b><small>{toReadableTime(run.completed_at || run.updated_at || run.created_at)}</small></div>
                <div className="machine-report-meta">
                  <span className="pill green">{humanize(run.status)}</span>
                  <span>{ensureArray(run.artifacts).length} artifact{ensureArray(run.artifacts).length === 1 ? '' : 's'}</span>
                  <Link className="machine-report-link" prefetch={false} href={routePath(`/scans-reports/reports/${run.id}`)}>Open report</Link>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="machine-compact-empty"><p>No reports have been generated for this machine yet.</p><button className="btn alt" type="button" onClick={runScan} disabled={scanBusy || hasActiveRun}>Run first scan</button></div>
        )}
      </section>

      {adminCanManage ? (
        <details className="machine-admin-disclosure">
          <summary className="machine-admin-summary"><span><b>Machine settings</b><small>Edit identity, ownership, connection, and monitoring.</small></span><span>Expand settings</span></summary>
          <div className="machine-admin-body auth-form">
            <form onSubmit={saveMachine}>
              <label>Hostname<input name="hostname" value={draft.hostname} onChange={(event) => updateField('hostname', event.target.value)} required /></label>
              <label>FQDN<input name="fqdn" value={draft.fqdn} onChange={(event) => updateField('fqdn', event.target.value)} /></label>
              <label>IP address<input name="ip_address" value={draft.ip_address} onChange={(event) => updateField('ip_address', event.target.value)} /></label>
              <label>Owner team<input name="owner_team" value={draft.owner_team} onChange={(event) => updateField('owner_team', event.target.value)} /></label>
              <label>Platform<select name="platform" value={draft.platform} onChange={(event) => updateField('platform', event.target.value)}><option value="windows">Windows</option><option value="linux">Linux</option><option value="macos">macOS</option></select></label>
              <label>Connection mode<select name="connection_mode" value={draft.connection_mode} onChange={(event) => updateField('connection_mode', event.target.value)}><option value="ssh_push">SSH push</option><option value="pull_checkin">Pull check-in</option><option value="both">Both</option></select></label>
              <label className="remember-me"><input name="monitoring_enabled" type="checkbox" checked={draft.monitoring_enabled} onChange={(event) => updateField('monitoring_enabled', event.target.checked)} /><span>Monitoring enabled</span></label>
              <div className="actions-row"><button className="btn" type="submit" disabled={saveBusy}>{saveBusy ? 'Saving…' : 'Save changes'}</button></div>
            </form>
          </div>
        </details>
      ) : null}

      <details className="machine-admin-disclosure danger-zone">
        <summary className="machine-admin-summary"><span><b>Danger zone</b><small>Permanent machine removal and scan-history deletion.</small></span><span>Expand controls</span></summary>
        <div className="machine-admin-body">
          <p>Delete this managed machine and its related scan history. This cannot be undone.</p>
          <p className="note">{permissionStatus}</p>
          {deleteStatus ? <p className="note">{deleteStatus}</p> : null}
          <button className="btn danger" type="button" onClick={deleteMachine} disabled={!adminCanManage || deleteBusy}>{deleteBusy ? 'Deleting managed machine…' : 'Delete managed machine'}</button>
        </div>
      </details>
    </div>
  );
}
