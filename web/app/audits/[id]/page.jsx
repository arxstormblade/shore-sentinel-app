import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Header, Pill } from '@/components/ui';
import { routePath } from '@/lib/paths';

const serverApiBase = () => (process.env.INTERNAL_API_URL || process.env.API_URL || 'http://api:4000').replace(/\/$/, '');

export const dynamic = 'force-dynamic';

export function generateStaticParams() { return []; }

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
  if (!live) notFound();

  const audit = {
    id: live.id,
    target: live.display_name,
    summary: live.hostname ?? 'Temporary audit target',
    env: live.connection_mode,
    status: live.status,
    score: 0,
    severity: 'Pending',
    promote: live.promoted_target_id ? 'Promoted' : 'Promote to Managed Machine',
  };

  return (
    <div className="stack">
      <Header eye="One-time audit" title={audit.target} desc={audit.summary}><Link className="btn alt" href={routePath('/inventory/new')}>{audit.promote}</Link></Header>
      <section className="grid"><article className="panel"><h2>Audit details</h2><p>Asset mode: one_time_audit</p><p>Environment: {audit.env}</p><p>Status: {audit.status}</p></article><article className="panel"><h2>Evidence posture</h2><b className="score" title="Score reflects severity mix of findings produced by this audit">{audit.score}</b><Pill title="Highest severity detected by this audit">{audit.severity}</Pill><p className="score-explain">Score and severity come from scanner findings produced by this audit. Severity ranks first, then confidence and blast radius determine action order. <Link href={routePath('/knowledgebase#prioritization')}>How findings are prioritized</Link></p></article></section>
      <section className="panel"><h2>Audit reports</h2><div className="empty"><p>No report has been generated for this audit yet.</p><Link className="btn" href={routePath('/scans-reports')}>View Scans & Reports</Link></div></section>
    </div>
  );
}
