// Shared application shell: grouped sidebar on desktop; on phones a contextual
// top bar, a bottom tab bar for primary sections and a menu drawer for the rest.

import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { Logo } from './ui/Logo.jsx';
import { Icon } from './ui/Icon.jsx';
import { APP_NAME } from '../lib/constants.js';
import { activeNavItem } from '../app/navigation.js';

function initials(name) {
  const parts = String(name || '').replace(/@.*/, '').split(/[\s._-]+/).filter(Boolean);
  return (parts[0]?.[0] || 'Y').toUpperCase() + (parts[1]?.[0] || '').toUpperCase();
}

function NavList({ navItems, onNavigate }) {
  const groups = [];
  for (const item of navItems) {
    const name = item.group || '';
    let group = groups.find((entry) => entry.name === name);
    if (!group) groups.push(group = { name, items: [] });
    group.items.push(item);
  }
  return (
    <nav className="sidebar__nav" aria-label="Primary">
      {groups.map((group) => (
        <div className="nav-group" key={group.name || 'main'}>
          {group.name ? <p className="nav-group__label">{group.name}</p> : null}
          {group.items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => `nav-link ${isActive ? 'nav-link--active' : ''}`}
              onClick={onNavigate}
            >
              <Icon name={item.icon} size={18} className="nav-link__icon" />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </div>
      ))}
    </nav>
  );
}

function Account({ displayName, roleLabel, onSignOut }) {
  return (
    <div className="sidebar__footer">
      <div className="account">
        <span className="account__avatar" aria-hidden="true">{initials(displayName)}</span>
        <div className="account__text">
          <div className="account__name" title={displayName}>{displayName}</div>
          <div className="account__role">{roleLabel}</div>
        </div>
      </div>
      <button type="button" className="sidebar__signout" onClick={onSignOut}>
        <Icon name="logout" size={16} />
        <span>Sign out</span>
      </button>
    </div>
  );
}

function Brand({ portalLabel }) {
  return (
    <div className="brand">
      <Logo size={30} className="brand__logo" />
      <div className="brand__text">
        <div className="brand__name">{APP_NAME}</div>
        <div className="brand__portal">{portalLabel}</div>
      </div>
    </div>
  );
}

export function Layout({ navItems, portalLabel }) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { user, isAdmin, signOut } = useAuth();
  const location = useLocation();
  const drawerRef = useRef(null);
  const menuButtonRef = useRef(null);

  const displayName = isAdmin
    ? user?.email || 'YEROME Admin'
    : user?.user_metadata?.display_name || user?.user_metadata?.username || 'US Person';
  const roleLabel = isAdmin ? 'YEROME Admin' : 'US Person';

  const current = activeNavItem(navItems, location.pathname);
  const primaryItems = navItems.filter((item) => item.primary);
  const tabItems = (primaryItems.length ? primaryItems : navItems).slice(0, 4);
  const hasOverflow = tabItems.length < navItems.length;

  useEffect(() => setDrawerOpen(false), [location.pathname]);
  useEffect(() => { window.scrollTo(0, 0); }, [location.pathname]);

  useEffect(() => {
    if (!drawerOpen) return undefined;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    drawerRef.current?.querySelector('a, button')?.focus();
    const onKey = (event) => { if (event.key === 'Escape') setDrawerOpen(false); };
    document.addEventListener('keydown', onKey);
    const trigger = menuButtonRef.current;
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener('keydown', onKey);
      trigger?.focus({ preventScroll: true });
    };
  }, [drawerOpen]);

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">Skip to content</a>

      <aside className="sidebar" aria-label="Sidebar">
        <Brand portalLabel={portalLabel} />
        <NavList navItems={navItems} />
        <Account displayName={displayName} roleLabel={roleLabel} onSignOut={signOut} />
      </aside>

      <header className="topbar">
        <Logo size={26} className="brand__logo" />
        <div className="topbar__title">
          <span className="topbar__title-text">{current?.label || portalLabel}</span>
          <span className="topbar__portal">{portalLabel}</span>
        </div>
        <button
          ref={menuButtonRef}
          type="button"
          className="topbar__menu"
          onClick={() => setDrawerOpen(true)}
          aria-label="Open menu"
          aria-expanded={drawerOpen}
          aria-controls="nav-drawer"
        >
          <Icon name="menu" size={22} />
        </button>
      </header>

      {drawerOpen ? (
        <div className="nav-drawer-overlay" onClick={() => setDrawerOpen(false)}>
          <div
            id="nav-drawer"
            ref={drawerRef}
            className="nav-drawer"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Menu"
          >
            <div className="nav-drawer__head">
              <Brand portalLabel={portalLabel} />
              <button type="button" className="nav-drawer__close" aria-label="Close menu" onClick={() => setDrawerOpen(false)}>
                <Icon name="x" size={20} />
              </button>
            </div>
            <NavList navItems={navItems} onNavigate={() => setDrawerOpen(false)} />
            <Account displayName={displayName} roleLabel={roleLabel} onSignOut={signOut} />
          </div>
        </div>
      ) : null}

      <main className="content" id="main" tabIndex={-1}>
        <div className="content__inner">
          <Outlet />
        </div>
      </main>

      <nav className="bottom-nav" aria-label="Sections">
        {tabItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) => `bottom-nav__tab ${isActive ? 'bottom-nav__tab--active' : ''}`}
          >
            <Icon name={item.icon} size={20} className="bottom-nav__icon" />
            <span className="bottom-nav__label">{item.shortLabel || item.label}</span>
          </NavLink>
        ))}
        {hasOverflow ? (
          <button
            type="button"
            className={`bottom-nav__tab ${current && !tabItems.includes(current) ? 'bottom-nav__tab--active' : ''}`}
            onClick={() => setDrawerOpen(true)}
            aria-expanded={drawerOpen}
            aria-controls="nav-drawer"
          >
            <Icon name="more" size={20} className="bottom-nav__icon" />
            <span className="bottom-nav__label">More</span>
          </button>
        ) : null}
      </nav>
    </div>
  );
}
