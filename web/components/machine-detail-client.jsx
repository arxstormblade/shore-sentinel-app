'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiBase } from '@/lib/data';
import { routePath } from '@/lib/paths';

const FINAL_STATUSES = new Set(['succeeded', 'failed']);
const STATUS_PROGRESS = {
  queued: 0,
  claimed: 10,
  running: 25,
  parsing: 55,
  artifact_uploading: 80,
  retrying: 90,
  succeeded: 100,
  failed: 100,
};

function toReadableTime(value) {
  if (!value) return '—';
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

export function MachineDetailClient({ machine, initialRuns = [], canManage = false }) {
  const router = useRouter();
  const [runs, setRuns] = useState(() => ensureArray(initialRuns));
  const [activeRunId, setActiveRunId] = useState(() => ensureArray(initialRuns).find((run) => !FINAL_STATUSES.has(run.status))?.id ?? ensureArray(initialRuns)[0]?.id ?? null);
  const [notice, setNotice] = useState('');
  const [scanBusy, setScanBusy] = useState(false);
  const [saveBusy, setSaveBusy] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [adminCanManage, setAdminCanManage] = useState(Boolean(canManage));
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
    setActiveRunId(ensureArray(initialRuns).find((run) => !FINAL_STATUSES.has(run.status))?.id ?? ensureArray(initialRuns)[0]?.id ?? null);
  }, [initialRuns]);

  useEffect(() => {
    setAdminCanManage(Boolean(canManage));
  }, [canManage]);

  useEffect(() => {
    let cancelled = false;
    const refreshCurrentUser = async () => {
      try {
        const response = await fetch(`${apiBase}/auth/me`, { cache: 'no-store' });
        if (!response.ok) return;
        const user = await response.json();
        const roles = Array.isArray(user?.roles) ? user.roles.map((role) => String(role).toLowerCase()) : [];
        if (!cancelled) setAdminCanManage(roles.includes('admin'));
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
          fetch(`${apiBase}/scan-runs/${activeRunId}`, { cache: 'no-store' }),
          fetch(`${apiBase}/scan-runs/${activeRunId}/events`, { cache: 'no-store' }),
          fetch(`${apiBase}/scan-runs/${activeRunId}/artifacts`, { cache: 'no-store' }),
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
      const response = await fetch(`${apiBase}/targets/${machine.id}/scan-jobs`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
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
      const response = await fetch(`${apiBase}/targets/${machine.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
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
    if (!window.confirm(`Delete ${machine.name}? This removes the machine and related scan history.`)) return;
    setDeleteBusy(true);
    setNotice('');
    try {
      const response = await fetch(`${apiBase}/targets/${machine.id}`, { method: 'DELETE' });
      if (!response.ok) throw new Error('Unable to delete machine.');
      router.replace(routePath('/inventory'));
      router.refresh();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Unable to delete machine.');
      setDeleteBusy(false);
    }
  }

  const completedRuns = runs.filter((run) => FINAL_STATUSES.has(run.status) || run.latest_event_type === 'job.succeeded');
  const activeStatus = currentRun ? deriveProgressMessage(currentRun) : 'Waiting for a scan to start';

  return (
    <div className="stack">
      <section className="hero">
        <div>
          <p className="eye">Managed machine</p>
          <h1>{machine.name}</h1>
          <p>{machine.summary}</p>
        </div>
        <div className="actions">
          <span className="pill">{machine.status}</span>
          <button className="btn" type="button" onClick={runScan} disabled={scanBusy}>
            {scanBusy ? 'Launching scan…' : 'Scan machine'}
          </button>
        </div>
      </section>

      <section className="grid">
        <article className="panel">
          <h2>Asset details</h2>
          <p>Environment: {machine.env}</p>
          <p>Owner: {machine.owner}</p>
          <p>Hostname: {machine.name}</p>
          <p>Connection mode: {machine.connection_mode ?? 'ssh_push'}</p>
          <p>Asset mode: managed_machine</p>
        </article>
        <article className="panel">
          <h2>Live scan progress</h2>
          <b className="score">{currentProgress}%</b>
          <div className="progress-shell" aria-label="Scan progress">
            <div className="progress-fill" style={{ width: `${currentProgress}%` }} />
          </div>
          <p>{activeStatus}</p>
          <p>Started: {toReadableTime(currentRun?.started_at || currentRun?.created_at)}</p>
          <p>ETA: {currentEta == null ? 'Calculating…' : formatDuration(currentEta)}</p>
          {currentRun ? <span className={`pill ${FINAL_STATUSES.has(currentRun.status) ? 'green' : 'amber'}`}>{currentRun.status}</span> : null}
        </article>
      </section>

      {adminCanManage ? (
        <section className="panel auth-form">
          <h2>Admin machine settings</h2>
          <form onSubmit={saveMachine}>
            <label>
              Hostname
              <input name="hostname" value={draft.hostname} onChange={(event) => updateField('hostname', event.target.value)} required />
            </label>
            <label>
              FQDN
              <input name="fqdn" value={draft.fqdn} onChange={(event) => updateField('fqdn', event.target.value)} />
            </label>
            <label>
              IP address
              <input name="ip_address" value={draft.ip_address} onChange={(event) => updateField('ip_address', event.target.value)} />
            </label>
            <label>
              Owner team
              <input name="owner_team" value={draft.owner_team} onChange={(event) => updateField('owner_team', event.target.value)} />
            </label>
            <label>
              Platform
              <select name="platform" value={draft.platform} onChange={(event) => updateField('platform', event.target.value)}>
                <option value="windows">windows</option>
                <option value="linux">linux</option>
                <option value="macos">macos</option>
              </select>
            </label>
            <label>
              Connection mode
              <select name="connection_mode" value={draft.connection_mode} onChange={(event) => updateField('connection_mode', event.target.value)}>
                <option value="ssh_push">ssh_push</option>
                <option value="pull_checkin">pull_checkin</option>
                <option value="both">both</option>
              </select>
            </label>
            <label className="remember-me">
              <input
                name="monitoring_enabled"
                type="checkbox"
                checked={draft.monitoring_enabled}
                onChange={(event) => updateField('monitoring_enabled', event.target.checked)}
              />
              <span>Monitoring enabled</span>
            </label>
            <div className="actions-row">
              <button className="btn" type="submit" disabled={saveBusy}>{saveBusy ? 'Saving…' : 'Save changes'}</button>
            </div>
          </form>
        </section>
      ) : null}

      {adminCanManage ? (
        <section className="panel danger-zone">
          <h2>Admin danger zone</h2>
          <p>Delete this managed machine and its related scan history. This cannot be undone.</p>
          <button className="btn danger" type="button" onClick={deleteMachine} disabled={deleteBusy}>
            {deleteBusy ? 'Deleting managed machine…' : 'Delete managed machine'}
          </button>
        </section>
      ) : null}

      <section className="panel">
        <h2>Reports</h2>
        {completedRuns.length ? (
          <div className="cards report-cards">
            {completedRuns.map((run) => (
              <Link className="card report-card" href={routePath(`/scans-reports/reports/${run.id}`)} key={run.id}>
                <h3>{run.subject_type === 'managed_target' ? 'Managed machine scan' : 'Audit report'}</h3>
                <p>Run: {run.id}</p>
                <p>Status: {run.status}</p>
                <p>Completed: {toReadableTime(run.completed_at || run.updated_at || run.created_at)}</p>
                <div className="chip-row">
                  {ensureArray(run.artifacts).map((artifact) => (
                    <span key={artifact.id ?? artifact.artifact_type} className="pill green">{artifact.artifact_type}</span>
                  ))}
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="empty">
            <p>No reports have been generated for this machine yet.</p>
            <button className="btn" type="button" onClick={runScan} disabled={scanBusy}>Run first scan</button>
          </div>
        )}
      </section>

      <p className="note">{notice}</p>
    </div>
  );
}
