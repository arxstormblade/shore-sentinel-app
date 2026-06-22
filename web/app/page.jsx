import { redirect } from 'next/navigation';
import { routePath } from '@/lib/paths';
import { hasActiveSession } from '@/lib/session';
import { SignInForm } from '@/components/sign-in-form';

export default async function Landing() {
  if (await hasActiveSession()) redirect(routePath('/dashboard'));
  return <SignInForm description="Sign in to reach the confidential Shore Sentinel control plane." registerLabel="Create a local account" />;
}
