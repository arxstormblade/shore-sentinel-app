import { unstable_noStore as noStore } from 'next/cache';
import { notFound } from 'next/navigation';
import { MachineDetailClient } from '@/components/machine-detail-client';
import { apiGet } from '@/lib/api-data';
import { openRemediationItems, selectInitialRuns } from '@/lib/machine-detail-data';
import { getAuthenticatedUser } from '@/lib/session';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

async function enrichRemediations(remediations) {
  const items = Array.isArray(remediations) ? remediations : [];
  return Promise.all(items.map(async (item) => {
    if (!item?.id || item.action || item.instructions || item.guidance || item.evidence_summary) return item;
    try {
      const detail = await apiGet('/remediation/' + item.id);
      return { ...item, ...detail };
    } catch {
      return item;
    }
  }));
}

export default async function Machine({ params }) {
  noStore();
  const { id } = await params;

  let live;
  try {
    live = await apiGet('/targets/' + id);
  } catch (error) {
    if (String(error.message || error).includes('400')) notFound();
    throw error;
  }

  let runsPayload = null;
  let runHistoryUnavailable = false;
  try {
    runsPayload = await apiGet('/targets/' + id + '/scan-runs');
  } catch {
    runHistoryUnavailable = true;
  }

  const session = await getAuthenticatedUser();
  const roles = Array.isArray(session?.roles) ? session.roles.map((role) => String(role).toLowerCase()) : [];
  const remediations = await enrichRemediations(openRemediationItems(live.remediations));

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
    remediation_count: live.remediation_count ?? null,
    reports: live.reports || [],
    remediations,
    last_seen_at: live.last_seen_at || null,
    last_successful_scan_at: live.last_successful_scan_at || null,
    summary: live.fqdn
      ? `${live.fqdn} · ${live.platform || 'Managed endpoint'}`
      : `${live.platform || 'Managed endpoint'} monitored by ${live.owner || live.owner_team || 'the security team'}`,
  };

  return (
    <MachineDetailClient
      machine={machine}
      initialRuns={selectInitialRuns(runsPayload, machine.reports)}
      runHistoryUnavailable={runHistoryUnavailable}
      canScan={roles.some((role) => ['admin', 'operator', 'analyst'].includes(role))}
      canEdit={roles.some((role) => ['admin', 'operator'].includes(role))}
      canDelete={roles.includes('admin')}
    />
  );
}
