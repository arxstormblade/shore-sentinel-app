export const navItems = [
  { href: '/inventory', label: 'Managed Machines', icon: 'MM' },
  { href: '/scans-reports', label: 'Scans & Reports', icon: 'SR' },
  { href: '/remediation', label: 'Remediation', icon: 'RM' },
  { href: '/users', label: 'Users', icon: 'US' },
  { href: '/system/update', label: 'System', icon: 'SY' },
];

export const apiBase = process.env.NEXT_PUBLIC_SHORE_SENTINEL_API_URL || process.env.NEXT_PUBLIC_API_URL || '/shore-sentinel-api';
export const machines = [];
export const audits = [];
export const reports = [];
export const remediations = [];
export const byId = (items, id) => items.find((x) => x.id === id);
