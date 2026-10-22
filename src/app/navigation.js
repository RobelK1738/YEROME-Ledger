// Portal navigation. `primary` items appear in the phone bottom bar; the rest
// live in the menu drawer. Detail routes highlight their parent section.

export const ADMIN_NAV = Object.freeze([
  { to: '/admin', label: 'Overview', icon: 'overview', end: true, primary: true, group: 'Operations' },
  { to: '/admin/people', label: 'US Persons', shortLabel: 'People', icon: 'users', primary: true, group: 'Operations' },
  { to: '/admin/jobs', label: 'Jobs', icon: 'briefcase', primary: true, group: 'Operations' },
  { to: '/admin/pay-runs', label: 'Pay Runs', shortLabel: 'Pay', icon: 'banknote', primary: true, group: 'Operations' },
  { to: '/admin/config', label: 'Configuration', shortLabel: 'Config', icon: 'settings', group: 'Administration' },
  { to: '/admin/audit', label: 'Audit', icon: 'history', group: 'Administration' },
]);

export const OWNER_NAV = Object.freeze([
  { to: '/owner', label: 'Home', icon: 'home', end: true, primary: true },
  { to: '/owner/jobs', label: 'My Jobs', shortLabel: 'Jobs', icon: 'briefcase', primary: true },
  { to: '/owner/payments', label: 'Payments', icon: 'receipt', primary: true },
]);

export const OWNER_COMMISSIONS_NAV = Object.freeze(
  { to: '/owner/commissions', label: 'Commissions', icon: 'coins', primary: true },
);

/** Longest matching item wins so detail routes still highlight their section. */
export function activeNavItem(navItems, pathname) {
  let best = null;
  for (const item of navItems) {
    const isMatch = item.end ? pathname === item.to : pathname === item.to || pathname.startsWith(`${item.to}/`);
    if (isMatch && (!best || item.to.length > best.to.length)) best = item;
  }
  return best;
}
