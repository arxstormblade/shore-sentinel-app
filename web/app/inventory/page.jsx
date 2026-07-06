import Link from 'next/link';
import { unstable_noStore as noStore } from 'next/cache';
import { Header, Filters, Pill, Empty } from '@/components/ui';
import { apiBase } from '@/lib/data';
import { routePath } from '@/lib/paths';
import { apiGet } from '@/lib/api-data';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function Inventory() {
  noStore();
  const machines = await apiGet('/targets');

  return (
    <div className="stack">
      <Header eye="Inventory" title="Managed machines and environments" desc="Inventory is scoped to enrolled machines. Use environment and status filters only.">
        <Link id="add-managed-machine" className="btn" href={routePath('/inventory/new')}>Add Managed Machine</Link>
      </Header>
      <Filters name="Inventory" items={['Environment', 'Status']} />
      <p className="note">API list: {apiBase}/targets?asset_mode=managed_machine</p>
      {machines.length === 0 ? (
        <Empty />
      ) : (
        <section className="cards">
          {machines.map((m) => (
            <Link className="card" href={routePath('/inventory/machines/' + m.id)} key={m.id}>
              <h2>{m.name || m.hostname}</h2>
              <p>{m.finding_count || 0} finding{m.finding_count === 1 ? '' : 's'} · {m.remediation_count || 0} remediation item{m.remediation_count === 1 ? '' : 's'}</p>
              <dl>
                <dt>Environment</dt><dd>{m.env}</dd>
                <dt>Owner</dt><dd>{m.owner}</dd>
                <dt>Connection</dt><dd>{m.connection_mode}</dd>
              </dl>
              <Pill>{m.status}</Pill>
            </Link>
          ))}
        </section>
      )}
    </div>
  );
}
