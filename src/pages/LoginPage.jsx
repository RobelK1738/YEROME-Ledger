// Single sign-in screen: US Persons use a username, the YEROME Admin uses email.
// There is intentionally NO signup / create-account option.

import { useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { ChoiceGroup, Field, PasswordInput, TextInput } from '../components/ui/Field.jsx';
import { Button } from '../components/ui/Button.jsx';
import { Notice } from '../components/ui/Notice.jsx';
import { Loading } from '../components/ui/Loading.jsx';
import { useDocumentTitle } from '../components/ui/PageHeader.jsx';
import { AuthShell } from './AuthShell.jsx';
import { USERNAME_EXAMPLE } from '../lib/presentation/username.js';

const MODES = [
  { value: 'owner', label: 'US Person' },
  { value: 'admin', label: 'YEROME Admin' },
];

export default function LoginPage() {
  useDocumentTitle('Sign in');
  const { isAuthenticated, role, loading, configured, adminLogin, ownerLogin } = useAuth();
  const [mode, setMode] = useState('owner');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (loading) return <Loading full />;
  if (isAuthenticated) return <Navigate to={role === 'admin' ? '/admin' : '/owner'} replace />;

  const looksLikeEmail = mode === 'owner' && username.includes('@');

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      if (mode === 'admin') {
        await adminLogin(email.trim(), password);
      } else {
        await ownerLogin(username.trim(), password);
      }
    } catch (err) {
      setError(err.message || 'Sign in failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell title="Sign in" subtitle="Welcome back. Choose how you sign in.">
      {!configured ? (
        <Notice tone="danger" title="Sign-in is not configured">
          Set <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_PUBLISHABLE_KEY</code> in the environment.
        </Notice>
      ) : null}

      <ChoiceGroup label="I am signing in as" name="login-mode" options={MODES} value={mode}
        onChange={(next) => { setMode(next); setError(''); }} />

      {error ? <Notice tone="danger" role="alert">{error}</Notice> : null}

      <form className="auth-form" onSubmit={submit}>
        {mode === 'admin' ? (
          <Field label="Email" id="admin-email" required>
            <TextInput type="email" autoComplete="username" value={email}
              onChange={(e) => setEmail(e.target.value)} placeholder="admin@example.com" required />
          </Field>
        ) : (
          <Field label="Username" id="owner-username" required
            hint={`The username YEROME gave you — not an email address. For example, ${USERNAME_EXAMPLE}.`}
            error={looksLikeEmail ? 'US Person usernames are not email addresses. Use the username YEROME gave you.' : undefined}>
            <TextInput type="text" autoComplete="username" autoCapitalize="none" spellCheck={false}
              value={username} onChange={(e) => setUsername(e.target.value)} placeholder={USERNAME_EXAMPLE} required />
          </Field>
        )}

        <Field label="Password" id="password" required>
          <PasswordInput autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </Field>

        <Button type="submit" variant="primary" block loading={busy}>{busy ? 'Signing in…' : 'Sign in'}</Button>
      </form>

      <div className="auth-foot">
        {mode === 'admin'
          ? <Link to="/reset-password">Forgot your Admin password?</Link>
          : <span>Forgot your password? Contact YEROME to reset it.</span>}
        <span>Access is provisioned by YEROME. There is no public sign-up.</span>
      </div>
    </AuthShell>
  );
}
