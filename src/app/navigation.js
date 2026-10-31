export const ADMIN_NAV = Object.freeze([
  { to: '/admin', label: 'Statement', icon: 'overview', end: true, primary: true },
  { to: '/admin/people', label: 'Owners', icon: 'users', primary: true },
  { to: '/admin/allocations', label: 'Allocations', icon: 'money', primary: true },
  { to: '/admin/jobs', label: 'Jobs', icon: 'briefcase' },
  { to: '/admin/people/referrals', label: 'Referrals', icon: 'link' },
  { to: '/admin/config', label: 'Assumptions', icon: 'settings' },
]);
export const OWNER_NAV = Object.freeze([
  { to: '/owner', label: 'Statement', icon: 'home', end: true, primary: true },
  { to: '/owner/allocations', label: 'Allocations', icon: 'money', primary: true },
]);
export function activeNavItem(navItems, pathname) {
  return navItems.filter((item) => item.end ? pathname === item.to : pathname === item.to || pathname.startsWith(`${item.to}/`))
    .sort((a, b) => b.to.length - a.to.length)[0] || null;
}
