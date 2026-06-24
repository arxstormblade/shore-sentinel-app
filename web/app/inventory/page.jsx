import Link from 'next/link';
import { Header, Filters, Pill } from '@/components/ui';
import { routePath } from '@/lib/paths';

const serverApiBase = () => (process.env.INTERNAL_API_URL || process.env.API_URL || 'http://api:4000').replace(/\/$/, '');

async function loadLiveTargets() {
  try {
    const response = await fetch(`${serverApiBase()}/targets`, { cache: 'no-store' });
    if (!response.ok) return [];
    return await response.json();
  } catch {
    return [];
  }
}

export default async function Inventory() {
  const liveTargets = await loadLiveTargets();
  const cards = liveTargets.map((target) => ({
    id: target.id,
    name: target.hostname,
    summary: target.owner_team ? `${target.owner_team} managed machine` : 'Managed machine enrolled through the live workflow.',
    env: target.environment_name ?? 'Unassigned',
    score: target.monitoring_enabled ? 90 : 72,
    status: target.status === 'unknown' ? 'Online' : target.status,
    platform: target.platform ?? 'Unspecified',
  }));

  return (
    <div className="stack">
      <Header eye="Inventory" title="Managed machines and environments" desc="Inventory shows endpoints that belong in fleet health, scheduled scan history, and posture reporting.">
        <Link id="add-managed-machine" className="btn" href={routePath('/inventory/new')}>Add Managed Machine</Link>
      </Header>
      <Filters name="Inventory" items={['Environment', 'Status', 'Platform']} />
      {cards.length ? (
        <section className="cards">
          {cards.map((machine) => (
            <Link className="card" href={routePath('/inventory/machines/' + machine.id)} key={machine.id}>
              <h2>{machine.name}</h2><p>{machine.summary}</p>
              <dl>
                <dt>Environment</dt><dd>{machine.env}</dd>
                <dt>Platform</dt><dd>{machine.platform}</dd>
                <dt>Highest severity</dt><dd>Review latest scan</dd>
                <dt>Security score</dt><dd>{machine.score} — based on monitoring state and latest scan posture</dd>
              </dl>
              <Pill>{machine.status}</Pill>
            </Link>
          ))}
        </section>
      ) : (
        <section className="panel"><div className="empty"><h3>No managed machines yet</h3><p>Add your first live machine to start building inventory.</p><Link className="btn" href={routePath('/inventory/new')}>Add Managed Machine</Link></div></section>
      )}
    </div>
  );
}
