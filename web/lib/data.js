export const navGroups = [
  {
    href: '/dashboard',
    label: 'Dashboard',
    items: [
      { href: '/dashboard', label: 'Overview' },
      { href: '/saved-views', label: 'Saved views' },
    ],
  },
  {
    href: '/inventory',
    label: 'AI Assets',
    items: [
      { href: '/inventory', label: 'Asset inventory' },
      { href: '/inventory/new', label: 'Add machine' },
    ],
  },
  {
    href: '/scans-reports',
    label: 'Audit Reports',
    items: [
      { href: '/scans-reports', label: 'Reports' },
      { href: '/audits', label: 'Audit archive' },
      { href: '/remediation', label: 'Remediation' },
    ],
  },
  {
    href: '/knowledgebase',
    label: 'Knowledgebase',
    items: [],
  },
  {
    href: '/system/update',
    label: 'System',
    items: [
      { href: '/system/update', label: 'System update' },
      { href: '/preferences', label: 'Display preferences' },
    ],
  },
  {
    href: '/users',
    label: 'Users',
    items: [
      { href: '/users', label: 'User directory' },
    ],
  },
];

export const apiBase = process.env.NEXT_PUBLIC_SHORE_SENTINEL_API_URL || process.env.NEXT_PUBLIC_API_URL || '/shore-sentinel-api';
export const machines = [];
export const audits = [];
export const reports = [];
export const remediations = [];
export const byId = (items, id) => items.find((x) => x.id === id);
