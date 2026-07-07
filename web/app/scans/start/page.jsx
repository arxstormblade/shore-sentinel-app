import Link from 'next/link';
import { Header, Pill } from '@/components/ui';
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
        <h2>Choose the right operating mode</h2>
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
            <div className="round-icon" aria-hidden="true">▣</div>
            <div>
              <h3>One-time local audit</h3>
              <p>Pull the scanner bundle from GitHub and run it directly on the client machine. The reports stay on the client machine unless you choose to share or import them later.</p>
              <p className="note">Best for temporary evidence, offline machines, vendor-owned systems, or audits that should not enroll into fleet monitoring.</p>
              <Link className="btn alt" href={routePath('/audits/new')}>View local audit instructions</Link>
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
        <p className="note">One-time local audits are intentionally separate: they create local evidence packages and do not become managed monitoring records by default.</p>
      </section>

      <section className="panel" role="status" aria-live="polite">
        <h2>Need help deciding?</h2>
        <p>Use managed machines when you want ongoing visibility. Use a one-time local audit when the machine should keep artifacts locally and stay outside recurring monitoring.</p>
        <Link className="btn alt" href={routePath('/knowledgebase#managed-vs-local-audit')}>Read the decision guide</Link>
      </section>
    </div>
  );
}
