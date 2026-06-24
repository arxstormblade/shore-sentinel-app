import Link from 'next/link';
import { Header } from '@/components/ui';
import { appPath, routePath } from '@/lib/paths';

export default function NewMachine() {
  return (
    <div className="stack">
      <Header
        eye="Managed machine enrollment"
        title="Add Managed Machine"
        desc="Enroll a machine when it should appear in fleet health, scan history, and operational reporting."
      >
        <Link className="btn alt" href={routePath('/knowledgebase')}>How managed machines check in</Link>
      </Header>

      <section className="panel auth-form">
        <form action={appPath('/api/targets')} method="post">
          <label>Hostname<input name="hostname" placeholder="ai-arx-svr" required /></label>
          <label>FQDN<input name="fqdn" placeholder="host.example.local" /></label>
          <label>IP address<input name="ip_address" placeholder="10.0.0.25" /></label>
          <label>Owner team<input name="owner_team" placeholder="IT Operations" /></label>
          <label>Platform
            <select name="platform" defaultValue="windows">
              <option value="windows">Windows</option>
              <option value="linux">Linux</option>
              <option value="macos">macOS</option>
            </select>
          </label>
          <fieldset className="choice-fieldset">
            <legend>Connection method</legend>
            <label className="choice-card">
              <input type="radio" name="connection_mode" value="ssh_push" defaultChecked />
              <span><b>Shore Sentinel connects to the machine</b><small>Use this when remote access is available and the server can start the scan.</small></span>
            </label>
            <label className="choice-card">
              <input type="radio" name="connection_mode" value="pull_checkin" />
              <span><b>Machine checks in to Shore Sentinel</b><small>Use this when the endpoint will run an agent or pull-based scanner.</small></span>
            </label>
          </fieldset>
          <p className="note">Not sure which connection method to use? <Link href={routePath('/knowledgebase')}>When to use one-time audit vs managed machine</Link>.</p>
          <button className="btn" type="submit">Create managed machine</button>
        </form>
        <p className="auth-switch">Review the fleet in <Link href={routePath('/inventory')}>Inventory</Link> or go back to <Link href={routePath('/dashboard')}>Dashboard</Link>.</p>
      </section>
    </div>
  );
}
