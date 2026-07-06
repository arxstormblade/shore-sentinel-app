import { unstable_noStore as noStore } from 'next/cache';
import { apiGet } from '@/lib/api-data';
import UpdateClient from './update-client';

export const dynamic = 'force-dynamic';

export default async function SystemUpdatePage() {
  noStore();
  const initialStatus = await apiGet('/system/update');
  return <UpdateClient initialStatus={initialStatus} />;
}
