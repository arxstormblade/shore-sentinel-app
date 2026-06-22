import Link from 'next/link';
import { ShoreLogo } from '@/components/ui';
import { appPath, routePath } from '@/lib/paths';

export function SignInForm({
  title = 'Sign in to Shore Sentinel',
  description = 'Use your operator credentials to open the secure control plane.',
  registerHref = routePath('/auth/register'),
  registerLabel = 'Create a local account',
}) {
  return (
    <div className="narrow auth-route">
      <section className="panel auth-form auth-signin">
        <div className="auth-brandline">
          <ShoreLogo size={44} />
          <span>Shore Sentinel</span>
        </div>
        <div className="auth-header">
          <p className="eye">Secure access</p>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>

        <form action={appPath('/api/auth/login')} method="post">
          <label>
            Email
            <input name="email" type="email" autoComplete="email" required />
          </label>
          <label>
            Password
            <input name="password" type="password" autoComplete="current-password" required />
          </label>
          <label className="remember-me">
            <input name="rememberMe" type="checkbox" value="true" />
            <span>Remember me</span>
          </label>
          <button className="btn" type="submit">Sign in</button>
        </form>

        {registerLabel ? (
          <p className="auth-switch">
            Need a local operator profile? <Link href={registerHref}>{registerLabel}</Link>
          </p>
        ) : null}
      </section>
    </div>
  );
}
