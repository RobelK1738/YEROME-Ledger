import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Field, PasswordInput, TextInput } from '../components/ui/Field.jsx';
import { Button } from '../components/ui/Button.jsx';
import { Notice } from '../components/ui/Notice.jsx';
import { useDocumentTitle } from '../components/ui/PageHeader.jsx';
import { AuthShell } from './AuthShell.jsx';
import { supabase, isSupabaseConfigured } from '../lib/supabase/client.js';
import { completeAdminRecovery, hasPasswordInput,
  requestAdminRecovery } from '../lib/auth/adminRecovery.js';

export default function ResetPasswordPage({ callback }) {
  useDocumentTitle('Reset Admin password');
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
    if (!hasPasswordInput(password)) {
      setMessage('Enter a new password.');
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
    } else if (result.kind === 'password-rejected') {
      setMessage('The password was not accepted. Try another password.');
    } else {
      setStatus(result.kind);
    }
  };

  return (
    <AuthShell title="Reset Admin password" subtitle="For the designated YEROME Admin account only. US Persons should contact YEROME.">
      {!isSupabaseConfigured ? <Notice tone="danger" role="alert">Password recovery is unavailable.</Notice> : null}

      {status === 'checking' ? <Notice tone="info" role="status">Checking your recovery link…</Notice> : null}
      {status === 'expired' ? <Notice tone="danger" role="alert">This recovery link has expired. Request a fresh email below.</Notice> : null}
      {status === 'invalid' ? <Notice tone="danger" role="alert">
        This recovery link is invalid or has already been used. Request a fresh email below.
      </Notice> : null}
      {status === 'unavailable' ? <Notice tone="danger" role="alert">
        A recovery email could not be requested right now. Please try again later.
      </Notice> : null}
      {status === 'sent' ? <Notice tone="ok" role="status">
        If this is the designated Admin account, a fresh recovery email will arrive shortly.
      </Notice> : null}
      {status === 'complete' || status === 'complete-revoke' ? <>
        <Notice tone="ok" role="status">Your password was updated. Sign in again with your new password.</Notice>
        {status === 'complete-revoke' ? <Notice tone="danger" role="alert">
          Session revocation could not be confirmed. Ask the project owner to revoke this Admin account’s sessions in Supabase Auth.
        </Notice> : null}
      </> : null}

      {status === 'ready' ? <form className="auth-form" onSubmit={savePassword}>
        <p className="text-sm muted">Choose a new password for the designated Admin account.</p>
        <Field label="New password" id="new-password" required>
          <PasswordInput autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} required />
        </Field>
        <Field label="Confirm new password" id="confirm-password" required error={message || undefined}>
          <PasswordInput autoComplete="new-password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} required />
        </Field>
        <Button variant="primary" block type="submit" loading={busy} disabled={!isSupabaseConfigured}>
          {busy ? 'Updating password…' : 'Update password'}
        </Button>
      </form> : null}

      {['none', 'expired', 'invalid', 'unavailable', 'sent'].includes(status) ? <form className="auth-form" onSubmit={requestLink}>
        <Field label="Admin email" id="recovery-email" required>
          <TextInput type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
        </Field>
        <Button variant="primary" block type="submit" loading={busy} disabled={!isSupabaseConfigured}>
          {busy ? 'Requesting…' : 'Send recovery email'}
        </Button>
      </form> : null}
      <div className="auth-foot"><Link to="/login">Return to sign in</Link></div>
    </AuthShell>
  );
}
