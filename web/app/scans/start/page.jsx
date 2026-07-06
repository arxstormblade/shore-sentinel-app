import Link from 'next/link';
import { Header } from '@/components/ui';
import { appPath, routePath } from '@/lib/paths';

export default function StartScan() {
  return (
    <div className="stack">
      <Header
        eye="Start a scan"
        title="Choose how to scan"
        desc="Pick one path. Each creates the right target type, starts a scan, and takes you to live progress and the completed report."
      >
        <Link className="btn alt" href={routePath('/knowledgebase')}>When to use one-time audit vs managed machine</Link>
      </Header>

      <section className="panel choice-panel">
        <h2>What kind of scan do you need?</h2>
        <div className="action-cards">
          <article className="action-card panel">
            <div className="round-icon" aria-hidden="true">▣</div>
            <div>
              <h3>One-time audit</h3>
              <p>Collect evidence from a single endpoint without adding it to your fleet. The scan runs now and the report goes straight to handoff.</p>
              <p className="note">No fleet history, no recurring checks. Use this for temporary evidence.</p>
            </div>
          </article>

          <article className="action-card panel">
            <div className="round-icon" aria-hidden="true">⊞</div>
            <div>
              <h3>Managed machine</h3>
              <p>Enroll an endpoint for ongoing inventory, scheduled scan history, and fleet posture across your whole managed machine fleet.</p>
              <p className="note">Best for endpoints that should appear in recurring reports.</p>
            </div>
          </article>
        </div>
      </section>

      <section className="panel">
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
      </section>

      <section className="panel" role="status" aria-live="polite">
        <h2>What happens next</h2>
        <ol className="guide-list">
          <li><b>Scan starts</b> — the job enters the pipeline and appears under <Link href={routePath('/scans-reports')}>Scans &amp; Reports</Link> as &ldquo;running&rdquo;.</li>
          <li><b>Progress updates</b> — visit the scan progress page to watch findings arrive live.</li>
          <li><b>Report completed</b> — when the job finishes the completed report page shows findings, severity, and remediation guidance.</li>
        </ol>
        <p className="note">You can return to the <Link href={routePath('/scans-reports')}>Scans &amp; Reports</Link> list at any time to find running scans and completed reports.</p>
      </section>
    </div>
  );
}
