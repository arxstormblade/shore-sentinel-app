import Link from 'next/link';
import { navItems } from '@/lib/data';
import { hasActiveSession } from '@/lib/session';
import { appPath, routePath } from '@/lib/paths';

export function ShoreLogo({ size = 34 }) {
  return (
    <span className="logo-mark" aria-label="Shore Sentinel logo" style={{ '--logo-size': `${size}px` }}>
      <img src={appPath('/shore-sentinel-logo-v2.png')} alt="Shore Sentinel" aria-hidden="true" />
    </span>
  );
}

export function Brand() {
  return (
    <Link className="brand" href={routePath('/dashboard')} aria-label="Shore Sentinel dashboard">
      <ShoreLogo />
      <span>Shore Sentinel</span>
    </Link>
  );
}

export function PublicTopBar({ actionHref = routePath('/auth/register'), actionLabel = 'Create a local account' }) {
  return (
    <header className="public-top" aria-label="Shore Sentinel public navigation">
      <Link className="brand" href={routePath('/auth/login')} aria-label="Shore Sentinel sign in">
        <ShoreLogo />
        <span>Shore Sentinel</span>
      </Link>
      <nav className="public-nav" aria-label="Account navigation">
        <Link href={routePath('/auth/login')}>Sign in</Link>
        {actionLabel ? <Link className="btn alt" href={actionHref}>{actionLabel}</Link> : null}
      </nav>
    </header>
  );
}

function Main({ children }) {
  return <main id="main-content" tabIndex={-1}>{children}</main>;
}

export async function Shell({ children }) {
  const signedIn = await hasActiveSession();
  if (!signedIn) return <><a className="skip-link" href="#main-content">Skip to main content</a><PublicTopBar /><Main>{children}</Main></>;
  return (
    <>
      <a className="skip-link" href="#main-content">Skip to main content</a>
      <header className="top">
        <Brand />
        <nav className="primary-nav" aria-label="Primary navigation">
          {navItems.map((item) => <Link key={item.href} href={routePath(item.href)}><span aria-hidden="true">{item.icon}</span><span>{item.label}</span></Link>)}
        </nav>
        <aside className="user-strip" aria-label="Current session">
          <span className="system-ok" role="status"><i aria-hidden="true" />All Systems Operational</span>
          <Link className="display-link" href={routePath('/preferences')} title="Adjust density, contrast, and effects">
            Display
          </Link>
          <Link className="avatar-link" href={routePath('/users')} title="Manage users and roles">
            <span className="avatar" aria-hidden="true">AD</span>
            <span><b>Signed in as Admin User</b><small>Admin</small></span>
          </Link>
        </aside>
      </header>
      <Main>{children}</Main>
      <footer><b>Knowledgebase</b><Link href={routePath('/knowledgebase')}>Reference guide</Link><Link href={routePath('/audits')}>Audit History</Link><Link href={routePath('/dashboard')}>Dashboard</Link><Link href={routePath('/preferences')}>Display preferences</Link></footer>
    </>
  );
}

export function Header({ eye, title, desc, children }) {
  return <section className="hero"><div><p className="eye">{eye}</p><h1>{title}</h1><p>{desc}</p></div><div className="actions">{children}</div></section>;
}

export { Filters } from './filters';

export function Pill({ children, tone = '' }) { return <span className={`pill ${tone}`}>{children}</span>; }

export function Empty() {
  return <section className="empty"><h2>Start with one operational choice</h2><p>Run an ad hoc audit for temporary evidence or enroll a managed machine for ongoing inventory, schedules, history, and fleet health.</p><Link className="btn" href={routePath('/scans-reports#audit-entry')}>Run One-Time Audit</Link><Link className="btn alt" href={routePath('/inventory#add-managed-machine')}>Add Managed Machine</Link><Link href={routePath('/knowledgebase')}>Read the knowledgebase</Link></section>;
}
