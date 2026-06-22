import { notFound } from 'next/navigation';
import { getSessionUser } from '@/lib/session';
import { MachineDetailClient } from '@/components/machine-detail-client';

const serverApiBase = () => (process.env.INTERNAL_API_URL || process.env.API_URL || 'http://api:4000').replace(/\/$/, '');

export const dynamic = 'force-dynamic';

export function generateStaticParams() { return []; }

async function loadTarget(id) {
  try {
    const response = await fetch(`${serverApiBase()}/targets/${id}`, { cache: 'no-store' });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

async function loadTargetRuns(id) {
  try {
    const response = await fetch(`${serverApiBase()}/targets/${id}/scan-runs`, { cache: 'no-store' });
    if (!response.ok) return { runs: [] };
    return await response.json();
  } catch {
    return { runs: [] };
  }
}

export default async function Machine({ params }) {
  const [live, session, runsPayload] = await Promise.all([loadTarget(params.id), getSessionUser(), loadTargetRuns(params.id)]);
  if (!live) notFound();

  const machine = {
    id: live.id,
    name: live.hostname,
    fqdn: live.fqdn,
    ip_address: live.ip_address,
    env: live.environment_name ?? 'Unassigned',
    owner: live.owner_team ?? 'Unassigned',
    platform: live.platform ?? 'windows',
    connection_mode: live.connection_mode ?? 'ssh_push',
    monitoring_enabled: live.monitoring_enabled ?? true,
    summary: live.fqdn ? `${live.fqdn} enrolled through the managed machine workflow.` : 'Managed machine enrolled through the live workflow.',
    status: live.status === 'unknown' ? 'Online' : live.status,
    score: live.monitoring_enabled ? 90 : 72,
  };

  const roles = Array.isArray(session?.roles) ? session.roles.map((role) => String(role).toLowerCase()) : [];
  const canManage = roles.includes('admin');

  return (
    <MachineDetailClient machine={machine} initialRuns={runsPayload.runs ?? []} canManage={canManage} />
  );
}
