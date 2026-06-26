import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Header } from '@/components/ui';
import { SavedViewContent } from '@/components/saved-views';
import { routePath } from '@/lib/paths';

export const dynamic = 'force-dynamic';

const STATIC_SLUGS = ['high-findings', 'unreviewed-remediation', 'failed-scans', 'recently-completed'];
const ALL_VIEW_SLUGS = STATIC_SLUGS;

export function generateStaticParams() {
  return STATIC_SLUGS.map((slug) => ({ slug }));
}

const VIEW_TITLES = {
  'high-findings': 'High findings',
  'unreviewed-remediation': 'Unreviewed remediation',
  'failed-scans': 'Failed scans',
  'recently-completed': 'Recently completed scans',
};

export default async function SavedViewSlugPage({ params }) {
  const { slug } = await params;
  if (!ALL_VIEW_SLUGS.includes(slug)) notFound();

  const title = VIEW_TITLES[slug] || slug;

  return (
    <div className="stack">
      <Header
        eye="Saved views"
        title={title}
        desc="Curated operational view with preset filters for immediate triage."
      >
        <Link className="btn" href={routePath('/saved-views')}>All saved views</Link>
        <Link className="btn alt" href={routePath('/dashboard')}>Dashboard</Link>
      </Header>
      <nav className="saved-view-breadcrumb" aria-label="Breadcrumb">
        <Link href={routePath('/saved-views')}>Saved views</Link>
        <span aria-hidden="true">›</span>
        <span>{title}</span>
      </nav>
      <SavedViewContent slug={slug} />
    </div>
  );
}
