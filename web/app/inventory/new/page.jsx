import Link from 'next/link';
import { Header, Pill } from '@/components/ui';
import { appPath, routePath } from '@/lib/paths';

export default function NewMachine() {
  return (
    <div className="stack">
      <Header
        eye="Managed machine enrollment"
        title="Add Managed Machine"
        desc="Enroll a machine so it appears in inventory, fleet health, and future scan history."
      >
        <Pill>asset_mode = managed_machine</Pill>
      </Header>

      <section className="panel auth-form">
        <form action={appPath('/api/targets')} method="post">
          <label>
            Hostname
            <input name="hostname" placeholder="workstation-hostname" required />
          </label>
          <label>
            FQDN
            <input name="fqdn" placeholder="workstation-hostname.example.local" />
          </label>
          <label>
            IP address
            <input name="ip_address" placeholder="10.20.18.14" />
          </label>
          <label>
            Owner team
            <input name="owner_team" placeholder="Desktop Engineering" />
          </label>
          <label>
            Platform
            <select name="platform" defaultValue="windows">
              <option value="windows">windows</option>
              <option value="linux">linux</option>
              <option value="macos">macos</option>
            </select>
          </label>
          <label>
            Connection mode
            <select name="connection_mode" defaultValue="ssh_push">
              <option value="ssh_push">ssh_push</option>
              <option value="pull_checkin">pull_checkin</option>
              <option value="both">both</option>
            </select>
          </label>
          <button className="btn" type="submit">Create managed machine</button>
        </form>
        <p className="auth-switch">
          Review the fleet in <Link href={routePath('/inventory')}>Inventory</Link> or go back to <Link href={routePath('/dashboard')}>Dashboard</Link>.
        </p>
      </section>
    </div>
  );
}
