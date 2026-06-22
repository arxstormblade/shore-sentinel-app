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
  'app/scans-reports/page.jsx',
  'app/scans-reports/reports/[id]/page.jsx',
  'app/remediation/page.jsx',
  'app/remediation/[id]/page.jsx',
  'app/auth/login/page.jsx',
  'app/auth/register/page.jsx',
  'app/knowledgebase/page.jsx',
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
for (const text of ['Inventory','Scans & Reports','Remediation','Knowledgebase','Managed-machine dashboard','Audit History','Promote to Managed Machine','Run One-Time Audit','Add Managed Machine','auth/login','auth/register','Environment','Status','Severity','Time range','Shore Sentinel logo','Findings by Severity','Managed Machine Fleet','Recent Scans','Create local account']) {
  if (!source.includes(text)) failures.push(`missing ${text}`);
}
const landing = readFileSync(join(root, 'app/page.jsx'), 'utf8');
const signInForm = readFileSync(join(root, 'components/sign-in-form.jsx'), 'utf8');
if (!/Remember me/.test(signInForm) || !/name="rememberMe"/.test(signInForm)) failures.push('sign-in form must include remember me');
if (/preview|What operators see after login|Dashboard|Knowledgebase|Managed-machine dashboard/.test(landing)) failures.push('landing page must not expose confidential dashboard or preview content');
const loginPage = readFileSync(join(root, 'app/auth/login/page.jsx'), 'utf8');
const registerPage = readFileSync(join(root, 'app/auth/register/page.jsx'), 'utf8');
const signInComponent = readFileSync(join(root, 'components/sign-in-form.jsx'), 'utf8');
const shellComponent = readFileSync(join(root, 'components/ui.jsx'), 'utf8');
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
if (!/if \(!signedIn\) return <>/.test(shell) || !/PublicTopBar/.test(shell)) failures.push('shell must show public logo/sign-in top bar until a session is confirmed');
const navCount = (readFileSync(join(root, 'lib/data.js'), 'utf8').match(/href:'\/(inventory|scans-reports|remediation)'/g) || []).length;
if (navCount !== 3) failures.push(`expected 3 primary nav items, found ${navCount}`);
if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log(`MVP verification passed: ${routes.length} routes, split dashboard, scoped filters, secondary knowledgebase, local auth.`);
