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
<<<<<<< HEAD
        <h2>What happens next for managed machines</h2>
        <ol className="guide-list">
          <li><b>Enroll the endpoint</b> — add machine metadata and the approved connection method.</li>
          <li><b>Run or schedule scans</b> — Shore Sentinel keeps scan history tied to the managed machine.</li>
          <li><b>Monitor posture</b> — dashboard, inventory, reports, and remediation views stay focused on fleet health.</li>
        </ol>
        <p className="note">Standalone scanner runs remain a GitHub distribution path and do not create app records by default.</p>
=======
        <h2>Start a one-time audit now</h2>
        <p>Submit below to create an ephemeral audit target, push the job into the scan pipeline, and land on the live progress page with the completed report.</p>

        <form action={appPath('/api/scans/start')} method="post">
          <label>
            Display name
            <input name="display_name" placeholder="Audit target name" required aria-describedby="name-help" />
          </label>
          <p className="note" id="name-help">A short label so you can find this report in Scans &amp; Reports later.</p>

          <label>
            Hostname or FQDN
            <input name="hostname" placeholder="host.example.local" aria-describedby="host-help" />
          </label>
          <p className="note" id="host-help">Optional. The DNS name if you know it.</p>

          <label>
            IP address
            <input name="ip_address" placeholder="10.0.0.25" required aria-describedby="ip-help" />
          </label>
          <p className="note" id="ip-help">The endpoint address that Shore Sentinel connects to.</p>

          <label>
            How should this scan connect?
            <select name="connection_mode" defaultValue="ssh_push" aria-describedby="conn-help">
              <option value="ssh_push">SSH push — Shore Sentinel connects to the machine</option>
              <option value="temporary_runner">Pull check-in — the machine runs a temporary runner and sends results back</option>
            </select>
          </label>
          <p className="note" id="conn-help">Use SSH push for a direct remote scan. Use pull check-in when the endpoint will execute a temporary runner locally.</p>

          <button className="btn" type="submit">Start scan</button>
        </form>
      </section>

      <section className="panel">
        <h2>Or enroll a managed machine</h2>
        <p>Add a managed machine to keep scan history, posture trends, and recurring reports in one place.</p>
        <Link className="btn" href={routePath('/inventory/new')}>Add &amp; scan machine</Link>
>>>>>>> 0f0fa96 (Add managed machine credential UI refinements)
      </section>

      <section className="panel" role="status" aria-live="polite">
        <h2>Need help deciding?</h2>
        <p>Use the app when a machine should be part of recurring monitoring. Use the GitHub scanner instructions when a client only needs a local evidence package.</p>
        <Link className="btn alt" href={routePath('/knowledgebase#managed-machine-monitoring')}>Read the monitoring guide</Link>
      </section>
    </div>
  );
}
