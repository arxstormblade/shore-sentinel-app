import Link from 'next/link';
import { routePath } from '@/lib/paths';

const serverApiBase = () => (process.env.INTERNAL_API_URL || process.env.API_URL || 'http://api:4000').replace(/\/$/, '');
const severityOrder = ['critical', 'high', 'medium', 'low', 'informational'];
const severityLabels = { critical: 'Critical', high: 'High', medium: 'Medium', low: 'Low', informational: 'Informational' };

async function getJson(path, fallback) {
  try {
    const response = await fetch(`${serverApiBase()}${path}`, { cache: 'no-store' });
    if (!response.ok) return fallback;
    return await response.json();
  } catch {
    return fallback;
  }
}

function formatTime(value) {
  if (!value) return '—';
  try { return new Date(value).toLocaleString(); } catch { return '—'; }
}

export default async function Dashboard() {
  const [machines, audits, metrics] = await Promise.all([
    getJson('/targets', []),
    getJson('/one-time-audits', []),
    getJson('/dashboard/metrics', { severityCounts: {}, totalFindings: 0, recentRuns: [] }),
  ]);
  const online = machines.filter((machine) => machine.status && machine.status !== 'offline').length;
  const offline = machines.filter((machine) => machine.status === 'offline').length;
  const pendingAudits = audits.filter((audit) => !['completed', 'ready'].includes(String(audit.status).toLowerCase())).length;
  const severityCounts = metrics.severityCounts || {};
  const totalFindings = Number(metrics.totalFindings || 0);
  const recentRuns = Array.isArray(metrics.recentRuns) ? metrics.recentRuns : [];

  return (
    <div className="dashboard-shell" data-view="Managed-machine dashboard">
      <section className="panel dashboard-hero">
        <div className="hero-copy">
          <p className="eye">Single-tenant security operations</p>
          <h1>Start clean, then build live inventory, audits, and remediation from real data.</h1>
          <p>
            Shore Sentinel is ready for live records. Add a managed machine or run a one-time audit to populate this dashboard.
          </p>
          <div className="hero-chipbar">
            <span className="chip green">Tailnet secure</span>
            <span className="chip">Single tenant</span>
            <span className="chip">Live data only</span>
          </div>
        </div>

        <div className="signal-board">
          <div className="signal-card accent">
            <span>Managed fleet</span>
            <strong>{machines.length}</strong>
            <small>{online} online · {offline} offline</small>
          </div>
          <div className="signal-card">
            <span>Findings</span>
            <strong>{totalFindings}</strong>
            <small>{totalFindings ? 'Live scanner findings recorded' : 'No scanner findings recorded yet'}</small>
          </div>
          <div className="signal-card wide">
            <span>Pending audits</span>
            <strong>{pendingAudits}</strong>
            <small>Create live records from the actions below.</small>
          </div>
        </div>
      </section>

      <section className="hero-actions">
        <article className="action-card panel">
          <div className="round-icon">▣</div>
          <div>
            <h2>Run One-Time Audit</h2>
            <p>Create a live one-time audit target without adding it to managed fleet health.</p>
            <Link className="btn" href={routePath('/audits/new')}>Run Audit</Link>
          </div>
        </article>

        <article className="action-card panel">
          <div className="round-icon">⊞</div>
          <div>
            <h2>Add Managed Machine</h2>
            <p>Add a real machine to inventory for monitoring, reporting, and scan history.</p>
            <Link className="btn" href={routePath('/inventory/new')}>Add Machine</Link>
          </div>
        </article>
      </section>

      <section className="dashboard-grid">
        <article className="panel data-panel fleet-panel">
          <header><h2>Managed Machine Fleet</h2><span className="info-dot">i</span></header>
          {machines.length ? (
            <div className="fleet-cards">
              <div className="fleet-card"><span className="status-dot green" /><b>Online</b><strong>{online}</strong><small>Machines</small></div>
              <div className="fleet-card"><span className="status-dot amber" /><b>Offline</b><strong>{offline}</strong><small>Machines</small></div>
              <div className="fleet-card"><span className="status-dot gray" /><b>Total</b><strong>{machines.length}</strong><small>Machines</small></div>
            </div>
          ) : <div className="empty"><h3>No managed machines yet</h3><p>Add your first live managed machine to populate fleet health.</p><Link className="btn" href={routePath('/inventory/new')}>Add Managed Machine</Link></div>}
        </article>

        <article className="panel data-panel severity-panel">
          <h2>Findings by Severity</h2>
          {totalFindings ? (
            <div className="severity-content">
              <div className="total-findings"><span>Total findings</span><strong>{totalFindings}</strong></div>
              <div className="severity-list">
                {severityOrder.map((severity) => {
                  const count = Number(severityCounts[severity] || 0);
                  const percent = totalFindings ? Math.round((count / totalFindings) * 100) : 0;
                  return (
                    <div key={severity}>
                      <span className={`status-dot ${severity}`} />
                      <b>{severityLabels[severity]}</b>
                      <small>{percent}%</small>
                      <strong>{count}</strong>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : <div className="empty"><h3>No findings yet</h3><p>Run a scan or audit to generate live findings and remediation items.</p></div>}
        </article>

        <article className="panel data-panel scans-panel">
          <header><h2>Recent Scans</h2><Link href={routePath('/scans-reports')}>View all scans</Link></header>
          {recentRuns.length ? (
            <table>
              <thead><tr><th>Subject</th><th>Status</th><th>Completed</th></tr></thead>
              <tbody>
                {recentRuns.map((run) => (
                  <tr key={run.id}>
                    <td>{run.subject_name || run.id}</td>
                    <td><span className={run.status === 'completed' ? 'completed' : 'failed'}>{run.status}</span></td>
                    <td>{formatTime(run.completed_at || run.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <div className="empty"><h3>No scans yet</h3><p>Live scan history will appear here after you run an audit or managed-machine scan.</p></div>}
        </article>

        <article className="panel data-panel kb-panel">
          <header><h2>Knowledgebase</h2><Link href={routePath('/knowledgebase')}>View all articles</Link></header>
          <div className="guide-list">
            {[
              ['▤', 'Connect a new endpoint', 'Add your first live managed machine.'],
              ['⌕', 'Run an audit scan', 'Launch a one-time audit from scratch.'],
              ['♢', 'Review remediation steps', 'Remediation appears after live findings exist.'],
              ['▥', 'Export compliance report', 'Reports become available after scans complete.'],
            ].map(([icon, title, desc]) => (
              <Link href={routePath('/knowledgebase')} key={title}><span>{icon}</span><div><b>{title}</b><small>{desc}</small></div><i>›</i></Link>
            ))}
          </div>
        </article>
      </section>
    </div>
  );
}
