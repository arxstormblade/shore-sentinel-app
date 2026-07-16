import Link from 'next/link';
import { OperationalSection, OperationsLedger, OperationsLedgerRow } from '@/components/ui';
import { routePath } from '@/lib/paths';

const serverApiBase = () => (process.env.INTERNAL_API_URL || process.env.API_URL || 'http://api:4000').replace(/\/$/, '');

const severityTone = { critical: 'red', high: 'red', medium: 'amber', low: 'yellow', informational: 'blue' };
const statusTones = { needs_review: 'amber', in_progress: 'blue', fixed: 'green', accepted_risk: 'yellow' };
const statusLabels = { needs_review: 'Needs review', in_progress: 'In progress', fixed: 'Fixed', accepted_risk: 'Accepted risk' };

const VIEW_META = {
  'high-findings': {
    title: 'High findings',
    desc: 'Critical and high severity findings across the fleet — triage these first.',
    icon: '★',
    accent: 'red',
    href: '/saved-views/high-findings',
  },
  'unreviewed-remediation': {
    title: 'Unreviewed remediation',
    desc: 'Remediation items waiting for review — assign, fix, or accept risk.',
    icon: '◎',
    accent: 'amber',
    href: '/saved-views/unreviewed-remediation',
  },
  'failed-scans': {
    title: 'Failed scans',
    desc: 'Scans that did not complete — investigate and retry.',
    icon: '⊗',
    accent: 'red',
    href: '/saved-views/failed-scans',
  },
  'recently-completed': {
    title: 'Recently completed scans',
    desc: 'Scans that finished in the latest cycle — review reports and findings.',
    icon: '✓',
    accent: 'green',
    href: '/saved-views/recently-completed',
  },
};

const ALL_VIEW_SLUGS = Object.keys(VIEW_META);

function SavedViewRows({ items, renderAction, statusClass = '' }) {
  return (
    <OperationsLedger label="Saved view results">
      {items.map((run) => (
        <OperationsLedgerRow key={run.id}>
          <div className="operations-row-copy compact-table-row"><b>{run.subject_name || run.id}</b><span>Status: {run.status} · Findings: {run.findings_count ?? 0} · Completed: {formatTime(run.completed_at || run.started_at)}</span></div>
          <div className="operations-row-actions"><span className={statusClass}>{run.status}</span>{renderAction(run)}</div>
        </OperationsLedgerRow>
      ))}
    </OperationsLedger>
  );
}

function formatTime(value) {
  if (!value) return '—';
  try { return new Date(value).toLocaleString(); } catch { return '—'; }
}

function readableText(value, fallback = '') {
  if (typeof value === 'string') return value === '[object Object]' ? fallback : value;
  if (value == null) return fallback;
  if (Array.isArray(value)) return value.map((item) => readableText(item)).filter(Boolean).join('\n');
  if (typeof value === 'object') {
    const primary = value.instruction || value.action || value.recommendation || value.remediation || value.description || value.summary || value.title;
    const parts = [readableText(primary, fallback)];
    if (value.file_path) parts.push(`File: ${value.file_path}`);
    if (value.command) parts.push(`Command: ${value.command}`);
    return parts.filter(Boolean).join('\n') || fallback;
  }
  return String(value);
}

function remediationText(finding) {
  return readableText(
    finding.remediation_action || finding.remediation_instructions || finding.remediation_title,
    'Review evidence, apply the recommended hardening step, then rerun the scan.',
  );
}

async function getJson(path, fallback) {
  try {
    const response = await fetch(`${serverApiBase()}${path}`, { cache: 'no-store' });
    if (!response.ok) return fallback;
    return await response.json();
  } catch {
    return fallback;
  }
}

export async function SavedViewsPanel() {
  const views = await getJson('/saved-views', []);
  const visible = views.filter((v) => ALL_VIEW_SLUGS.includes(v.slug));
  return (
    <OperationalSection eyebrow="Saved views" title="Saved operational views" data-testid="saved-views-panel">
      <header>
        <div>
          <h2>Saved views</h2>
          <p>Curated operational entry points for the findings and scans that need your attention next.</p>
        </div>
        <Link className="btn alt" href={routePath('/saved-views')}>All saved views</Link>
      </header>
      <div className="saved-views-grid" data-testid="saved-views-grid">
        {visible.length === 0 ? (
          <div className="empty" data-testid="saved-views-empty">
            <h3>No saved views yet</h3>
            <p>Preset operational views appear here once the API seeds them on first request.</p>
          </div>
        ) : (
          visible.map((view) => {
            const meta = VIEW_META[view.slug];
            return (
              <Link
                key={view.slug}
                className="panel"
                href={routePath(meta.href)}
              >
                {meta && (
                  <div className="saved-view-card">
                    <span className={`status-dot ${meta.accent}`} aria-hidden="true" />
                    <div className="saved-view-content">
                      <h3>{view.title || meta.title}</h3>
                      <p>{meta.desc}</p>
                      <span className="saved-view-meta">
                        {view.is_pinned ? 'Pinned · ' : ''}
                        {view.view_type === 'high_findings' ? 'Severity-sorted' : ''}
                        {view.view_type === 'unreviewed_remediation' ? 'Newest first' : ''}
                        {view.view_type === 'failed_scans' ? 'Newest first' : ''}
                        {view.view_type === 'recently_completed' ? 'Newest first' : ''}
                      </span>
                    </div>
                    <i className="saved-view-arrow" aria-hidden="true">›</i>
                  </div>
                )}
              </Link>
            );
          })
        )}
      </div>
    </OperationalSection>
  );
}

async function HighFindingsView() {
  const data = await getJson('/saved-views/high-findings/data', { items: [], total: 0, view_type: 'high_findings' });
  const items = Array.isArray(data?.items) ? data.items : [];
  return (
    <section className="panel" data-testid="saved-view-high-findings" data-view="high_findings">
      <header>
        <div>
          <h2>High findings</h2>
          <p>Critical and high severity findings across your fleet, sorted by severity then recency.</p>
        </div>
        <span className="pill" data-testid="saved-view-total">{items.length} finding{items.length === 1 ? '' : 's'}</span>
      </header>
      {items.length === 0 ? (
        <div className="empty" data-testid="saved-view-empty">
          <h3>No critical or high findings</h3>
          <p>Your fleet has no findings at critical or high severity. Run a scan to collect fresh evidence.</p>
          <div className="empty-actions">
            <Link className="btn" href={routePath('/scans/start')}>Start scan</Link>
            <Link className="btn alt" href={routePath('/remediation')}>View all remediation</Link>
          </div>
        </div>
      ) : (
        <div className="finding-list" data-testid="saved-view-list">
          {items.map((finding) => (
            <article className="finding-row" key={finding.id} data-testid="saved-view-row">
              <div>
                <h3>{finding.title}</h3>
                <p>{finding.description || finding.evidence_summary || 'Scanner evidence is available in the report artifacts.'}</p>
                <small>Suggested remediation: {remediationText(finding)}</small>
              </div>
              <aside>
                <span className={`pill ${severityTone[finding.severity] || ''}`}>{finding.severity}</span>
                <span className={`pill ${statusTones[finding.remediation_status] || ''}`} data-testid="row-status">
                  {statusLabels[finding.remediation_status] || finding.remediation_status || 'open'}
                </span>
                <Link className="btn alt" href={routePath(`/scans-reports/reports/${finding.run_id}`)}>Open evidence</Link>
              </aside>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

async function UnreviewedRemediationView() {
  const data = await getJson('/saved-views/unreviewed-remediation/data', { items: [], total: 0, view_type: 'unreviewed_remediation' });
  const items = Array.isArray(data?.items) ? data.items : [];
  return (
    <section className="panel" data-testid="saved-view-unreviewed-remediation" data-view="unreviewed_remediation">
      <header>
        <div>
          <h2>Unreviewed remediation</h2>
          <p>Remediation items that have not been reviewed yet — assign, fix, or accept risk.</p>
        </div>
        <span className="pill" data-testid="saved-view-total">{items.length} item{items.length === 1 ? '' : 's'}</span>
      </header>
      {items.length === 0 ? (
        <div className="empty" data-testid="saved-view-empty">
          <h3>No unreviewed remediation</h3>
          <p>All remediation items have been reviewed, or no findings with remediation exist yet. Start a scan to generate new items.</p>
          <div className="empty-actions">
            <Link className="btn" href={routePath('/remediation?status=needs_review')}>Open remediation</Link>
          </div>
        </div>
      ) : (
        <div className="remediation-list" data-testid="saved-view-list">
          {items.map((item) => (
            <article className="remediation-row" key={item.id} data-testid="saved-view-row">
              <div>
                <h3>{item.title}</h3>
                <p>{item.action || item.instructions || 'Review the suggested action and apply the recommended hardening step.'}</p>
                {item.subject_name ? <small>Subject: {item.subject_name}</small> : null}
              </div>
              <aside>
                <span className={`pill ${severityTone[item.severity] || ''}`}>{item.severity}</span>
                <span className={`pill ${statusTones[item.status] || ''}`} data-testid="row-status">
                  {statusLabels[item.status] || item.status}
                </span>
                <Link className="btn alt" href={routePath(`/remediation/${item.id}`)}>View details</Link>
              </aside>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

async function FailedScansView() {
  const data = await getJson('/saved-views/failed-scans/data', { items: [], total: 0, view_type: 'failed_scans' });
  const items = Array.isArray(data?.items) ? data.items : [];
  return (
    <section className="panel" data-testid="saved-view-failed-scans" data-view="failed_scans">
      <header>
        <div>
          <h2>Failed scans</h2>
          <p>Scans that did not complete successfully — review subject, timing, and retry.</p>
        </div>
        <span className="pill" data-testid="saved-view-total">{items.length} scan{items.length === 1 ? '' : 's'}</span>
      </header>
      {items.length === 0 ? (
        <div className="empty" data-testid="saved-view-empty">
          <h3>No failed scans</h3>
          <p>All scans have completed successfully or no scans have been run yet.</p>
          <div className="empty-actions">
            <Link className="btn" href={routePath('/scans-reports')}>View all scans</Link>
          </div>
        </div>
      ) : <SavedViewRows items={items} statusClass="failed" renderAction={(run) => <Link className="btn alt" href={routePath(`/scans-reports/reports/${run.id}`)}>Investigate</Link>} />}
    </section>
  );
}

async function RecentlyCompletedView() {
  const data = await getJson('/saved-views/recently-completed/data', { items: [], total: 0, view_type: 'recently_completed' });
  const items = Array.isArray(data?.items) ? data.items : [];
  return (
    <section className="panel" data-testid="saved-view-recently-completed" data-view="recently_completed">
      <header>
        <div>
          <h2>Recently completed scans</h2>
          <p>Scans that finished most recently — review reports and findings.</p>
        </div>
        <span className="pill" data-testid="saved-view-total">{items.length} scan{items.length === 1 ? '' : 's'}</span>
      </header>
      {items.length === 0 ? (
        <div className="empty" data-testid="saved-view-empty">
          <h3>No recently completed scans</h3>
          <p>Complete a scan to see results here.</p>
          <div className="empty-actions">
            <Link className="btn" href={routePath('/scans/start')}>Start scan</Link>
          </div>
        </div>
      ) : <SavedViewRows items={items} statusClass="completed" renderAction={(run) => <><Link className="btn alt" href={routePath(`/scans-reports/reports/${run.id}`)}>Open report</Link><Link className="btn ghost" href={routePath('/remediation')}>Remediation</Link></>} />}
    </section>
  );
}

export function SavedViewContent({ slug }) {
  switch (slug) {
    case 'high-findings':
      return <HighFindingsView />;
    case 'unreviewed-remediation':
      return <UnreviewedRemediationView />;
    case 'failed-scans':
      return <FailedScansView />;
    case 'recently-completed':
      return <RecentlyCompletedView />;
    default:
      return (
        <section className="panel" data-testid="saved-view-unknown">
          <div className="empty">
            <h3>Unknown saved view</h3>
            <p>The view you requested is not one of the supported preset views.</p>
            <Link className="btn" href={routePath('/saved-views')}>Back to saved views</Link>
          </div>
        </section>
      );
  }
}
