export const navItems = [
  { href: '/inventory', label: 'Managed Machines' },
  { href: '/scans-reports', label: 'Scans & Reports' },
  { href: '/remediation', label: 'Remediation' },
  { href: '/users', label: 'Users' },
  { href: '/system/update', label: 'System' },
];

export const apiBase = process.env.NEXT_PUBLIC_SHORE_SENTINEL_API_URL || process.env.NEXT_PUBLIC_API_URL || '/shore-sentinel-api';
export const machines = [];
export const audits = [];
export const reports = [];
export const remediations = [];
export const byId = (items, id) => items.find((x) => x.id === id);
