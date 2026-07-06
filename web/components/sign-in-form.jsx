'use client';

import { useState } from 'react';
import Link from 'next/link';
import { appPath, routePath } from '@/lib/paths';
import { ShoreLogo } from '@/components/ui';

function EyeIcon({ crossed = false }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" focusable="false">
      <path d="M3.8 12s2.9-5.2 8.2-5.2S20.2 12 20.2 12s-2.9 5.2-8.2 5.2S3.8 12 3.8 12Z" />
      <circle cx="12" cy="12" r="2.25" />
      {crossed ? <path d="M5 19 19 5" /> : null}
    </svg>
  );
}

export function SignInForm({ showRegisterLink = false } = {}) {
  const [showPassword, setShowPassword] = useState(false);

  return (
    <section className="auth-card panel">
      <div className="auth-brandline">
        <ShoreLogo size={44} />
        <span>Shore Sentinel</span>
      </div>

      <div className="hero-copy">
        <p className="eye">Sign in to continue</p>
        <h1>Sign in</h1>
      </div>

      <form className="auth-form" action={appPath('/api/auth/login')} method="post">
        <label>
          Email
          <input name="email" type="email" autoComplete="email" required />
        </label>
        <label>
          Password
          <span className="password-field">
            <input name="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" required />
            <button
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              aria-pressed={showPassword}
              className="password-toggle"
              type="button"
              onClick={() => setShowPassword((value) => !value)}
            >
              <EyeIcon crossed={showPassword} />
            </button>
          </span>
        </label>
        <label className="remember-me">
          <input name="remember_me" type="checkbox" value="1" />
          <span>Remember me for 30 days</span>
        </label>
        <button className="btn" type="submit">Sign in</button>
      </form>

      {showRegisterLink ? (
        <p className="auth-switch">
          Need a local operator profile? <Link href={routePath('/auth/register')}>Create local account</Link>
        </p>
      ) : null}
    </section>
  );
}
