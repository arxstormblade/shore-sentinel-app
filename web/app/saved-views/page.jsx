import Link from 'next/link';
import { Header } from '@/components/ui';
import { SavedViewsPanel } from '@/components/saved-views';
import { routePath } from '@/lib/paths';

export const dynamic = 'force-dynamic';

export default async function SavedViewsPage() {
  return (
    <div className="stack">
      <Header
        eye="Saved views"
        title="Operational views"
        desc="Curated entry points for the findings and scans that need your attention. Each view applies a preset filter so you can share a link and land on the right data."
      >
        <Link className="btn" href={routePath('/dashboard')}>Back to dashboard</Link>
      </Header>
      <SavedViewsPanel />
    </div>
  );
}
