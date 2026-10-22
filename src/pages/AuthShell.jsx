import { Logo } from '../components/ui/Logo.jsx';
import { Icon } from '../components/ui/Icon.jsx';
import { APP_NAME } from '../lib/constants.js';

const POINTS = [
  { icon: 'briefcase', text: 'Jobs, pay dates and paychecks in one place' },
  { icon: 'scale', text: 'Clear separation of estimates and recorded payments' },
  { icon: 'shield', text: 'Private, invitation-only access' },
];

/** Two-panel layout shared by sign-in and password recovery. */
export function AuthShell({ title, subtitle, children }) {
  return (
    <div className="auth">
      <aside className="auth__brand" aria-hidden="true">
        <div className="auth__brand-inner">
          <div className="brand brand--lg"><Logo size={34} /><span className="brand__name">{APP_NAME}</span></div>
          <p className="auth__tagline">The partnership ledger for YEROME and the US Persons it works with.</p>
          <ul className="auth__points">
            {POINTS.map((point) => <li key={point.text}><Icon name={point.icon} size={18} />{point.text}</li>)}
          </ul>
        </div>
      </aside>
      <main className="auth__main" id="main">
        <div className="auth__card">
          <div className="brand brand--auth-mobile"><Logo size={30} /><span className="brand__name">{APP_NAME}</span></div>
          <h1 className="auth__title">{title}</h1>
          {subtitle ? <p className="auth__subtitle">{subtitle}</p> : null}
          {children}
        </div>
      </main>
    </div>
  );
}
