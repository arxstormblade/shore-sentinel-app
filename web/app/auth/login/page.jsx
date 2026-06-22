import Link from 'next/link';
import { Header } from '@/components/ui';
import { appPath, routePath } from '@/lib/paths';

export default function Login() {
  return (
    <div className="narrow auth-route">
      <Header eye="Local authentication" title="Sign in to Shore Sentinel" desc="This form posts to the web app first, so Tailnet access stays on the same secure origin." />
      <form className="panel auth-form" action={appPath('/api/auth/login')} method="post">
        <label>Email<input name="email" type="email" autoComplete="email" required /></label>
        <label>Password<input name="password" type="password" autoComplete="current-password" required /></label>
        <button className="btn" type="submit">Sign in</button>
        <p>After successful authentication, continue to <Link href={routePath('/dashboard')}>/dashboard</Link>.</p>
      </form>
      <Link href={routePath('/auth/register')}>Create a local account</Link>
    </div>
  );
}
