import Link from 'next/link';
import { Header, Pill } from '@/components/ui';
import { routePath } from '@/lib/paths';

export default function KB() {
  return (
    <div className="stack">
      <Header
        eye="Operational reference"
        title="Knowledgebase"
        desc="Use this guide to operate managed-machine monitoring and interpret scan evidence."
      >
        <Pill>managed monitoring first</Pill>
      </Header>

      <section className="panel" id="managed-machine-monitoring">
        <h2>Managed machine monitoring</h2>
        <p><b>Managed machines</b> are endpoints Shore Sentinel monitors over time. Use them for recurring scan history, stale-machine visibility, remediation ownership, and fleet-level reporting.</p>
        <div className="action-cards">
          <article className="action-card panel">
            <h3>Use managed machines when…</h3>
            <ul className="guide-list">
              <li>The endpoint belongs in recurring monitoring.</li>
              <li>You need scheduled scans or scan history.</li>
              <li>You want dashboard trends and remediation tracking.</li>
            </ul>
            <Link className="btn" href={routePath('/inventory/new')}>Add managed machine</Link>
          </article>
          <article className="action-card panel">
            <h3>Use reports when…</h3>
            <ul className="guide-list">
              <li>You need evidence generated from managed scans.</li>
              <li>You want findings, artifacts, and remediation in one place.</li>
              <li>You need business-ready scan history for enrolled machines.</li>
            </ul>
            <Link className="btn alt" href={routePath('/scans-reports')}>View reports</Link>
          </article>
        </div>
      </section>

      <section className="panel" id="managed-check-in">
        <h2>How managed machines check in</h2>
        <p>Managed machines use approved pull-agent or SSH-push flows and feed fleet health views. Their scan runs, findings, artifacts, and remediation records stay tied to a managed inventory record.</p>
      </section>

      <section className="panel" id="remediation">
        <h2>Reading remediation severity and evidence</h2>
        <p>Severity colors support triage while operational panels stay solid and high contrast. Managed-machine remediation should be reviewed by owner, due date, business impact, and evidence artifact.</p>
      </section>
    </div>
  );
}
