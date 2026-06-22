import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Header, Pill } from '@/components/ui';
import { routePath } from '@/lib/paths';

const serverApiBase = () => (process.env.INTERNAL_API_URL || process.env.API_URL || 'http://api:4000').replace(/\/$/, '');

export const dynamic = 'force-dynamic';

export function generateStaticParams() { return []; }

async function loadTarget(id) {
  try {
    const response = await fetch(`${serverApiBase()}/targets/${id}`, { cache: 'no-store' });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

export default async function Machine({ params }) {
  const live = await loadTarget(params.id);
  if (!live) notFound();

  const machine = {
    id: live.id,
    name: live.hostname,
    env: live.environment_name ?? 'Unassigned',
    owner: live.owner_team ?? 'Unassigned',
    summary: live.fqdn ? `${live.fqdn} enrolled through the managed machine workflow.` : 'Managed machine enrolled through the live workflow.',
    status: live.status === 'unknown' ? 'Online' : live.status,
    score: live.monitoring_enabled ? 90 : 72,
  };

  return (
    <div className="stack">
      <Header eye="Managed machine" title={machine.name} desc={machine.summary}><Pill>{machine.status}</Pill></Header>
      <section className="grid"><article className="panel"><h2>Asset details</h2><p>Environment: {machine.env}</p><p>Owner: {machine.owner}</p><p>Asset mode: managed_machine</p></article><article className="panel"><h2>Posture</h2><b className="score">{machine.score}</b></article></section>
      <section className="panel"><h2>Reports</h2><div className="empty"><p>No reports have been generated for this machine yet.</p><Link className="btn" href={routePath('/scans-reports')}>View Scans & Reports</Link></div></section>
      <section className="panel"><h2>Remediation</h2><div className="empty"><p>No remediation items have been created for this machine yet.</p></div></section>
    </div>
  );
}
