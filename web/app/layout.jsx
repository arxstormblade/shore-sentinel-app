import './globals.css';
import { Shell } from '@/components/ui';
import { getAuthenticatedUser } from '@/lib/session';

export const metadata = { title: 'Shore Sentinel', description: 'Security scanning, audit history, managed inventory, reports, and remediation control plane.' };
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function RootLayout({ children }) {
  const user = await getAuthenticatedUser();
  return <html lang="en"><body><Shell authenticated={Boolean(user)} user={user}>{children}</Shell></body></html>;
}
