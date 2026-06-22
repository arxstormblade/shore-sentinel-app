import Link from 'next/link';
import { Header, Pill } from '@/components/ui';
import { appPath, routePath } from '@/lib/paths';

export default function NewAudit() {
  return (
    <div className="stack">
      <Header
        eye="One-time audit launch"
        title="Run One-Time Audit"
        desc="Create an ephemeral audit target and push it into the scan pipeline without enrolling it as a managed machine."
      >
        <Pill>asset_mode = one_time_audit</Pill>
      </Header>

      <section className="panel auth-form">
        <form action={appPath('/api/one-time-audits')} method="post">
          <label>
            Display name
            <input name="display_name" placeholder="Audit target name" required />
          </label>
          <label>
            Hostname
            <input name="hostname" placeholder="Hostname or FQDN" />
          </label>
          <label>
            IP address
            <input name="ip_address" placeholder="IP address" />
          </label>
          <label>
            Connection mode
            <select name="connection_mode" defaultValue="ssh_push">
              <option value="ssh_push">ssh_push</option>
              <option value="temporary_runner">temporary_runner</option>
            </select>
          </label>
          <button className="btn" type="submit">Create audit</button>
        </form>
        <p className="auth-switch">
          Review existing runs in <Link href={routePath('/audits')}>Audit History</Link> or go back to <Link href={routePath('/dashboard')}>Dashboard</Link>.
        </p>
      </section>
    </div>
  );
}
