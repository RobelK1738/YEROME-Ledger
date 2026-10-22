import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Field, TextInput } from '../components/ui/Field.jsx';
import { Logo } from '../components/ui/Logo.jsx';
import { APP_NAME } from '../lib/constants.js';
import { supabase, isSupabaseConfigured } from '../lib/supabase/client.js';
import { completeAdminRecovery, isStrongAdminPassword,
  requestAdminRecovery } from '../lib/auth/adminRecovery.js';

export default function ResetPasswordPage({ callback }) {
  const [status, setStatus] = useState(callback.kind === 'link' ? 'checking' : callback.kind);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (callback.kind !== 'link') return undefined;
    let active = true;
    // The attempt is memoized so React StrictMode cannot redeem a one-use link twice.
    callback.redeem(supabase.auth).then((result) => {
      if (active) setStatus(result.kind);
    });
    return () => { active = false; };
  }, [callback]);

  const requestLink = async (event) => {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    const result = await requestAdminRecovery(supabase.auth, email);
    setEmail('');
    setBusy(false);
    setStatus(result.kind);
  };

  const savePassword = async (event) => {
    event.preventDefault();
    setMessage('');
    if (!isStrongAdminPassword(password)) {
      setMessage('Use at least 20 characters with uppercase, lowercase, a number, and a symbol.');
      return;
    }
    if (password !== confirmation) {
      setMessage('Passwords do not match.');
      return;
    }
    setBusy(true);
    const result = await completeAdminRecovery(supabase.auth, password, status === 'ready');
    setPassword('');
    setConfirmation('');
    setBusy(false);
    if (result.kind === 'complete') {
      setStatus(result.revoked ? 'complete' : 'complete-revoke');
    } else {
      setStatus(result.kind);
    }
  };

  return <div className="login-page">
    <main className="login-card">
      <div className="login-brand">
        <Logo size={34} className="login-brand__logo" />
        <span className="login-brand__name">{APP_NAME}</span>
      </div>
      <h1 className="login-sub">Reset YEROME Admin password</h1>
      {!isSupabaseConfigured ? <p className="form-error" role="alert">Password recovery is unavailable.</p> : null}

      {status === 'checking' ? <p role="status">Checking your recovery link…</p> : null}
      {status === 'expired' ? <p className="form-error" role="alert">
        This recovery link has expired. Request a fresh email below.
      </p> : null}
      {status === 'invalid' ? <p className="form-error" role="alert">
        This recovery link is invalid or has already been used. Request a fresh email below.
      </p> : null}
      {status === 'unavailable' ? <p className="form-error" role="alert">
        A recovery email could not be requested right now. Please try again later.
      </p> : null}
      {status === 'sent' ? <p role="status">
        If this is the designated Admin account, a fresh recovery email will arrive shortly.
      </p> : null}
      {status === 'complete' || status === 'complete-revoke' ? <div role="status">
        <p>Your password was updated. Sign in again with your new password.</p>
        {status === 'complete-revoke' ? <p className="form-error" role="alert">
          Session revocation could not be confirmed. Ask the project owner to revoke this Admin account’s sessions in Supabase Auth.
        </p> : null}
      </div> : null}

      {status === 'ready' ? <form onSubmit={savePassword}>
        <p className="text-sm">Choose a new password for the designated Admin account.</p>
        <Field label="New password" htmlFor="new-password" required>
          <TextInput id="new-password" type="password" autoComplete="new-password"
            value={password} onChange={(event) => setPassword(event.target.value)}
            minLength={20} required />
        </Field>
        <Field label="Confirm new password" htmlFor="confirm-password" required>
          <TextInput id="confirm-password" type="password" autoComplete="new-password"
            value={confirmation} onChange={(event) => setConfirmation(event.target.value)}
            minLength={20} required />
        </Field>
        {message ? <p className="form-error" role="alert">{message}</p> : null}
        <button className="btn btn--primary btn--block" type="submit" disabled={busy || !isSupabaseConfigured}>
          {busy ? 'Updating password…' : 'Update password'}
        </button>
      </form> : null}

      {['none', 'expired', 'invalid', 'unavailable', 'sent'].includes(status) ? <form onSubmit={requestLink}>
        <Field label="Admin email" htmlFor="recovery-email" required>
          <TextInput id="recovery-email" type="email" autoComplete="email"
            value={email} onChange={(event) => setEmail(event.target.value)} required />
        </Field>
        <button className="btn btn--primary btn--block" type="submit" disabled={busy || !isSupabaseConfigured}>
          {busy ? 'Requesting…' : 'Send recovery email'}
        </button>
      </form> : null}
      <p className="login-note"><Link to="/login">Return to sign in</Link></p>
    </main>
  </div>;
}
