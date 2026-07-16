'use client';

import Link from 'next/link';
import { useState } from 'react';
import { CompactPageHeader, OperationsDisclosure, Pill } from '@/components/ui';
import { appPath, routePath } from '@/lib/paths';

export default function NewMachine() {
  const [connectionMode, setConnectionMode] = useState('ssh_push');
  const [authMethod, setAuthMethod] = useState('password');
  const usesSsh = connectionMode === 'ssh_push';

  return (
    <div className="operations-page enrollment-page">
      <CompactPageHeader
        eyebrow="Managed machine enrollment"
        title="Add managed machine"
        description="Create the identity, ownership, and approved connection record required for recurring fleet monitoring."
        status={<Pill>Managed monitoring</Pill>}
      />

      <section className="operational-section enrollment-form-section" aria-labelledby="machine-enrollment-heading">
        <div className="operational-section-heading">
          <div>
            <p className="operational-section-eyebrow">Enrollment details</p>
            <h2 id="machine-enrollment-heading">Machine connection profile</h2>
          </div>
        </div>
        <form action={appPath('/api/targets')} method="post" className="enrollment-form">
          <fieldset>
            <legend>Identity and ownership</legend>
            <div className="enrollment-field-grid">
              <label>Hostname<input name="hostname" placeholder="workstation-hostname" required /></label>
              <label>FQDN<input name="fqdn" placeholder="workstation-hostname.example.local" /></label>
              <label>IP address<input name="ip_address" placeholder="10.20.18.14" /></label>
              <label>Owner team<input name="owner_team" placeholder="Desktop Engineering" /></label>
              <label>Platform<select name="platform" defaultValue="windows"><option value="windows">Windows</option><option value="linux">Linux</option><option value="macos">macOS</option></select></label>
            </div>
          </fieldset>

          <fieldset>
            <legend>Connection method</legend>
            <label>Connection mode<select name="connection_mode" value={connectionMode} onChange={(event) => setConnectionMode(event.target.value)}><option value="ssh_push">SSH push</option><option value="pull_checkin">Pull check-in</option><option value="both">Both</option></select></label>
            <p className="filter-hint">Use pull check-in for agent-driven connectivity. SSH credentials are required for SSH push.</p>
          </fieldset>

          {usesSsh ? (
            <OperationsDisclosure summary="Advanced connection settings">
              <fieldset className="choice-fieldset">
                <legend>SSH access</legend>
                <div className="enrollment-field-grid">
                  <label>SSH username<input name="ssh_username" placeholder="administrator" required={usesSsh} /></label>
                  <label>SSH port<input name="ssh_port" type="number" min="1" max="65535" defaultValue="22" required={usesSsh} /></label>
                  <label>Authentication method<select name="ssh_auth_method" value={authMethod} onChange={(event) => setAuthMethod(event.target.value)}><option value="password">Password</option><option value="ssh_key">SSH private key</option></select></label>
                </div>
                {authMethod === 'ssh_key' ? <label>SSH private key<textarea name="ssh_private_key" rows={7} placeholder="-----BEGIN OPENSSH PRIVATE KEY-----" required={usesSsh} /></label> : <label>SSH password<input name="ssh_password" type="password" placeholder="Stored encrypted by Shore Sentinel" required={usesSsh} /></label>}
                <small className="filter-hint">Credentials are sealed before storage and only the fingerprint is exposed in inventory metadata.</small>
              </fieldset>
            </OperationsDisclosure>
          ) : <p className="note">Pull check-in machines can be enrolled without storing SSH credentials.</p>}

          <div className="enrollment-submit-row"><button className="btn" type="submit">Create managed machine</button><Link href={routePath('/inventory')}>Cancel and return to inventory</Link></div>
        </form>
      </section>
    </div>
  );
}