import { redirect } from 'next/navigation';
import { SignInForm } from '@/components/sign-in-form';
import { getAuthenticatedUser } from '@/lib/session';

export default async function Landing() {
  if (await getAuthenticatedUser()) redirect('/dashboard');

  return (
    <div className="auth-landing">
      <SignInForm showRegisterLink={false} />
    </div>
  );
}
