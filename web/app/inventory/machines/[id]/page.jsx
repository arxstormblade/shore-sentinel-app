import Link from 'next/link';
import { unstable_noStore as noStore } from 'next/cache';
import { notFound } from 'next/navigation';
import { Header, Pill } from '@/components/ui';
import { routePath } from '@/lib/paths';
import { apiGet } from '@/lib/api-data';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function Machine({ params }) {
  noStore();
  const { id } = await params;
  let machine;
  try {
    machine = await apiGet('/targets/' + id);
  } catch (error) {
    if (String(error.message || error).includes('400')) notFound();
    throw error;
  }

  return (
    <div className="stack">
      <Header eye="Managed machine" title={machine.name || machine.hostname} desc={`${machine.platform || 'unknown'} target managed by ${machine.owner || 'Unassigned owner'}`}>
        <Pill>{machine.status}</Pill>
      </Header>
      <section className="grid">
        <article className="panel">
          <h2>Asset details</h2>
          <p>Environment: {machine.env}</p>
          <p>Owner: {machine.owner}</p>
          <p>Connection: {machine.connection_mode}</p>
          {machine.ssh_username ? <p>SSH user: {machine.ssh_username}{machine.ssh_port ? `:${machine.ssh_port}` : ''}</p> : null}
          {machine.ssh_auth_method ? <p>SSH auth: {machine.ssh_auth_method === 'ssh_key' ? 'SSH key' : 'Password'}</p> : null}
          <p>Asset mode: managed_machine</p>
        </article>
        <article className="panel">
          <h2>Posture</h2>
          <b className="score">{machine.finding_count || 0}</b>
          <p>{machine.remediation_count || 0} open remediation item{machine.remediation_count === 1 ? '' : 's'}</p>
        </article>
      </section>
      <section className="panel">
        <h2>Reports</h2>
        {(machine.reports || []).length === 0 ? <p className="note">No scan reports exist for this machine yet.</p> : (machine.reports || []).map((r) => (
          <Link className="row" href={routePath('/scans-reports/reports/' + r.id)} key={r.id}>
            <span><b>{r.subject_type} run</b><small>{r.created_at}</small></span><Pill>{r.status}</Pill>
          </Link>
        ))}
      </section>
      <section className="panel">
        <h2>Remediation</h2>
        {(machine.remediations || []).length === 0 ? <p className="note">No remediation items are open for this machine.</p> : (machine.remediations || []).map((r) => (
          <Link className="row" href={routePath('/remediation/' + r.id)} key={r.id}>
            <span><b>{r.title}</b><small>{r.status}</small></span><Pill>{r.severity}</Pill>
          </Link>
        ))}
      </section>
    </div>
  );
}
