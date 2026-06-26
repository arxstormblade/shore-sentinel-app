import Link from 'next/link';
import { routePath } from '@/lib/paths';
import { SavedViewsPanel } from '@/components/saved-views';

export const dynamic = 'force-dynamic';

const serverApiBase = () => (process.env.INTERNAL_API_URL || process.env.API_URL || 'http://api:4000').replace(/\/$/, '');
const severityOrder = ['critical', 'high', 'medium', 'low', 'informational'];
const severityLabels = { critical: 'Critical', high: 'High', medium: 'Medium', low: 'Low', informational: 'Informational' };
const severityExplanations = {
  critical: 'Active exploitation or confirmed compromise. Stop other work and triage now.',
  high: 'High-confidence finding with meaningful blast radius. Address in this operational window.',
  medium: 'Material weakness that raises risk. Plan remediation in the next hardening pass.',
  low: 'Minor weakness or hygiene item. Track and fix whenschedule allows.',
  informational: 'Context, best-practice note, or inert observation. No immediate action required.',
};

const nextActionBySeverity = {
  critical: { label: 'Review critical findings immediately', href: '/remediation?severity=critical', tone: 'red' },
  high: { label: 'Address high-severity findings', href: '/remediation?severity=high', tone: 'red' },
  medium: { label: 'Triage medium-severity findings', href: '/remediation?severity=medium', tone: 'amber' },
  low: { label: 'Plan low-severity hardening', href: '/remediation?severity=low', tone: 'yellow' },
  informational: { label: 'Review informational findings', href: '/remediation?severity=informational', tone: 'blue' },
  none: { label: 'Run a scan to generate findings', href: '/scans/start', tone: 'green' },
};

const emptyTrendState = {
  severityTrends: [],
  riskScoreHistory: [],
  findingMovement: { newFindings: 0, fixedFindings: 0, openFindings: 0 },
  postureBenchmark: { currentScore: 100, targetScore: 90, delta: 10, status: 'on_target', comparisonBasis: 'Internal 90-point operational target' },
};

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

function highestSeverity(counts) {
  return severityOrder.find((severity) => Number(counts?.[severity] || 0) > 0) || 'none';
}

export default async function Dashboard() {
  const [machines, audits, metrics, trends] = await Promise.all([
    getJson('/targets', []),
    getJson('/one-time-audits', []),
    getJson('/dashboard/metrics', { severityCounts: {}, totalFindings: 0, recentRuns: [] }),
    getJson('/dashboard/trends', emptyTrendState),
  ]);
  const online = machines.filter((machine) => machine.status && machine.status !== 'offline').length;
  const offline = machines.filter((machine) => machine.status === 'offline').length;
  const pendingAudits = audits.filter((audit) => !['completed', 'ready'].includes(String(audit.status).toLowerCase())).length;
  const severityCounts = metrics.severityCounts || {};
  const totalFindings = Number(metrics.totalFindings || 0);
  const recentRuns = Array.isArray(metrics.recentRuns) ? metrics.recentRuns : [];
  const remediationCounts = metrics.remediationCounts || { needs_review: 0, in_progress: 0, fixed: 0, accepted_risk: 0 };
  const topSeverity = highestSeverity(severityCounts);
  const hasLiveData = machines.length || totalFindings || recentRuns.length;
  const nextAction = nextActionBySeverity[topSeverity] || nextActionBySeverity.none;
  const hasRunning = recentRuns.some((run) => ['running', 'leased', 'pending'].includes(String(run.status)));
  const hasCompleted = recentRuns.some((run) => run.status === 'completed');
  const trendState = trends || emptyTrendState;
  const severityTrends = Array.isArray(trendState.severityTrends) ? trendState.severityTrends : [];
  const riskScoreHistory = Array.isArray(trendState.riskScoreHistory) ? trendState.riskScoreHistory : [];
  const findingMovement = trendState.findingMovement || emptyTrendState.findingMovement;
  const postureBenchmark = trendState.postureBenchmark || emptyTrendState.postureBenchmark;

  return (
    <div className="dashboard-shell" data-view="Managed-machine dashboard">
      <section className="panel dashboard-hero">
        <div className="hero-copy">
          <p className="eye">Single-tenant security operations</p>
          <h1>{hasLiveData ? 'Security posture from live scans' : 'Start with one clear operational choice'}</h1>
          <p>
            {hasLiveData
              ? `Your managed fleet has ${totalFindings} open finding${totalFindings === 1 ? '' : 's'}. Highest severity is ${topSeverity === 'none' ? 'none' : severityLabels[topSeverity]}. Review severity, inspect reports, or start a new scan.`
              : 'Add a managed machine or run a one-time audit to generate live findings, reports, and remediation work.'}
          </p>
          <div className="hero-chipbar">
            <span className="chip green">Tailnet secure</span>
            <span className="chip">Single tenant</span>
            <span className="chip">Highest severity: {topSeverity === 'none' ? 'None' : severityLabels[topSeverity]}</span>
          </div>
          <p className="note"><Link href={routePath('/knowledgebase#severity-scoring')}>How severity is calculated</Link> · <Link href={routePath('/knowledgebase#score-explanation')}>Understanding your security score</Link> · <Link href={routePath('/knowledgebase#prioritization')}>How findings are prioritized</Link> · <Link href={routePath('/knowledgebase')}>When to use one-time audit vs managed machine</Link></p>
        </div>

        <div className="signal-board">
          <div className="signal-card accent"><span>Managed fleet</span><strong>{machines.length}</strong><small>{online} online · {offline} offline</small></div>
          <div className="signal-card"><span>Findings</span><strong>{totalFindings}</strong><small>{totalFindings ? 'Live scanner findings recorded' : 'No scanner findings recorded yet'}</small></div>
          <div className="signal-card wide"><span>Pending audits</span><strong>{pendingAudits}</strong><small>Create live records from the actions below.</small></div>
        </div>
      </section>

      <section className="panel next-action-panel" data-testid="next-action" aria-label="Recommended next action">
        <div className="next-action-content">
          <span className={`status-dot ${nextAction.tone}`} aria-hidden="true" />
          <div className="next-action-copy">
            <h2>Next action</h2>
            <p>{nextAction.label}</p>
            <small className="next-action-why">Chosen from the highest-severity open finding across the fleet. Severity-ranked first, then by scanner confidence and blast radius.</small>
          </div>
        </div>
        <div className="next-action-buttons">
          <Link className="btn" href={routePath(nextAction.href)}>{nextAction.label}</Link>
          {hasCompleted ? <Link className="btn alt" href={routePath('/remediation')}>Open remediation</Link> : null}
          {hasRunning ? <Link className="btn alt" href={routePath('/scans-reports')}>View progress</Link> : null}
        </div>
      </section>

      <SavedViewsPanel />

      <section className="panel data-panel trends-panel" data-testid="trend-analysis">
        <header><h2>Trend analysis &amp; benchmarking</h2><Link href={routePath('/knowledgebase#score-explanation')}>Understand scores</Link></header>
        <div className="trend-grid">
          <div className="trend-card">
            <span>Severity trends</span>
            <strong>{severityTrends.length ? `${severityTrends.length} day${severityTrends.length === 1 ? '' : 's'}` : 'No trend yet'}</strong>
            <small>{severityTrends.length ? '30-day finding history grouped by severity.' : 'Run more scans to build severity history.'}</small>
          </div>
          <div className="trend-card">
            <span>Risk-score history</span>
            <strong>{riskScoreHistory.at(-1)?.risk_score ?? postureBenchmark.currentScore}</strong>
            <small>{riskScoreHistory.length ? `${riskScoreHistory.length} completed scan${riskScoreHistory.length === 1 ? '' : 's'} tracked.` : 'No completed scan score history yet.'}</small>
          </div>
          <div className="trend-card">
            <span>Fixed vs new findings</span>
            <strong>{Number(findingMovement.fixedFindings || 0)} fixed · {Number(findingMovement.newFindings || 0)} new</strong>
            <small>{Number(findingMovement.openFindings || 0)} open finding{Number(findingMovement.openFindings || 0) === 1 ? '' : 's'} remain in the current posture.</small>
          </div>
          <div className="trend-card">
            <span>Posture benchmark</span>
            <strong>{postureBenchmark.currentScore}/{postureBenchmark.targetScore}</strong>
            <small>{postureBenchmark.comparisonBasis}. Status: {String(postureBenchmark.status || 'unknown').replace(/_/g, ' ')}.</small>
          </div>
        </div>
      </section>

      <section className="hero-actions">
        <article className="action-card panel"><div className="round-icon" aria-hidden="true">▣</div><h2>Start scan</h2><p>Collect live evidence from any endpoint without adding it to the fleet. Takes you to scan progress and the completed report.</p><Link className="btn" href={routePath('/scans/start')}>Start scan</Link></article>
        <article className="action-card panel"><div className="round-icon" aria-hidden="true">⊞</div><h2>Add &amp; scan machine</h2><p>Enroll a managed machine for ongoing inventory, scan history, and fleet-wide posture from the dashboard.</p><Link className="btn" href={routePath('/inventory/new')}>Add &amp; scan machine</Link></article>
      </section>

      <section className="dashboard-grid">
        <article className="panel data-panel fleet-panel">
          <header><h2>Managed Machine Fleet</h2><span className="info-dot" aria-hidden="true">i</span></header>
          {machines.length ? (
            <div className="fleet-cards">
              <div className="fleet-card"><span className="status-dot green" aria-hidden="true" /><b>Online</b><strong>{online}</strong><small>Machines</small></div>
              <div className="fleet-card"><span className="status-dot amber" aria-hidden="true" /><b>Offline</b><strong>{offline}</strong><small>Machines</small></div>
              <div className="fleet-card"><span className="status-dot gray" aria-hidden="true" /><b>Total</b><strong>{machines.length}</strong><small>Machines</small></div>
            </div>
          ) : <div className="empty" data-testid="dashboard-fleet-empty"><h3>No managed machines yet</h3><p>Enroll a machine to populate fleet health, schedule scans, and see posture reporting.</p><Link className="btn" href={routePath('/inventory/new')}>Add Managed Machine</Link></div>}
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
                    <Link className="severity-row" href={routePath(`/remediation?severity=${severity}`)} key={severity} title={severityExplanations[severity]} aria-describedby="severity-legend">
                      <span className={`status-dot ${severity}`} aria-hidden="true" />
                      <b>{severityLabels[severity]}</b>
                      <small>{percent}%</small>
                      <strong>{count}</strong>
                      <em>{severity === 'high' ? 'View high findings' : 'Review findings'}</em>
                    </Link>
                  );
                })}
              </div>
              <ul className="severity-legend" id="severity-legend">
                {severityOrder.map((sev) => (
                  <li key={sev}>
                    <span className={`status-dot ${sev}`} aria-hidden="true" />
                    <b>{severityLabels[sev]}</b>
                    <span>{severityExplanations[sev]}</span>
                  </li>
                ))}
              </ul>
              <p className="severity-legend-foot">
                <span>Severity reflects scanner-assessed impact and confidence.</span>
                <Link href={routePath('/knowledgebase#severity-scoring')}>How severity is calculated</Link>
                {" · "}
                <Link href={routePath('/knowledgebase#prioritization')}>How findings are prioritized</Link>
              </p>
            </div>
          ) : <div className="empty" data-testid="dashboard-findings-empty"><h3>No findings yet</h3><p>Findings appear after a scan or audit completes. Run your first scan to start tracking security posture.</p><Link className="btn" href={routePath('/scans/start')}>Start scan</Link></div>}
        </article>

        <article className="panel data-panel remediation-panel">
          <header><h2>Remediation Status</h2><Link href={routePath('/remediation')}>View all</Link></header>
          <div className="remediation-status-grid" data-testid="dashboard-remediation-counts">
            <Link className="remediation-status-card" href={routePath('/remediation?status=needs_review')}>
              <strong>{remediationCounts.needs_review}</strong><span>Needs review</span>
            </Link>
            <Link className="remediation-status-card" href={routePath('/remediation?status=in_progress')}>
              <strong>{remediationCounts.in_progress}</strong><span>In progress</span>
            </Link>
            <Link className="remediation-status-card" href={routePath('/remediation?status=fixed')}>
              <strong>{remediationCounts.fixed}</strong><span>Fixed</span>
            </Link>
            <Link className="remediation-status-card" href={routePath('/remediation?status=accepted_risk')}>
              <strong>{remediationCounts.accepted_risk}</strong><span>Accepted risk</span>
            </Link>
          </div>
        </article>

        <article className="panel data-panel scans-panel">
          <header><h2>Recent Scans</h2><Link href={routePath('/scans-reports')}>View all scans</Link></header>
          {recentRuns.length ? (
            <table><thead><tr><th>Subject</th><th>Status</th><th>Completed</th><th>Next</th></tr></thead><tbody>
              {recentRuns.map((run) => (
                <tr key={run.id}>
                  <td data-label="Subject">{run.subject_name || run.id}</td>
                  <td data-label="Status"><span className={run.status === 'completed' ? 'completed' : 'failed'}>{run.status}</span></td>
                  <td data-label="Completed">{formatTime(run.completed_at || run.created_at)}</td>
                  <td data-label="Next">
                    {run.status === 'running' || run.status === 'leased' ? (
                      <Link href={routePath(`/scans-reports/reports/${run.id}`)}>View progress</Link>
                    ) : (
                      <>
                        <Link href={routePath(`/scans-reports/reports/${run.id}`)}>Open report</Link>
                        {' · '}
                        <Link href={routePath('/remediation')}>Open remediation</Link>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody></table>
          ) : <div className="empty" data-testid="dashboard-scans-empty"><h3>No scans yet</h3><p>Run a one-time audit or scan a managed machine to generate your first report.</p><Link className="btn" href={routePath('/scans/start')}>Start scan</Link></div>}
        </article>

        <article className="panel data-panel kb-panel">
          <header><h2>Knowledgebase</h2><Link href={routePath('/knowledgebase')}>View all articles</Link></header>
          <div className="guide-list">
            {[
              ['▤', 'Connect a new endpoint', 'Add your first live managed machine.'],
              ['⌕', 'Run an audit scan', 'Launch a one-time audit from scratch.'],
              ['♢', 'Review remediation steps', 'Remediation appears after live findings exist.'],
              ['▥', 'Export compliance report', 'Reports become available after scans complete.'],
            ].map(([icon, title, desc]) => <Link href={routePath('/knowledgebase')} key={title}><span aria-hidden="true">{icon}</span><div><b>{title}</b><small>{desc}</small></div><i aria-hidden="true">›</i></Link>)}
          </div>
        </article>
      </section>
    </div>
  );
}
