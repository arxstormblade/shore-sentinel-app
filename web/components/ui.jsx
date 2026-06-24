import Link from 'next/link';
import { navItems } from '@/lib/data';
import { hasActiveSession } from '@/lib/session';
import { appPath, routePath } from '@/lib/paths';

const filterOptions = {
  Environment: ['All environments', 'Production', 'Lab', 'Unassigned'],
  Status: ['All statuses', 'Online', 'Offline', 'Unknown', 'Running', 'Completed', 'Failed'],
  Severity: ['All severities', 'Critical', 'High', 'Medium', 'Low', 'Informational'],
  'Time range': ['Any time', 'Last 24 hours', 'Last 7 days', 'Last 30 days'],
  Platform: ['All platforms', 'Windows', 'Linux', 'macOS'],
  Owner: ['All owners', 'Unassigned', 'IT', 'Security'],
};

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

export async function Shell({ children }) {
  const signedIn = await hasActiveSession();
  if (!signedIn) return <><PublicTopBar /><main>{children}</main></>;
  return (
    <>
      <header className="top">
        <Brand />
        <nav className="primary-nav" aria-label="Primary navigation">
          {navItems.map((item) => <Link key={item.href} href={routePath(item.href)}>{item.icon}<span>{item.label}</span></Link>)}
        </nav>
        <aside className="user-strip" aria-label="Current session">
          <span className="system-ok"><i />All Systems Operational</span>
          <Link className="avatar-link" href={routePath('/users')} title="Manage users and roles">
            <span className="avatar">AD</span>
            <span><b>Signed in as Admin User</b><small>Admin</small></span>
          </Link>
        </aside>
      </header>
      <main>{children}</main>
      <footer><b>Knowledgebase</b><Link href={routePath('/knowledgebase')}>Reference guide</Link><Link href={routePath('/audits')}>Audit History</Link><Link href={routePath('/dashboard')}>Dashboard</Link></footer>
    </>
  );
}

export function Header({ eye, title, desc, children }) {
  return <section className="hero"><div><p className="eye">{eye}</p><h1>{title}</h1><p>{desc}</p></div><div className="actions">{children}</div></section>;
}

export function Filters({ name, items }) {
  return (
    <section className="filters" aria-label={`${name} filters`}>
      <b>{name} filters</b>
      {items.map((filterName) => {
        const options = filterOptions[filterName] || [`All ${filterName.toLowerCase()}`];
        return (
          <label key={filterName}>
            <span>{filterName}</span>
            <select aria-label={`${name} ${filterName} filter`}>
              {options.map((option) => <option key={option}>{option}</option>)}
            </select>
          </label>
        );
      })}
      <small className="filter-hint">Filters are scoped to this view so each choice matches the data below.</small>
    </section>
  );
}

export function Pill({ children, tone = '' }) { return <span className={`pill ${tone}`}>{children}</span>; }

export function Empty() {
  return <section className="empty"><h2>Start with one operational choice</h2><p>Run an ad hoc audit for temporary evidence or enroll a managed machine for ongoing inventory, schedules, history, and fleet health.</p><Link className="btn" href={routePath('/scans-reports#audit-entry')}>Run One-Time Audit</Link><Link className="btn alt" href={routePath('/inventory#add-managed-machine')}>Add Managed Machine</Link><Link href={routePath('/knowledgebase')}>Read the knowledgebase</Link></section>;
}
