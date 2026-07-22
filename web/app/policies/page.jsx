import Link from 'next/link';
import { getAuthenticatedUser } from '@/lib/session';
import { CompactPageHeader, OperationalSection, Pill } from '@/components/ui';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function PoliciesPage() {
  const user = await getAuthenticatedUser();
  if (!user) return null;
  return <main className="page-stack">
    <CompactPageHeader eyebrow="Policy decision boundary" title="Policies and approvals" description="Signed policy bundles are simulated before publication and rechecked before every execution grant." actions={<Link className="button button-secondary" href="/engagements">View engagements</Link>} />
    <OperationalSection title="Fail-closed authorization">
      <p>An execution remains denied when the engagement expires or is revoked, owner authorization is missing, dual approvers are not distinct, scope escapes, or the active policy hash drifts.</p>
      <div className="operations-summary-grid"><div><strong>OIDC / SAML</strong><span>Federation boundary</span></div><div><strong>MFA + step-up</strong><span>Recent assurance required</span></div><div><strong>Signed bundles</strong><span>Hash checked at grant</span></div><div><Pill tone="success">No role-only launch</Pill><span>Engagement gate enforced</span></div></div>
    </OperationalSection>
  </main>;
}
