import { unstable_noStore as noStore } from 'next/cache';
import { notFound } from 'next/navigation';
import { MachineDetailClient } from '@/components/machine-detail-client';
import { apiGet } from '@/lib/api-data';
import { getAuthenticatedUser } from '@/lib/session';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function Machine({ params }) {
  noStore();
  const { id } = await params;

  let live;
  let runsPayload;
  try {
    [live, runsPayload] = await Promise.all([
      apiGet('/targets/' + id),
      apiGet('/targets/' + id + '/scan-runs').catch(() => ({ runs: [] })),
    ]);
  } catch (error) {
    if (String(error.message || error).includes('400')) notFound();
    throw error;
  }

  const session = await getAuthenticatedUser();
  const roles = Array.isArray(session?.roles) ? session.roles.map((role) => String(role).toLowerCase()) : [];

  const machine = {
    id: live.id,
    name: live.name || live.hostname,
    fqdn: live.fqdn,
    ip_address: live.ip_address,
    env: live.env || live.environment_name || 'Unassigned',
    owner: live.owner || live.owner_team || 'Unassigned owner',
    platform: live.platform || 'Unknown platform',
    status: live.status || 'unknown',
    connection_mode: live.connection_mode || 'ssh_push',
    monitoring_enabled: live.monitoring_enabled ?? true,
    ssh_auth_method: live.ssh_auth_method || null,
    ssh_port: live.ssh_port || null,
    ssh_username: live.ssh_username || null,
    finding_count: live.finding_count || 0,
    remediation_count: live.remediation_count || 0,
    reports: live.reports || [],
    remediations: live.remediations || [],
    last_seen_at: live.last_seen_at || null,
    last_successful_scan_at: live.last_successful_scan_at || null,
    summary: live.fqdn
      ? `${live.fqdn} · ${live.platform || 'Managed endpoint'}`
      : `${live.platform || 'Managed endpoint'} monitored by ${live.owner || live.owner_team || 'the security team'}`,
  };

  return (
    <MachineDetailClient
      machine={machine}
      initialRuns={runsPayload?.runs || machine.reports}
      canManage={roles.includes('admin')}
    />
  );
}
