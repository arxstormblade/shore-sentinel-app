'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef } from 'react';
import { navGroups } from '@/lib/data';
import { routePath } from '@/lib/paths';

export function MobileNavigation({ status }) {
  const detailsRef = useRef(null);
  const summaryRef = useRef(null);

  const closeDrawer = useCallback(() => {
    const details = detailsRef.current;
    if (!details?.open) return;
    details.open = false;
    summaryRef.current?.focus();
  }, []);

  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key === 'Escape' && detailsRef.current?.open) {
        event.preventDefault();
        closeDrawer();
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [closeDrawer]);

  return (
    <details className="mobile-navigation-drawer" ref={detailsRef}>
      <summary ref={summaryRef} aria-label="Application navigation" aria-controls="mobile-navigation-panel">Navigation</summary>
      <div className="mobile-navigation-panel" id="mobile-navigation-panel">
        <nav className="side-nav-links" aria-label="Mobile primary navigation">
          {navGroups.map((group) => {
            const groupId = `mobile-nav-group-${group.label.toLowerCase().replace(/\s+/g, '-')}`;
            return (
              <section className="side-nav-group" key={group.href} aria-labelledby={groupId}>
                <Link className="side-nav-group-label" id={groupId} href={routePath(group.href)} onClick={closeDrawer}>{group.label}</Link>
                {group.items.length ? (
                  <div className="side-nav-group-items">
                    {group.items.map((item) => (
                      <Link key={item.href} href={routePath(item.href)} onClick={closeDrawer}>{item.label}</Link>
                    ))}
                  </div>
                ) : null}
              </section>
            );
          })}
        </nav>
        <div className="mobile-navigation-context">{status}</div>
      </div>
    </details>
  );
}
