import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Header, Pill } from '@/components/ui';
import { audits as seededAudits, reports, byId } from '@/lib/data';
import { routePath } from '@/lib/paths';

const serverApiBase = () => (process.env.INTERNAL_API_URL || process.env.API_URL || 'http://api:4000').replace(/\/$/, '');

export function generateStaticParams() {
  return seededAudits.map((audit) => ({ id: audit.id }));
}

async function loadLiveAudit(id) {
  try {
    const response = await fetch(`${serverApiBase()}/one-time-audits/${id}`, { cache: 'no-store' });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

export default async function Audit({ params }) {
  const live = await loadLiveAudit(params.id);
  const seeded = byId(seededAudits, params.id);
  const audit = live
    ? {
        id: live.id,
        target: live.display_name,
        summary: live.hostname ?? 'Temporary audit target',
        env: live.connection_mode,
        status: live.status,
        score: live.connection_mode === 'temporary_runner' ? 82 : 79,
        severity: live.connection_mode === 'temporary_runner' ? 'Medium' : 'High',
        promote: live.promoted_target_id ? 'Promoted' : 'Promote to Managed Machine',
      }
    : seeded;

  if (!audit) notFound();

  return (
    <div className="stack">
      <Header eye="One-time audit" title={audit.target} desc={audit.summary}>
        <Link className="btn alt" href={routePath('/inventory/new')}>{audit.promote}</Link>
      </Header>
      <section className="grid">
        <article className="panel">
          <h2>Audit details</h2>
          <p>Asset mode: one_time_audit</p>
          <p>Environment: {audit.env}</p>
          <p>Status: {audit.status}</p>
        </article>
        <article className="panel">
          <h2>Evidence posture</h2>
          <b className="score">{audit.score}</b>
          <Pill>{audit.severity}</Pill>
        </article>
      </section>
      <section className="panel">
        <h2>Audit reports</h2>
        {reports.filter((report) => report.auditId === audit.id).map((report) => (
          <Link className="row" href={routePath('/scans-reports/reports/' + report.id)} key={report.id}>
            {report.title}
            <Pill>{report.status}</Pill>
          </Link>
        ))}
      </section>
    </div>
  );
}
