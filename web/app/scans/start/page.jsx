import { redirect } from 'next/navigation';
import { routePath } from '@/lib/paths';

export default function StartScanRedirect() {
  redirect(routePath('/inventory'));
}
