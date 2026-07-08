import Link from 'next/link';
import { navItems } from '@/lib/data';
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

export function Shell({ children, authenticated = false, user = null }) {
  const initials = user?.display_name ? user.display_name.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase() : 'AD';
  return (
    <>
      <header className="top">
        <Brand />
        {authenticated ? (
          <>
            <nav className="primary-nav" aria-label="Primary navigation">
              {navItems.map((item) => <Link key={item.href} href={routePath(item.href)}>{item.icon}<span>{item.label}</span></Link>)}
            </nav>
            <aside className="user-strip">
              <span className="system-ok"><i />All Systems Operational</span>
              <Link className="avatar-link" href={routePath('/users')}><span className="avatar">{initials}</span><span>{user?.display_name || 'Admin User'}</span></Link>
            </aside>
          </>
        ) : (
          <aside className="user-strip">
            <Link className="btn alt" href={routePath('/auth/login')}>Sign in</Link>
          </aside>
        )}
      </header>
      <main>{children}</main>
      {authenticated ? (
        <footer><b>Knowledgebase</b><Link href={routePath('/knowledgebase')}>Reference guide</Link><Link href={routePath('/audits')}>Audit History</Link><Link href={routePath('/system/update')}>System Update</Link><Link href={routePath('/dashboard')}>Dashboard</Link></footer>
      ) : null}
    </>
  );
}

export function Header({ eye, title, desc, children }) {
  return <section className="hero"><div><p className="eye">{eye}</p><h1>{title}</h1><p>{desc}</p></div><div className="actions">{children}</div></section>;
}

export function Filters({ name, items }) {
  return <section className="filters"><b>{name} filters</b>{items.map((f) => <label key={f}><span>{f}</span><select><option>All {f.toLowerCase()}</option><option>Production</option><option>High</option><option>Last 30 days</option></select></label>)}</section>;
}

export function Pill({ children, tone = '' }) { return <span className={`pill ${tone}`}>{children}</span>; }

export function Empty() {
  return <section className="empty"><h2>Start with one operational choice</h2><p>Enroll a managed machine for ongoing inventory, schedules, history, and fleet health.</p><Link className="btn" href={routePath('/inventory/new')}>Add Managed Machine</Link><Link className="btn alt" href={routePath('/scans-reports')}>View Reports</Link><Link href={routePath('/knowledgebase')}>Read the knowledgebase</Link></section>;
}
