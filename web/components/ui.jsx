import Link from 'next/link';
import { useId } from 'react';
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

function UserStrip({ initials, user }) {
  return (
    <aside className="user-strip">
      <span className="system-ok"><i />All Systems Operational</span>
      <Link className="avatar-link" href={routePath('/users')}>
        <span className="avatar">{initials}</span>
        <span>{user?.display_name || 'Admin User'}</span>
      </Link>
    </aside>
  );
}

function SideNavigation({ initials, user }) {
  return (
    <aside className="side-nav" aria-label="Application navigation">
      <div className="side-nav-brand">
        <Brand />
        <span className="side-nav-kicker">Security operations</span>
      </div>
      <nav className="side-nav-links" aria-label="Primary navigation">
        {navItems.map((item) => (
          <Link key={item.href} href={routePath(item.href)}>{item.label}</Link>
        ))}
      </nav>
      <div className="side-nav-status">
        <span className="system-ok"><i />All Systems Operational</span>
        <Link className="avatar-link" href={routePath('/users')}>
          <span className="avatar">{initials}</span>
          <span>{user?.display_name || 'Admin User'}</span>
        </Link>
      </div>
    </aside>
  );
}

export function Shell({ children, authenticated = false, user = null }) {
  const initials = user?.display_name ? user.display_name.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase() : 'AD';

  if (authenticated) {
    return (
      <div className="app-shell authenticated-shell">
        <SideNavigation initials={initials} user={user} />
        <div className="shell-main">
          <header className="mobile-rail" aria-label="Mobile app status">
            <Brand />
            <UserStrip initials={initials} user={user} />
          </header>
          <main>{children}</main>
          <footer><b>Knowledgebase</b><Link href={routePath('/knowledgebase')}>Reference guide</Link><Link href={routePath('/audits')}>Audit History</Link><Link href={routePath('/system/update')}>System Update</Link><Link href={routePath('/dashboard')}>Dashboard</Link></footer>
        </div>
      </div>
    );
  }

  return (
    <>
      <header className="top">
        <Brand />
        <aside className="user-strip">
          <Link className="btn alt" href={routePath('/auth/login')}>Sign in</Link>
        </aside>
      </header>
      <main>{children}</main>
    </>
  );
}

export function Header({ eye, title, desc, children }) {
  return <section className="hero"><div><p className="eye">{eye}</p><h1>{title}</h1><p>{desc}</p></div><div className="actions">{children}</div></section>;
}

export function CompactPageHeader({ eyebrow, title, description, status, actions, children }) {
  return (
    <header className="compact-page-header">
      <div className="compact-page-header-copy">
        {eyebrow ? <p className="compact-page-header-eyebrow">{eyebrow}</p> : null}
        <h1>{title}</h1>
        {description ? <p>{description}</p> : null}
      </div>
      {(status || actions || children) ? <div className="compact-page-header-actions">{status}{actions || children}</div> : null}
    </header>
  );
}

export function OperationsSummaryStrip({ items, label = 'Operational summary' }) {
  return (
    <dl className="operations-summary-strip" aria-label={label}>
      {items.map((item) => (
        <div key={item.label}>
          <dt>{item.label}</dt>
          <dd>
            {item.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function OperationalSection({ id, eyebrow, title, status, actions, children }) {
  const instanceId = useId();
  const headingId = id ? `${id}-heading` : `operational-section-${instanceId}-heading`;

  return (
    <section className="operational-section" aria-labelledby={headingId}>
      <div className="operational-section-heading">
        <div>
          {eyebrow ? <p className="operational-section-eyebrow">{eyebrow}</p> : null}
          <h2 id={headingId}>{title}</h2>
        </div>
        {(status || actions) ? <div className="operational-section-actions">{status}{actions}</div> : null}
      </div>
      {children}
    </section>
  );
}

export function OperationsLedger({ label, children }) {
  return <ul className="operations-ledger" aria-label={label}>{children}</ul>;
}

export function OperationsLedgerRow({ children }) {
  return <li className="operations-ledger-row">{children}</li>;
}

export function ComposedEmptyState({ title, description, tone = 'neutral', actions, children }) {
  return (
    <div className={`composed-empty-state ${tone}`} role={tone === 'error' ? 'alert' : 'status'} aria-live={tone === 'error' ? 'assertive' : 'polite'}>
      <div>
        <h3>{title}</h3>
        {description ? <p>{description}</p> : null}
      </div>
      {(actions || children) ? <div className="composed-empty-state-actions">{actions || children}</div> : null}
    </div>
  );
}

export function OperationsDisclosure({ summary, children, defaultOpen = false }) {
  return (
    <details className="operations-disclosure" open={defaultOpen || undefined}>
      <summary className="operations-disclosure-summary">{summary}</summary>
      <div className="operations-disclosure-body">{children}</div>
    </details>
  );
}

export function Filters({ name, items }) {
  return <section className="filters"><b>{name} filters</b>{items.map((f) => <label key={f}><span>{f}</span><select><option>All {f.toLowerCase()}</option><option>Production</option><option>High</option><option>Last 30 days</option></select></label>)}</section>;
}

export function Pill({ children, tone = '' }) { return <span className={`pill ${tone}`}>{children}</span>; }

export function Empty() {
  return <section className="empty"><h2>Start with one operational choice</h2><p>Enroll a managed machine for ongoing inventory, schedules, history, and fleet health.</p><Link className="btn" href={routePath('/inventory/new')}>Add Managed Machine</Link><Link className="btn alt" href={routePath('/scans-reports')}>View Reports</Link><Link href={routePath('/knowledgebase')}>Read the knowledgebase</Link></section>;
}
