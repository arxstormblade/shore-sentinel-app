import { redirect } from 'next/navigation';
import { SignInForm } from '@/components/sign-in-form';
import { getAuthenticatedUser } from '@/lib/session';

export default async function Login() {
  if (await getAuthenticatedUser()) redirect('/dashboard');

  return (
    <div className="narrow auth-route">
      <SignInForm showRegisterLink />
    </div>
  );
}
