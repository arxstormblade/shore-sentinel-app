import Link from 'next/link';
import { Header, Pill } from '@/components/ui';
import { routePath } from '@/lib/paths';

const repoUrl = 'https://github.com/arxstormblade/shore-sentinel-app.git';

export default function NewAudit() {
  const command = `git clone --depth 1 --branch v0.3.10 ${repoUrl}
cd shore-sentinel-app
python3 scanner-bundle/bin/Agent_Security_Selfcheck_v3.4.0.py \\
  --target . \\
  --out-dir ./shore-sentinel-local-audit-reports \\
  --exit-zero`;

  return (
    <div className="stack">
      <Header
        eye="One-time local audit"
        title="Run a local one-time audit"
        desc="Pull the scanner bundle from GitHub, run it on the client machine, and keep reports and artifacts local unless you intentionally share them."
      >
        <Pill>local evidence only</Pill>
        <Link className="btn alt" href={repoUrl}>Open GitHub repo</Link>
      </Header>

      <section className="panel">
        <h2>Linux/macOS command</h2>
        <p>Run this on the machine you want to audit. It does not enroll the machine into managed monitoring and does not upload reports to Shore Sentinel.</p>
        <pre><code>{command}</code></pre>
        <p className="note">Reports are written to <code>./shore-sentinel-local-audit-reports</code> on the client machine.</p>
      </section>

      <section className="panel">
        <h2>What this does</h2>
        <ol className="guide-list">
          <li><b>Downloads the scanner source</b> from the tagged Shore Sentinel GitHub release line.</li>
          <li><b>Runs the read-only scanner locally</b> against the current directory or a path you set with <code>--target</code>.</li>
          <li><b>Saves local artifacts</b> such as JSON, Markdown, SARIF, and PDF reports under the output folder.</li>
        </ol>
      </section>

      <section className="panel">
        <h2>What this does not do</h2>
        <ul className="guide-list">
          <li>It does not create a managed machine record.</li>
          <li>It does not store SSH credentials in Shore Sentinel.</li>
          <li>It does not upload artifacts to the app by default.</li>
          <li>It does not provide recurring monitoring, dashboards, or stale-machine alerts.</li>
        </ul>
      </section>

      <section className="panel">
        <h2>Security note</h2>
        <p>Local audit reports may include hostnames, system inventory, package versions, findings, and remediation evidence. Store and share them according to the client security policy.</p>
        <p className="note">If the machine needs ongoing visibility, use <Link href={routePath('/inventory/new')}>managed machine enrollment</Link> instead.</p>
      </section>
    </div>
  );
}
