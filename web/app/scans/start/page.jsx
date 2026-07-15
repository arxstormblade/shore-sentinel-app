import Link from 'next/link';
import { Header } from '@/components/ui';
import { routePath } from '@/lib/paths';

export default function StartScan() {
  return (
    <div className="stack">
      <Header
        eye="Monitoring command center"
        title="Start with managed machine monitoring"
        desc="Shore Sentinel is built for enrolled machines: recurring posture, scan history, remediation ownership, and fleet-level reporting."
      >
        <Link className="btn" href={routePath('/inventory/new')}>Add managed machine</Link>
        <Link className="btn alt" href={routePath('/inventory')}>View inventory</Link>
      </Header>

      <section className="panel choice-panel">
        <h2>Managed monitoring is the app workflow</h2>
        <div className="action-cards">
          <article className="action-card panel">
            <div className="round-icon" aria-hidden="true">⊞</div>
            <div>
              <h3>Managed machine monitoring</h3>
              <p>Enroll endpoints that Shore Sentinel should monitor over time. Use this for recurring scan history, stale-machine visibility, remediation tracking, and executive fleet reporting.</p>
              <p className="note">Best for client workstations, servers, and endpoints that need continuous oversight.</p>
              <Link className="btn" href={routePath('/inventory/new')}>Add managed machine</Link>
            </div>
          </article>

          <article className="action-card panel">
            <div className="round-icon" aria-hidden="true">REP</div>
            <div>
              <h3>Reports and remediation</h3>
              <p>Review generated scan evidence, findings, and remediation work from managed-machine scans.</p>
              <p className="note">Standalone scanner usage is distributed from the GitHub README, outside the app workflow.</p>
              <Link className="btn alt" href={routePath('/scans-reports')}>View reports</Link>
            </div>
          </article>
        </div>
      </section>

      <section className="panel">
        <h2>What happens next for managed machines</h2>
        <ol className="guide-list">
          <li><b>Enroll the endpoint</b> — add machine metadata and the approved connection method.</li>
          <li><b>Run or schedule scans</b> — Shore Sentinel keeps scan history tied to the managed machine.</li>
          <li><b>Monitor posture</b> — dashboard, inventory, reports, and remediation views stay focused on fleet health.</li>
        </ol>
        <p className="note">Standalone scanner runs remain a GitHub distribution path and do not create app records by default.</p>
      </section>

      <section className="panel" role="status" aria-live="polite">
        <h2>Need help deciding?</h2>
        <p>Use the app when a machine should be part of recurring monitoring. Use the GitHub scanner instructions when a client only needs a local evidence package.</p>
        <Link className="btn alt" href={routePath('/knowledgebase#managed-machine-monitoring')}>Read the monitoring guide</Link>
      </section>
    </div>
  );
}
