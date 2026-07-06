import { unstable_noStore as noStore } from 'next/cache';
import UsersClient from './users-client';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default function UsersPage() {
  noStore();
  return <UsersClient />;
}
