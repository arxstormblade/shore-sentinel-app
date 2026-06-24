import Link from 'next/link';
import { Header, Filters, Pill } from '@/components/ui';
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

export default async function Audits() {
  const audits = (await loadLiveAudits()).map((audit) => ({
    id: audit.id,
    target: audit.display_name,
    summary: audit.hostname ?? 'Temporary audit target',
    env: audit.connection_mode,
    status: audit.status,
    promote: audit.promoted_target_id ? 'Promoted' : 'Promote to Managed Machine',
  }));

  return (
    <div className="stack">
      <Header eye="Audit History" title="One-time audits stay outside fleet health" desc="Create live ad hoc audits from scratch. No demo audit records are preloaded.">
        <Link className="btn" href={routePath('/audits/new')}>Run One-Time Audit</Link>
      </Header>
      <Filters name="Audit history" items={['Severity', 'Time range', 'Environment']} />
      <section className="panel">
        {audits.length ? audits.map((audit) => (
          <Link className="row" href={routePath('/audits/' + audit.id)} key={audit.id}>
            <span><b>{audit.target}</b><small>{audit.summary}</small></span>
            <span>{audit.promote}</span><Pill>{audit.status}</Pill>
          </Link>
        )) : <div className="empty"><h3>No one-time audits yet</h3><p>Run your first live one-time audit to populate this history.</p><Link className="btn" href={routePath('/audits/new')}>Run One-Time Audit</Link></div>}
      </section>
    </div>
  );
}
