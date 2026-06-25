import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const routes = [
  'app/page.jsx',
  'app/dashboard/page.jsx',
  'app/inventory/page.jsx',
  'app/inventory/machines/[id]/page.jsx',
  'app/audits/page.jsx',
  'app/audits/[id]/page.jsx',
  'app/scans/start/page.jsx',
  'app/scans-reports/page.jsx',
  'app/scans-reports/reports/[id]/page.jsx',
  'app/remediation/page.jsx',
  'app/remediation/[id]/page.jsx',
  'app/auth/login/page.jsx',
  'app/auth/register/page.jsx',
  'app/knowledgebase/page.jsx',
  'app/users/page.jsx',
];
const failures = [];
for (const route of routes) {
  try { statSync(join(root, route)); } catch { failures.push(`missing route ${route}`); }
}
function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    const stat = statSync(path);
    return stat.isDirectory() ? walk(path) : [path];
  });
}
const source = ['app', 'components', 'lib']
  .flatMap((dir) => walk(join(root, dir)))
  .filter((path) => /\.(jsx|js|css)$/.test(path))
  .map((path) => readFileSync(path, 'utf8'))
  .join('\n');
for (const text of ['Inventory','Scans & Reports','Remediation','Users','Knowledgebase','Managed-machine dashboard','Audit History','Promote to Managed Machine','Start scan','auth/login','auth/register','Environment','Status','Severity','Time range','Shore Sentinel logo','Findings by Severity','Managed Machine Fleet','Recent Scans','Create local account','User management','Users & access','Delete user']) {
  if (!source.includes(text)) failures.push(`missing ${text}`);
}
if (!/Add.{0,8}scan machine/.test(source)) failures.push('missing Add & scan machine CTA');
const landing = readFileSync(join(root, 'app/page.jsx'), 'utf8');
const signInForm = readFileSync(join(root, 'components/sign-in-form.jsx'), 'utf8');
if (!/Remember me/.test(signInForm) || !/name="rememberMe"/.test(signInForm)) failures.push('sign-in form must include remember me');
if (/preview|What operators see after login|Dashboard|Knowledgebase|Managed-machine dashboard/.test(landing)) failures.push('landing page must not expose confidential dashboard or preview content');
const loginPage = readFileSync(join(root, 'app/auth/login/page.jsx'), 'utf8');
const registerPage = readFileSync(join(root, 'app/auth/register/page.jsx'), 'utf8');
const signInComponent = readFileSync(join(root, 'components/sign-in-form.jsx'), 'utf8');
const shellComponent = readFileSync(join(root, 'components/ui.jsx'), 'utf8');
const machineDetailClient = readFileSync(join(root, 'components/machine-detail-client.jsx'), 'utf8');
const machineDetailPage = readFileSync(join(root, 'app/inventory/machines/[id]/page.jsx'), 'utf8');
if (/generateStaticParams/.test(machineDetailPage) || !/export const dynamic = ['"]force-dynamic['"]/.test(machineDetailPage) || !/export const revalidate = 0/.test(machineDetailPage)) failures.push('managed machine detail must be dynamic so admin controls are not statically frozen');
if (!/appPath\(['"]\/api\/auth\/me['"]\)/.test(machineDetailClient) || !/adminCanManage/.test(machineDetailClient)) failures.push('managed machine detail must refresh admin permission client-side from web-owned /api/auth/me');
const authMeRoute = readFileSync(join(root, 'app/api/auth/me/route.js'), 'utf8');
if (!/serverApiBase\(\).*\/auth\/me/s.test(authMeRoute) || !/request\.headers\.get\(['"]cookie['"]\)/.test(authMeRoute)) failures.push('web /api/auth/me route must proxy cookies to API /auth/me');
const loginRoute = readFileSync(join(root, 'app/api/auth/login/route.js'), 'utf8');
const registerRoute = readFileSync(join(root, 'app/api/auth/register/route.js'), 'utf8');
if (!/Path=\//.test(loginRoute) || !/Path=\//.test(registerRoute)) failures.push('web auth proxy must set session cookie Path=/ so admin pages and API auth checks receive it');
if (!/Admin danger zone/.test(machineDetailClient) || !/Delete managed machine/.test(machineDetailClient) || !/disabled=\{!adminCanManage \|\| deleteBusy\}/.test(machineDetailClient)) failures.push('managed machine detail must always expose delete panel and enable destructive action only for confirmed admins');
if (!/PublicTopBar/.test(shellComponent) || !/ShoreLogo/.test(shellComponent) || !/if \(!signedIn\) return <>/.test(shellComponent)) failures.push('unauthenticated shell must render Shore Sentinel logo and sign-in top navigation globally');
if (!/auth-brandline/.test(signInComponent) || !/ShoreLogo/.test(signInComponent)) failures.push('login form must render Shore Sentinel logo');
if (/apiBase\s*\+|localhost:4000/.test(loginPage + registerPage + signInForm)) failures.push('auth forms must post to web-owned relative actions, not localhost/API absolute URLs');
const nextConfig = readFileSync(join(root, 'next.config.js'), 'utf8');
if (!/basePath/.test(nextConfig) || !/shore-sentinel/.test(nextConfig)) failures.push('Next.js must own the /shore-sentinel basePath');
if (!/action=\{appPath\(['"]\/api\/auth\/login['"]\)\}/.test(signInForm)) failures.push('login form must post through mounted appPath(/api/auth/login)');
if (!/action=\{appPath\(['"]\/api\/auth\/register['"]\)\}/.test(registerPage)) failures.push('register form must post through mounted appPath(/api/auth/register)');
if (/href=\{routePath\(['"]\/dashboard['"]\)\}/.test(landing + loginPage + signInForm)) failures.push('landing and auth pages must not expose dashboard links');
if (/href=['"]\/shore-sentinel/.test(source) || /action=['"]\/shore-sentinel/.test(source)) failures.push('source must not hard-code mounted /shore-sentinel href/action strings');
if (/href=\{appPath\(/.test(source)) failures.push('Next Link hrefs must use routePath, not mounted appPath, when next.config basePath is active');
if (/tenant selector/i.test(source)) failures.push('tenant selector text must not appear');
if (/localhost:4000|127\.0\.0\.1:4000/.test(source)) failures.push('browser-rendered source must not expose localhost API URLs');
if (/shore360-rmm-01|finance-ws-14|lab-linux-02|vendor-fw|client-vm|WEB-SRV|LAPTOP|DB-SRV|FILE-SRV|DEV-WS|demo-host|demo-scanner|demo-scan|SEED_DEMO_JOB/i.test(source)) failures.push('web source must not include dummy/demo asset details');
const shell = readFileSync(join(root, 'components/ui.jsx'), 'utf8');
const dashboardPage = readFileSync(join(root, 'app/dashboard/page.jsx'), 'utf8');
const inventoryPage = readFileSync(join(root, 'app/inventory/page.jsx'), 'utf8');
const newMachinePage = readFileSync(join(root, 'app/inventory/new/page.jsx'), 'utf8');
const scansPage = readFileSync(join(root, 'app/scans-reports/page.jsx'), 'utf8');
const remediationPage = readFileSync(join(root, 'app/remediation/page.jsx'), 'utf8');
const usersPage = readFileSync(join(root, 'app/users/page.jsx'), 'utf8');
const sharedData = readFileSync(join(root, 'lib/data.js'), 'utf8');
if (!/if \(!signedIn\) return <>/.test(shell) || !/PublicTopBar/.test(shell)) failures.push('shell must show public logo/sign-in top bar until a session is confirmed');
if (!/Signed in as/.test(shell) || !/Admin/.test(shell)) failures.push('authenticated shell must make signed-in/admin state explicit');
if (/API list:/.test(source) || /\/machines\?asset_mode=managed_machine/.test(source)) failures.push('production UI must not expose API implementation notes');
if (!/Security posture from live scans/.test(dashboardPage) || !/View high findings/.test(dashboardPage) || !/View progress/.test(dashboardPage) || !/Highest severity/.test(inventoryPage + dashboardPage)) failures.push('dashboard and inventory must use state-aware, action-oriented scan/finding language');
if (!/className="severity-row"/.test(dashboardPage) || !/\.severity-list > \.severity-row/.test(readFileSync(join(root, 'app/globals.css'), 'utf8'))) failures.push('dashboard severity rows must style the current Link-based severity-row markup, not stale div selectors');
if (!/Recent scan runs/.test(scansPage) || !/Generated artifacts/.test(scansPage) || !/Scan completed/.test(scansPage)) failures.push('Scans & Reports must show completed scans and report artifacts instead of a generic empty state');
if (!/Actionable findings/.test(remediationPage) || !/Suggested remediation/.test(remediationPage) || !/Create remediation tasks from scanner recommendations/.test(remediationPage)) failures.push('Remediation must surface findings/remediation actions when findings exist');
if (!/function readableText/.test(remediationPage) || !/function remediationText/.test(remediationPage) || /Suggested remediation: \{finding\.remediation_action/.test(remediationPage)) failures.push('Remediation must format object remediation values instead of rendering [object Object]');
if (!/Shore Sentinel connects to the machine/.test(newMachinePage) || !/Machine checks in to Shore Sentinel/.test(newMachinePage) || /asset_mode = managed_machine|ssh_push<\/option>|pull_checkin<\/option>/.test(newMachinePage)) failures.push('machine enrollment must explain connection choices in plain language and hide raw mode labels');
if (!/filterOptions/.test(shell) || /<option>Production<\/option><option>High<\/option><option>Last 30 days<\/option>/.test(shell)) failures.push('filters must be scoped by category, not repeated generic values');
if (!/Edit<\/button>/.test(usersPage) || !/Reset password<\/button>/.test(usersPage) || !/Roles<\/button>/.test(usersPage) || !/Delete<\/button>/.test(usersPage)) failures.push('user-management actions must use text labels, not icon-only controls');
if (/0 user\{users.length/.test(usersPage) || !/loading \? 'Loading…'/.test(usersPage)) failures.push('user count must not show false zero while loading');
if (!/Not sure which connection method to use/.test(newMachinePage) || !/How severity is calculated/.test(dashboardPage) || !/When to use one-time audit vs managed machine/.test(newMachinePage + dashboardPage)) failures.push('contextual knowledgebase help must appear at high-friction decisions');
const css = readFileSync(join(root, 'app/globals.css'), 'utf8');
if (!/skip-link/.test(shell + css) || !/id="main-content"/.test(shell)) failures.push('shell must provide a skip-to-main link and main landmark target');
if (!/role="dialog"/.test(usersPage) || !/aria-modal="true"/.test(usersPage) || !/aria-labelledby/.test(usersPage)) failures.push('user-management modals must expose accessible dialog semantics');
if (!/useRef/.test(usersPage) || !/modalRef/.test(usersPage) || !/lastFocusedElement/.test(usersPage) || !/event\.key === 'Escape'/.test(usersPage) || !/event\.key !== 'Tab'/.test(usersPage)) failures.push('user-management modals must trap focus, close on Escape, and return focus to the trigger');
if (!/role="status"/.test(usersPage) || !/role="alert"/.test(usersPage) || !/aria-busy=\{loading\}/.test(usersPage)) failures.push('user-management async loading, toast, and errors must be announced to assistive tech');
if (!/data-label="Subject"/.test(scansPage + dashboardPage) || !/data-label="Next"/.test(dashboardPage) || !/data-label="Actions"/.test(usersPage) || !/className="visually-hidden"/.test(scansPage + usersPage)) failures.push('responsive tables must preserve accessible labels and headers');
if (!/round-icon" aria-hidden="true"/.test(dashboardPage) || !/status-dot[^>]*aria-hidden="true"/.test(dashboardPage)) failures.push('decorative dashboard icons and status dots must be hidden from screen readers');
if (!/a:focus-visible/.test(css) || !/guide-list a:focus-visible/.test(css) || !/severity-row:focus-visible/.test(css)) failures.push('interactive elements must have visible keyboard focus states');
if (!/prefers-reduced-motion: reduce/.test(css)) failures.push('CSS must honor reduced-motion preferences');
if (!/min-height: 2\.75rem/.test(css)) failures.push('row action buttons must meet larger motor-accessible target sizing');
if (!/text-decoration: underline/.test(css)) failures.push('inline/action links must be visibly identifiable without hover');
if (!/--surface-operational:/.test(css) || !/--border-operational:/.test(css) || !/--target-min: 44px/.test(css) || !/--font-operational-min: 0\.875rem/.test(css)) failures.push('design system must define operational accessibility tokens for surfaces, borders, tap targets, and text size');
if (!/\.scans-panel thead th[\s\S]*font-size: var\(--font-operational-min\)/.test(css) || !/\.users-table thead th[\s\S]*font-size: var\(--font-operational-min\)/.test(css) || !/\.chip,\n\.pill[\s\S]*font-size: var\(--font-operational-min\)/.test(css)) failures.push('operational labels, table headers, chips, and pills must use the minimum readable text token');
if (!/\.pager span,[\s\S]*min-width: var\(--target-min\)/.test(css) || !/\.avatar-link[\s\S]*min-height: var\(--target-min\)/.test(css) || !/\.info-dot[\s\S]*width: var\(--target-min\)/.test(css)) failures.push('compact controls and clickable account/navigation affordances must meet minimum target sizing');
if (!/\.severity-list > \.severity-row[\s\S]*border: 1px solid var\(--border-operational\)/.test(css) || !/\.filters[\s\S]*background: var\(--surface-operational\)/.test(css) || !/\.data-panel[\s\S]*border-color: var\(--border-operational\)/.test(css)) failures.push('operational panels, filters, and severity rows must have stronger structure than decorative cards');
if (!/prefers-reduced-transparency: reduce/.test(css)) failures.push('CSS must honor reduced-transparency preferences for glass/blur layers');
if (!/\.severity-row em[\s\S]*text-decoration: underline/.test(css) || !/\.guide-list a::after/.test(css)) failures.push('card and row links must expose persistent action affordances without hover');
if (!/aria-hidden="true"/.test(shell)) failures.push('decorative navigation/status icons must be hidden from screen readers');
for (const detailRoute of ['app/inventory/machines/[id]/page.jsx', 'app/audits/[id]/page.jsx', 'app/scans-reports/reports/[id]/page.jsx']) {
  if (!/export const dynamic = ['"]force-dynamic['"]/.test(readFileSync(join(root, detailRoute), 'utf8'))) failures.push(`${detailRoute} must be force-dynamic so live detail redirects do not crash under cookie-aware layout`);
}
const navCount = (readFileSync(join(root, 'lib/data.js'), 'utf8').match(/href:'\/(inventory|scans-reports|remediation|users)'/g) || []).length;
if (navCount !== 4) failures.push(`expected 4 primary nav items, found ${navCount}`);

// --- Guided scan flow assertions ---
const guidedStartPage = readFileSync(join(root, 'app/scans/start/page.jsx'), 'utf8');
if (!/routePath\(['"]\/scans\/start['"]\)/.test(dashboardPage)) failures.push('dashboard must link primary CTA to /scans/start');
if (!/routePath\(['"]\/scans\/start['"]\)/.test(scansPage)) failures.push('scans-reports Header must link to /scans/start');
if (!/routePath\(['"]\/scans-reports\/reports\/|progress/i.test(guidedStartPage)) failures.push('scans-start must reference scan progress/report routes');
if (!/one-time audit|one.time audit/i.test(guidedStartPage)) failures.push('scans-start must explain one-time audit in plain language');
if (!/managed machine/i.test(guidedStartPage)) failures.push('scans-start must explain managed machine in plain language');
if (!/progress|report|completed scan/i.test(guidedStartPage)) failures.push('scans-start flow must reach scan progress / completed report');
if (!/role="status"|role="alert"/.test(guidedStartPage)) failures.push('scans-start must use role=status or role=alert for progress/report sections');
if (!/h[12]>[\s\S]*h[12]/i.test(guidedStartPage)) failures.push('scans-start must have proper heading hierarchy');
if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log(`MVP verification passed: ${routes.length} routes, split dashboard, scoped filters, secondary knowledgebase, local auth.`);
