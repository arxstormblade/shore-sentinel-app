import Link from 'next/link';
import { unstable_noStore as noStore } from 'next/cache';
import { CompactPageHeader } from '@/components/ui';
import { InventoryRegistry } from '@/components/inventory-registry-client';
import { routePath } from '@/lib/paths';
import { apiGet } from '@/lib/api-data';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function Inventory() {
  noStore();
  const machines = await apiGet('/targets');

  return (
    <div className="operations-page inventory-page">
      <CompactPageHeader
        eyebrow="Fleet registry"
        title="Managed machines"
        description="Filter the enrolled fleet by environment and current status, then open the machine dossier that needs attention."
        actions={<Link id="add-managed-machine" className="btn" href={routePath('/inventory/new')}>Add managed machine</Link>}
      />
      <InventoryRegistry machines={machines} />
    </div>
  );
}