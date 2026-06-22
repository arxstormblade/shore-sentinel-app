import { notFound } from 'next/navigation';
import { reports, byId } from '@/lib/data';

export const dynamic = 'force-dynamic';

export function generateStaticParams() { return []; }

export default function Report({ params }) {
  const report = byId(reports, params.id);
  if (!report) notFound();
  return null;
}
