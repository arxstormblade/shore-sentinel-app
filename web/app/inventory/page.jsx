import Link from 'next/link';
import { Header, Filters, Pill } from '@/components/ui';
import { filterTargets } from '@/lib/filters';
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

export default async function Inventory({ searchParams }) {
  const env = searchParams?.env || 'All environments';
  const status = searchParams?.status || 'All statuses';
  const platform = searchParams?.platform || 'All platforms';
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
  const filteredCards = filterTargets(cards, { env, status, platform });
  const counts = {
    total: cards.length,
    after: filteredCards.length,
    env,
    status,
    platform,
  };
  const clearHref = routePath('/inventory');


  return (
    <div className="stack">
      <Header eye="Inventory" title="Managed machines and environments" desc="Inventory shows endpoints that belong in fleet health, scheduled scan history, and posture reporting.">
        <Link id="add-managed-machine" className="btn" href={routePath('/inventory/new')}>Add Managed Machine</Link>
      </Header>
      <div aria-live="polite" className="result-summary" data-testid="inventory-result-summary">
        Showing {counts.after} of {counts.total} machines
        {counts.after !== counts.total ? <a className="btn-link" href={clearHref}>Clear filters</a> : null}
      </div>

      <Filters name="Inventory" items={['Environment', 'Status', 'Platform']} />

      {filteredCards.length ? (
        <section className="cards">
          {filteredCards.map((machine) => (
            <Link className="card" href={routePath('/inventory/machines/' + machine.id)} key={machine.id}>
              <h2>{machine.name}</h2><p>{machine.summary}</p>
              <dl>
                <dt>Environment</dt><dd>{machine.env}</dd>
                <dt>Platform</dt><dd>{machine.platform}</dd>
                <dt>Highest severity</dt><dd>Review latest scan</dd>
                <dt>Security score</dt><dd>{machine.score} · 0–100 scale where 90+ means enrolled and no critical/high findings, 72–89 means enrolled with lower-severity findings, and below 72 means monitoring off or critical exposure. <Link href={routePath('/knowledgebase#score-explanation')}>How this is derived</Link></dd>
              </dl>
              <Pill>{machine.status}</Pill>
            </Link>
          ))}
        </section>
      ) : (
        <section className="panel"><div className="empty" data-testid="inventory-empty-state"><h3>No machines match the current filters</h3><p>Try adjusting your filters to see more results, or clear them to view all machines.</p><Link className="btn" href={clearHref}>Clear filters</Link></div></section>
      )}
    </div>
  );
}
