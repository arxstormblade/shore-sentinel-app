import Link from 'next/link';
import { CompactPageHeader, OperationalSection } from '@/components/ui';
import { SavedViewsPanel } from '@/components/saved-views';
import { routePath } from '@/lib/paths';

export const dynamic = 'force-dynamic';

export default async function SavedViewsPage() {
  return (
    <div className="operations-page saved-views-page">
      <CompactPageHeader
        eyebrow="Saved views"
        title="Operational views"
        description="Curated entry points for findings and scans that need your attention. Share the link and land on the filtered evidence."
        actions={<Link className="btn" href={routePath('/dashboard')}>Back to dashboard</Link>}
      />
      <OperationalSection eyebrow="View library" title="Saved operational views"><SavedViewsPanel /></OperationalSection>
    </div>
  );
}
