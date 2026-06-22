import Link from 'next/link';
import { ShoreLogo } from '@/components/ui';
import { appPath, routePath } from '@/lib/paths';

const highlights = [
  ['Calm hierarchy', 'The first screen keeps the login action obvious and the supporting context secondary.'],
  ['Brandkit-inspired', 'Dark, editorial, and grid-forward without turning the interface into a mood board.'],
  ['Operational focus', 'Managed machines, one-time audits, reports, and remediation stay one click away.'],
];

export default function Landing() {
  return (
    <div className="auth-landing">
      <section className="auth-card hero-login panel">
        <div className="auth-banner">
          <p className="eye">Single-tenant control plane</p>
          <span className="chip green">Tailnet secure</span>
        </div>

        <div className="auth-brandline">
          <ShoreLogo size={44} />
          <span>Shore Sentinel</span>
        </div>

        <div className="hero-copy">
          <p className="eye">Sign in to continue</p>
          <h1>Sign in to a quiet, operational security console.</h1>
          <p>
            Shore Sentinel keeps managed machines, one-time audits, reports, and remediation in one dark,
            data-first surface without the clutter of a generic SaaS dashboard.
          </p>
        </div>

        <div className="hero-chipbar">
          <span className="chip">Audit-first workflows</span>
          <span className="chip">Managed fleet health</span>
          <span className="chip">Knowledgebase included</span>
        </div>

        <form className="auth-form" action={appPath('/api/auth/login')} method="post">
          <label>
            Email
            <input name="email" type="email" autoComplete="email" required defaultValue="admin@shore360.local" />
          </label>
          <label>
            Password
            <input name="password" type="password" autoComplete="current-password" required />
          </label>
          <button className="btn" type="submit">Sign in</button>
        </form>

        <p className="auth-switch">
          Need a local operator profile? <Link href={routePath('/auth/register')}>Create local account</Link>
        </p>
      </section>

      <aside className="auth-preview panel">
        <div className="preview-head">
          <p className="eye">Interface preview</p>
          <h2>What operators see after login</h2>
          <p>
            Minimal prompts, strong hierarchy, and status-first surfaces keep the work readable at a glance.
          </p>
        </div>

        <div className="preview-stack">
          {highlights.map(([title, desc], index) => (
            <article className={`preview-card${index === 0 ? ' accent' : ''}`} key={title}>
              <b>{title}</b>
              <small>{desc}</small>
            </article>
          ))}
        </div>

        <div className="preview-metrics">
          <div>
            <b>Run</b>
            <span>One-time audit when you need evidence quickly.</span>
          </div>
          <div>
            <b>Enroll</b>
            <span>Add a managed machine for continuous monitoring.</span>
          </div>
          <div>
            <b>Review</b>
            <span>Read findings, remediation, and reports in context.</span>
          </div>
        </div>

        <div className="preview-cta">
          <Link className="btn alt" href={routePath('/dashboard')}>Preview dashboard</Link>
          <Link className="btn ghost" href={routePath('/knowledgebase')}>Open knowledgebase</Link>
        </div>
      </aside>
    </div>
  );
}
