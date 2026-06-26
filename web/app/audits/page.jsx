import Link from 'next/link';
import { Header, Filters, Pill } from '@/components/ui';
import { filterAudits } from '@/lib/filters';
import { routePath } from '@/lib/paths';

const serverApiBase = () => (process.env.INTERNAL_API_URL || process.env.API_URL || 'http://api:4000').replace(/\/$/, '');

async function loadLiveAudits() {
  try {
    const response = await fetch(`${serverApiBase()}/one-time-audits`, { cache: 'no-store' });
    if (!response.ok) return [];
    return await response.json();
  } catch {
    return [];
  }
}

export default async function Audits({ searchParams }) {
  const severity = searchParams?.severity || 'All severities';
  const timeRange = searchParams?.timeRange || 'Any time';
  const env = searchParams?.env || 'All environments';
  const audits = (await loadLiveAudits()).map((audit) => ({
    id: audit.id,
    target: audit.display_name,
    summary: audit.hostname ?? 'Temporary audit target',
    env: audit.connection_mode,
    status: audit.status,
    severity: audit.severity || 'informational',
    updated_at: audit.updated_at || audit.created_at,
    promote: audit.promoted_target_id ? 'Promoted' : 'Promote to Managed Machine',
  }));
  const filteredAudits = filterAudits(audits, { severity, timeRange, env });
  const clearHref = routePath('/audits');

  return (
    <div className="stack">
      <Header eye="Audit History" title="One-time audits stay outside fleet health" desc="Create live ad hoc audits from scratch. No demo audit records are preloaded.">
        <Link className="btn" href={routePath('/audits/new')}>Run One-Time Audit</Link>
      </Header>
      <div aria-live="polite" className="result-summary" data-testid="audits-result-summary">
        Showing {filteredAudits.length} of {audits.length} audits
        {filteredAudits.length !== audits.length ? <a className="btn-link" href={clearHref}>Clear filters</a> : null}
      </div>

      <Filters name="Audit history" items={['Severity', 'Time range', 'Environment']} />
      <section className="panel">
        {filteredAudits.length ? filteredAudits.map((audit) => (
          <Link className="row" href={routePath('/audits/' + audit.id)} key={audit.id}>
            <span><b>{audit.target}</b><small>{audit.summary}</small></span>
            <span>{audit.promote}</span><Pill>{audit.status}</Pill>
          </Link>
        )) : <div className="empty"><h3>No audits match the current filters</h3><p>Try adjusting your filters to see more results, or clear them to view all audits.</p><Link className="btn" href={clearHref}>Clear filters</Link></div>}
      </section>
    </div>
  );
}
