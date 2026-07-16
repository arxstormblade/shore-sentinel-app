'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { appPath, routePath } from '@/lib/paths';
import { isSuccessfulRun, isTerminalRun, progressForRun, toneForRun } from '@/lib/machine-run-status';
import { openRemediationCount, openRemediationItems, scanLaunchBlocked } from '@/lib/machine-detail-data';

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
    || 'Detailed guidance is unavailable in this summary. Open the full record to review the finding and recommended action.';
}

export function MachineDetailClient({ machine, initialRuns = [], canScan = false, canEdit = false, canDelete = false, runHistoryUnavailable = false }) {
  const router = useRouter();
  const [runs, setRuns] = useState(() => ensureArray(initialRuns));
  const [activeRunId, setActiveRunId] = useState(() => ensureArray(initialRuns).find((run) => !isTerminalRun(run))?.id ?? null);
  const [notice, setNotice] = useState('');
  const [scanBusy, setScanBusy] = useState(false);
  const [saveBusy, setSaveBusy] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteStatus, setDeleteStatus] = useState('');
  const [permissions, setPermissions] = useState({ scan: Boolean(canScan), edit: Boolean(canEdit), delete: Boolean(canDelete) });
  const [permissionStatus, setPermissionStatus] = useState(canDelete ? 'Admin permissions confirmed.' : 'Checking permissions…');
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
    setActiveRunId(ensureArray(initialRuns).find((run) => !isTerminalRun(run))?.id ?? null);
  }, [initialRuns]);

  useEffect(() => {
    setPermissions({ scan: Boolean(canScan), edit: Boolean(canEdit), delete: Boolean(canDelete) });
  }, [canScan, canEdit, canDelete]);

  useEffect(() => {
    let cancelled = false;
    const refreshCurrentUser = async () => {
      try {
        const response = await fetch(appPath('/api/auth/me'), { cache: 'no-store', credentials: 'same-origin' });
        if (!response.ok) {
          if (!cancelled) {
            setPermissions({ scan: false, edit: false, delete: false });
            setPermissionStatus('Sign in with an authorized account to manage this machine.');
          }
          return;
        }
        const user = await response.json();
        const roles = Array.isArray(user?.roles) ? user.roles.map((role) => String(role).toLowerCase()) : [];
        const nextPermissions = {
          scan: roles.some((role) => ['admin', 'operator', 'analyst'].includes(role)),
          edit: roles.some((role) => ['admin', 'operator'].includes(role)),
          delete: roles.includes('admin'),
        };
        if (!cancelled) {
          setPermissions(nextPermissions);
          setPermissionStatus(nextPermissions.delete ? 'Admin permissions confirmed.' : `Signed in as ${roles.join(', ') || 'non-admin'}; deletion is disabled.`);
        }
      } catch {
        // Leave the server-provided permission state unchanged if the refresh is unavailable.
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
    let timer = null;
    let controller = null;
    let consecutiveFailures = 0;

    const refresh = async () => {
      controller = new AbortController();
      try {
        const requestOptions = { cache: 'no-store', credentials: 'same-origin', signal: controller.signal };
        const [runResponse, eventsResponse, artifactsResponse] = await Promise.all([
          fetch(appPath(`/api/scan-runs/${activeRunId}`), requestOptions),
          fetch(appPath(`/api/scan-runs/${activeRunId}/events`), requestOptions),
          fetch(appPath(`/api/scan-runs/${activeRunId}/artifacts`), requestOptions),
        ]);
        if (!runResponse.ok) throw new Error(`Scan status request failed with HTTP ${runResponse.status}`);
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
        consecutiveFailures = 0;
        setRuns((current) => {
          const remainder = current.filter((item) => item.id !== nextRun.id);
          return [nextRun, ...remainder].sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
        });
        if (isTerminalRun(nextRun)) {
          setActiveRunId(null);
          return;
        }
      } catch (error) {
        if (cancelled || error?.name === 'AbortError') return;
        consecutiveFailures += 1;
        if (consecutiveFailures >= 3) {
          setNotice('Live scan updates are temporarily unavailable. The active scan remains locked to prevent a duplicate launch.');
        }
      }
      if (!cancelled) timer = setTimeout(refresh, 3000);
    };

    refresh();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      controller?.abort();
    };
  }, [activeRunId]);

  const currentRun = useMemo(() => runs.find((run) => run.id === activeRunId) ?? runs.find((run) => !isTerminalRun(run)) ?? runs[0] ?? null, [activeRunId, runs]);
  const currentProgress = progressForRun(currentRun);
  const currentEta = (() => {
    if (!currentRun || currentProgress <= 0 || currentProgress >= 100) return null;
    const elapsed = toElapsedSeconds(currentRun.started_at || currentRun.created_at);
    if (!elapsed || elapsed <= 0) return null;
    return Math.ceil((elapsed * (100 - currentProgress)) / currentProgress);
  })();

  async function runScan() {
    if (!permissions.scan) {
      setNotice('Your role does not permit launching managed-machine scans.');
      return;
    }
    if (runHistoryUnavailable) {
      setNotice('Live scan history is unavailable. Scan launch remains disabled to prevent duplicate jobs.');
      return;
    }
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
      if (!payload?.run?.id) throw new Error('Scan service returned an invalid launch response.');
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
    if (!permissions.edit) {
      setNotice('Your role does not permit editing managed machines.');
      return;
    }
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
    if (!permissions.delete) {
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

  const completedRuns = runs.filter(isSuccessfulRun);
  const remediationItems = openRemediationItems(machine.remediations);
  const hasActiveRun = runs.some((run) => !isTerminalRun(run));
  const scanBlocked = !permissions.scan || scanLaunchBlocked(runs, runHistoryUnavailable);
  const activeStatus = currentRun ? deriveProgressMessage(currentRun) : 'Ready for a new scan';
  const lastScanAt = machine.last_successful_scan_at
    || completedRuns[0]?.completed_at
    || completedRuns[0]?.updated_at
    || completedRuns[0]?.created_at;
  const remediationOpenCount = openRemediationCount(machine.remediation_count, machine.remediations);
  const scanButtonLabel = scanBusy
    ? 'Launching scan…'
    : runHistoryUnavailable
      ? 'Scan status unavailable'
      : hasActiveRun
        ? 'Scan in progress'
        : permissions.scan
          ? 'Scan machine'
          : 'Scan permission required';
  const actionNotice = notice || (runHistoryUnavailable ? 'Live scan history is unavailable. Scan launch is disabled to prevent duplicate jobs.' : '');

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
          <button className="btn machine-scan-action" type="button" onClick={runScan} disabled={scanBusy || scanBlocked}>
            {scanButtonLabel}
          </button>
        </div>
        {actionNotice ? <p className="machine-action-notice" role="status" aria-live="polite">{actionNotice}</p> : <span className="sr-only" aria-live="polite" />}
      </section>

      <dl className="machine-summary-strip" aria-label="Machine operational summary">
        <div><dt>Environment</dt><dd>{machine.env || 'Unassigned'}</dd></div>
        <div><dt>Owner</dt><dd>{machine.owner || 'Unassigned'}</dd></div>
        <div><dt>Connection</dt><dd>{humanize(machine.connection_mode)}</dd></div>
        <div><dt>Findings</dt><dd>{Number(machine.finding_count || 0)}</dd></div>
        <div><dt>Open remediation</dt><dd>{remediationOpenCount}</dd></div>
        <div><dt>Last scan</dt><dd>{toReadableTime(lastScanAt)}</dd></div>
      </dl>

      <section className="machine-progress-band panel" aria-labelledby="machine-progress-title">
        <div className="machine-section-heading">
          <div>
            <p className="section-kicker">Current activity</p>
            <h2 id="machine-progress-title">{hasActiveRun ? 'Scan in progress' : currentRun ? 'Latest scan' : 'Scan readiness'}</h2>
          </div>
          {currentRun ? <span className={`pill ${toneForRun(currentRun)}`}>{humanize(currentRun.status)}</span> : null}
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
          <span className="pill">{remediationOpenCount} open</span>
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
          <div className="machine-compact-empty"><p>No reports have been generated for this machine yet.</p><button className="btn alt" type="button" onClick={runScan} disabled={scanBusy || scanBlocked}>Run first scan</button></div>
        )}
      </section>

      {permissions.edit ? (
        <details className="machine-admin-disclosure">
          <summary className="machine-admin-summary"><span><b>Machine settings</b><small>Edit identity, ownership, connection, and monitoring.</small></span><span className="machine-admin-expand-label"><span>Expand settings</span><span>Hide settings</span></span></summary>
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
        <summary className="machine-admin-summary"><span><b>Danger zone</b><small>Permanent machine removal and scan-history deletion.</small></span><span className="machine-admin-expand-label"><span>Expand controls</span><span>Hide controls</span></span></summary>
        <div className="machine-admin-body">
          <p>Delete this managed machine and its related scan history. This cannot be undone.</p>
          <p className="note">{permissionStatus}</p>
          {deleteStatus ? <p className="note">{deleteStatus}</p> : null}
          <button className="btn danger" type="button" onClick={deleteMachine} disabled={!permissions.delete || deleteBusy}>{deleteBusy ? 'Deleting managed machine…' : 'Delete managed machine'}</button>
        </div>
      </details>
    </div>
  );
}
