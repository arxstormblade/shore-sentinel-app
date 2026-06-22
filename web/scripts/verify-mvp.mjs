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
for (const text of ['Inventory','Scans & Reports','Remediation','Knowledgebase','Managed-machine dashboard','Audit History','Promote to Managed Machine','Run One-Time Audit','Add Managed Machine','auth/login','auth/register','Environment','Status','Severity','Time range','Shore Shield logo','Findings by Severity','Managed Machine Fleet','Recent Scans','Create local account','Sign in to continue']) {
  if (!source.includes(text)) failures.push(`missing ${text}`);
}
const landing = readFileSync(join(root, 'app/page.jsx'), 'utf8');
if (!/auth-landing/.test(landing)) failures.push('landing page must be login/create account page');
if (/Managed-machine dashboard|Fleet health without one-time audit noise/.test(landing)) failures.push('dashboard content must not be the root landing page');
const loginPage = readFileSync(join(root, 'app/auth/login/page.jsx'), 'utf8');
const registerPage = readFileSync(join(root, 'app/auth/register/page.jsx'), 'utf8');
if (/apiBase\s*\+|localhost:4000/.test(loginPage + registerPage)) failures.push('auth forms must post to web-owned relative actions, not localhost/API absolute URLs');
const nextConfig = readFileSync(join(root, 'next.config.js'), 'utf8');
if (!/basePath/.test(nextConfig) || !/shore-sentinel/.test(nextConfig)) failures.push('Next.js must own the /shore-sentinel basePath');
if (!/action=\{appPath\(['"]\/api\/auth\/login['"]\)\}/.test(loginPage + landing)) failures.push('login forms must post through mounted appPath(/api/auth/login)');
if (!/action=\{appPath\(['"]\/api\/auth\/register['"]\)\}/.test(registerPage)) failures.push('register form must post through mounted appPath(/api/auth/register)');
if (!/href=\{routePath\(['"]\/dashboard['"]\)\}/.test(loginPage + registerPage + landing)) failures.push('auth success links must use Next routePath(/dashboard) under basePath');
if (/href=['"]\/shore-sentinel/.test(source) || /action=['"]\/shore-sentinel/.test(source)) failures.push('source must not hard-code mounted /shore-sentinel href/action strings');
if (/href=\{appPath\(/.test(source)) failures.push('Next Link hrefs must use routePath, not mounted appPath, when next.config basePath is active');
if (/tenant selector/i.test(source)) failures.push('tenant selector text must not appear');
if (/localhost:4000|127\.0\.0\.1:4000/.test(source)) failures.push('browser-rendered source must not expose localhost API URLs');
const navCount = (readFileSync(join(root, 'lib/data.js'), 'utf8').match(/href:'\/(inventory|scans-reports|remediation)'/g) || []).length;
if (navCount !== 3) failures.push(`expected 3 primary nav items, found ${navCount}`);
if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log(`MVP verification passed: ${routes.length} routes, split dashboard, scoped filters, secondary knowledgebase, local auth.`);
