import Link from 'next/link';
import { CompactPageHeader, Pill } from '@/components/ui';
import NewMachineForm from '@/components/new-machine-form';
import { routePath } from '@/lib/paths';
import { getAuthenticatedUser } from '@/lib/session';

export default async function NewMachine() {
  const user = await getAuthenticatedUser();
  const canEnroll = Array.isArray(user?.roles) && user.roles.some((role) => ['admin', 'operator'].includes(String(role).toLowerCase()));
  if (canEnroll) return <NewMachineForm />;
  return <div className="operations-page enrollment-page"><CompactPageHeader eyebrow="Managed machine enrollment" title="Enrollment restricted" description="Your role has read-only access to managed-machine enrollment." status={<Pill>Read only</Pill>} actions={<Link className="btn alt" href={routePath('/inventory')}>Return to inventory</Link>} /></div>;
}