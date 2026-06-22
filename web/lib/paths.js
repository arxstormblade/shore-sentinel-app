const rawBasePath = process.env.NEXT_PUBLIC_SHORE_SENTINEL_BASE_PATH || '/shore-sentinel';

export const basePath = rawBasePath === '/' ? '' : rawBasePath.replace(/\/$/, '');

export function appPath(path = '/') {
  if (!path || path === '/') return `${basePath}/` || '/';
  if (/^(https?:|mailto:|#)/.test(path)) return path;
  const normalized = path.startsWith('/') ? path : `/${path}`;
  if (basePath && normalized.startsWith(`${basePath}/`)) return normalized;
  return `${basePath}${normalized}`;
}

export function routePath(path = '/') {
  if (!path || path === '/') return '/';
  if (/^(https?:|mailto:|#)/.test(path)) return path;
  return path.startsWith('/') ? path : `/${path}`;
}
