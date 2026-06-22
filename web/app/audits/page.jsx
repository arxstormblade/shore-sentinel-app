import Link from 'next/link';
import { Header, Filters, Pill } from '@/components/ui';
import { audits as seededAudits, apiBase } from '@/lib/data';
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
  const liveAudits = await loadLiveAudits();
  const liveCards = liveAudits.map((audit) => ({
    id: audit.id,
    target: audit.display_name,
    summary: audit.hostname ?? 'Temporary audit target',
    env: audit.connection_mode,
    status: audit.status,
    score: audit.connection_mode === 'temporary_runner' ? 82 : 79,
    severity: audit.connection_mode === 'temporary_runner' ? 'Medium' : 'High',
    promote: audit.promoted_target_id ? 'Promoted' : 'Promote to Managed Machine',
  }));
  const audits = [...liveCards, ...seededAudits.filter((audit) => !liveCards.some((live) => live.id === audit.id))];

  return (
    <div className="stack">
      <Header
        eye="Audit History"
        title="One-time audits stay outside fleet health"
        desc="Use this view for ad hoc validation, evidence, and temporary target reviews."
      >
        <Link className="btn" href={routePath('/audits/new')}>Run One-Time Audit</Link>
      </Header>
      <Filters name="Audit history" items={['Severity', 'Time range', 'Environment']} />
      <p className="note">API list: {apiBase}/audits?asset_mode=one_time_audit</p>
      <section className="panel">
        {audits.map((audit) => (
          <Link className="row" href={routePath('/audits/' + audit.id)} key={audit.id}>
            <span>
              <b>{audit.target}</b>
              <small>{audit.summary}</small>
            </span>
            <span>{audit.promote}</span>
            <Pill>{audit.status}</Pill>
          </Link>
        ))}
      </section>
    </div>
  );
}
