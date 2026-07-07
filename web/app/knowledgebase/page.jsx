import Link from 'next/link';
import { Header, Pill } from '@/components/ui';
import { routePath } from '@/lib/paths';

export default function KB() {
  return (
    <div className="stack">
      <Header
        eye="Operational reference"
        title="Knowledgebase"
        desc="Use this guide to choose the right Shore Sentinel operating mode and interpret managed-machine monitoring data."
      >
        <Pill>managed monitoring first</Pill>
      </Header>

      <section className="panel" id="managed-vs-local-audit">
        <h2>Managed machine monitoring vs one-time local audit</h2>
        <p><b>Managed machines</b> are endpoints Shore Sentinel monitors over time. Use them for recurring scan history, stale-machine visibility, remediation ownership, and fleet-level reporting.</p>
        <p><b>One-time local audits</b> are standalone evidence runs. The client pulls the scanner bundle from GitHub, runs it locally, and keeps reports on that machine unless they intentionally share or import them later.</p>
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
            <h3>Use local audit when…</h3>
            <ul className="guide-list">
              <li>The machine is temporary, offline, or vendor-owned.</li>
              <li>Artifacts must stay on the client machine by default.</li>
              <li>You need quick evidence without enrollment.</li>
            </ul>
            <Link className="btn alt" href={routePath('/audits/new')}>View local audit command</Link>
          </article>
        </div>
      </section>

      <section className="panel" id="managed-check-in">
        <h2>How managed machines check in</h2>
        <p>Managed machines use approved pull-agent or SSH-push flows and feed fleet health views. Their scan runs, findings, artifacts, and remediation records stay tied to a managed inventory record.</p>
      </section>

      <section className="panel" id="audit-history">
        <h2>How local audit evidence stays separate</h2>
        <p>Local one-time audits do not affect fleet health by default. Treat their output folder as a local evidence package until a user intentionally imports or shares the reports.</p>
      </section>

      <section className="panel" id="remediation">
        <h2>Reading remediation severity and evidence</h2>
        <p>Severity colors support triage while operational panels stay solid and high contrast. Managed-machine remediation should be reviewed by owner, due date, business impact, and evidence artifact.</p>
      </section>
    </div>
  );
}
