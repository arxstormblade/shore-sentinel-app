import Link from 'next/link';
import { Header, Filters, Pill } from '@/components/ui';
import { apiBase, machines } from '@/lib/data';
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
  const liveCards = liveTargets.map((target) => ({
    id: target.id,
    name: target.hostname,
    summary: target.owner_team
      ? `${target.owner_team} managed machine`
      : 'Managed machine enrolled through the live workflow.',
    env: target.environment_name ?? 'Unassigned',
    score: target.monitoring_enabled ? 90 : 72,
    status: target.status === 'unknown' ? 'Online' : target.status,
  }));
  const cards = [...liveCards, ...machines.filter((machine) => !liveCards.some((target) => target.id === machine.id))];

  return (
    <div className="stack">
      <Header
        eye="Inventory"
        title="Managed machines and environments"
        desc="Inventory is scoped to enrolled machines. Use environment and status filters only."
      >
        <Link id="add-managed-machine" className="btn" href={routePath('/inventory/new')}>Add Managed Machine</Link>
      </Header>
      <Filters name="Inventory" items={['Environment', 'Status']} />
      <p className="note">API list: {apiBase}/machines?asset_mode=managed_machine</p>
      <section className="cards">
        {cards.map((machine) => (
          <Link className="card" href={routePath('/inventory/machines/' + machine.id)} key={machine.id}>
            <h2>{machine.name}</h2>
            <p>{machine.summary}</p>
            <dl>
              <dt>Environment</dt>
              <dd>{machine.env}</dd>
              <dt>Score</dt>
              <dd>{machine.score}</dd>
            </dl>
            <Pill>{machine.status}</Pill>
          </Link>
        ))}
      </section>
    </div>
  );
}
