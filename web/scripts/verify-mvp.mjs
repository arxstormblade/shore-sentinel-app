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
  try {
    statSync(join(root, route));
  } catch {
    failures.push(`missing route ${route}`);
  }
}

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const filePath = join(dir, name);
    const stat = statSync(filePath);
    return stat.isDirectory() ? walk(filePath) : [filePath];
  });
}

const source = ['app', 'components', 'lib']
  .flatMap((dir) => walk(join(root, dir)))
  .filter((path) => /\.(jsx|js|css)$/.test(path))
  .map((path) => readFileSync(path, 'utf8'))
  .join('\n');

for (const text of ['Remember me for 30 days', 'remember_me', 'Create local account', 'Sign in to continue']) {
  if (!source.includes(text)) failures.push(`missing ${text}`);
}

const landing = readFileSync(join(root, 'app/page.jsx'), 'utf8');
if (!/showRegisterLink=\{false\}/.test(landing)) failures.push('landing page must hide secondary auth links');
if (/preview|knowledgebase|managed machines|audit history/i.test(landing)) failures.push('landing page must not expose dashboard details');

const loginPage = readFileSync(join(root, 'app/auth/login/page.jsx'), 'utf8');
if (!/showRegisterLink/.test(loginPage)) failures.push('login page should still offer the local account path');
if (/preview|knowledgebase|managed machines|audit history/i.test(loginPage)) failures.push('login page must not expose dashboard details');

const nextConfig = readFileSync(join(root, 'next.config.js'), 'utf8');
if (!/basePath/.test(nextConfig) || !/shore-sentinel/.test(nextConfig)) failures.push('Next.js must own the /shore-sentinel basePath');
if (!/action=\{appPath\(['"]\/api\/auth\/login['"]\)\}/.test(source)) failures.push('login forms must post through mounted appPath(/api/auth/login)');
if (!/action=\{appPath\(['"]\/api\/auth\/register['"]\)\}/.test(source)) failures.push('register form must post through mounted appPath(/api/auth/register)');
if (/href=['"]\/shore-sentinel/.test(source) || /action=['"]\/shore-sentinel/.test(source)) failures.push('source must not hard-code mounted /shore-sentinel href/action strings');
if (/href=\{appPath\(/.test(source)) failures.push('Next Link hrefs must use routePath, not mounted appPath, when next.config basePath is active');
if (/tenant selector/i.test(source)) failures.push('tenant selector text must not appear');
if (/localhost:4000|127\.0\.0\.1:4000/.test(source)) failures.push('browser-rendered source must not expose localhost API URLs');
const navigationData = readFileSync(join(root, 'lib/data.js'), 'utf8');
const navigationGroups = ['Dashboard', 'AI Assets', 'Audit Reports', 'Knowledgebase', 'System', 'Users'];
const navigationPositions = navigationGroups.map((label) => navigationData.indexOf(`label: '${label}'`));
if (!navigationData.includes('export const navGroups')) failures.push('navigation must use grouped navGroups data');
if (navigationData.includes("href: '/scans/start'")) failures.push('start scan must be launched from machine details, not primary navigation');
if (navigationPositions.some((position) => position < 0) || navigationPositions.some((position, index) => index > 0 && position < navigationPositions[index - 1])) {
  failures.push('expected navigation groups in order: Dashboard, AI Assets, Audit Reports, Knowledgebase, System, Users');
}

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}

console.log(`MVP verification passed: ${routes.length} routes, minimal auth landing, remember-me session TTL, and scoped dashboard surfaces.`);
