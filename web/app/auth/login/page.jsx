import { redirect } from 'next/navigation';
import { routePath } from '@/lib/paths';
import { hasActiveSession } from '@/lib/session';
import { SignInForm } from '@/components/sign-in-form';

export default async function Login() {
  if (await hasActiveSession()) redirect(routePath('/dashboard'));
  return (
    <SignInForm
      title="Sign in to Shore Sentinel"
      description="This page keeps the login action obvious and does not expose any confidential operational details."
      registerLabel="Create a local account"
    />
  );
}
