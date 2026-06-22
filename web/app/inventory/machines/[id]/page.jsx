import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Header, Pill } from '@/components/ui';
import { machines, reports, remediations, byId } from '@/lib/data';
import { routePath } from '@/lib/paths';

const serverApiBase = () => (process.env.INTERNAL_API_URL || process.env.API_URL || 'http://api:4000').replace(/\/$/, '');

export function generateStaticParams() {
  return machines.map((machine) => ({ id: machine.id }));
}

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
  const seeded = byId(machines, params.id);
  const machine = live
    ? {
        id: live.id,
        name: live.hostname,
        env: live.environment_name ?? 'Unassigned',
        owner: live.owner_team ?? 'Unassigned',
        summary: live.fqdn
          ? `${live.fqdn} enrolled through the managed machine workflow.`
          : 'Managed machine enrolled through the live workflow.',
        status: live.status === 'unknown' ? 'Online' : live.status,
        score: live.monitoring_enabled ? 90 : 72,
      }
    : seeded;

  if (!machine) notFound();

  return (
    <div className="stack">
      <Header eye="Managed machine" title={machine.name} desc={machine.summary}>
        <Pill>{machine.status}</Pill>
      </Header>
      <section className="grid">
        <article className="panel">
          <h2>Asset details</h2>
          <p>Environment: {machine.env}</p>
          <p>Owner: {machine.owner}</p>
          <p>Asset mode: managed_machine</p>
        </article>
        <article className="panel">
          <h2>Posture</h2>
          <b className="score">{machine.score}</b>
        </article>
      </section>
      <section className="panel">
        <h2>Reports</h2>
        {reports.filter((report) => report.machineId === machine.id).map((report) => (
          <Link className="row" href={routePath('/scans-reports/reports/' + report.id)} key={report.id}>
            {report.title}
            <Pill>{report.status}</Pill>
          </Link>
        ))}
      </section>
      <section className="panel">
        <h2>Remediation</h2>
        {remediations.filter((item) => item.asset === machine.name).map((item) => (
          <Link className="row" href={routePath('/remediation/' + item.id)} key={item.id}>
            {item.title}
            <Pill>{item.severity}</Pill>
          </Link>
        ))}
      </section>
    </div>
  );
}
