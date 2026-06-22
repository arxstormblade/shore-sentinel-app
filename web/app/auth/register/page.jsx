import Link from 'next/link';
import { Header } from '@/components/ui';
import { PublicTopBar } from '@/components/sign-in-form';
import { appPath, routePath } from '@/lib/paths';

export default function Register() {
  return (
    <>
      <PublicTopBar actionHref={routePath('/auth/login')} actionLabel="Sign in" />
      <div className="narrow auth-route">
      <Header eye="Local authentication" title="Create a local operator account" desc="Create-account submissions stay on the web origin and are forwarded server-side to the API." />
      <form className="panel auth-form" action={appPath('/api/auth/register')} method="post">
        <label>Name<input name="name" autoComplete="name" required /></label>
        <label>Email<input name="email" type="email" autoComplete="email" required /></label>
        <label>Password<input name="password" type="password" autoComplete="new-password" minLength="12" required /></label>
        <button className="btn" type="submit">Create local account</button>
        <p>After successful account creation, continue to <Link href={routePath('/dashboard')}>/dashboard</Link>.</p>
      </form>
        <Link href={routePath('/auth/login')}>Sign in</Link>
      </div>
    </>
  );
}
