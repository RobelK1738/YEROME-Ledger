import { useEffect, useRef } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { Logo } from './ui/Logo.jsx';

/** A statement app needs a small header, not a second dashboard in the sidebar. */
export function Layout({ navItems }) {
  const { user, isAdmin, signOut } = useAuth();
  const location = useLocation();
  const menu = useRef(null);
  const primary = navItems.filter((item) => item.primary);
  const tools = navItems.filter((item) => !item.primary);
  useEffect(() => { window.scrollTo(0, 0); if (menu.current) menu.current.open = false; }, [location.pathname]);
  return <div className="ledger-app">
    <a className="skip-link" href="#main">Skip to content</a>
    <header className="ledger-header"><div className="ledger-header__inner">
      <Link to={isAdmin ? '/admin' : '/owner'} className="ledger-brand"><Logo size={27} /><strong>YEROME <span>Ledger</span></strong></Link>
      {primary.length > 1 ? <nav className="ledger-nav" aria-label="Main navigation">{primary.map((item) => <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => isActive ? 'is-active' : ''}>{item.label}</NavLink>)}</nav> : null}
      <div className="ledger-header__account">
        {tools.length ? <details ref={menu} className="ledger-manage"><summary>Manage</summary><nav aria-label="Manage">{tools.map((item) => <Link key={item.to} to={item.to}>{item.label}</Link>)}</nav></details> : null}
        <span className="ledger-account-label">{isAdmin ? 'Admin' : user?.user_metadata?.display_name || 'Owner'}</span>
        <button type="button" className="ledger-signout" onClick={signOut}>Sign out</button>
      </div>
    </div></header>
    <main id="main" tabIndex={-1} className="ledger-main"><Outlet /></main>
  </div>;
}
