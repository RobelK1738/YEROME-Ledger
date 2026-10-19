import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { supabase } from '../lib/supabase/client.js';
import { Loading } from '../components/ui/Loading.jsx';

export default function AdminMfaPage() {
  const { session, loading, mfaRequired, isAdmin, refreshAuthorization, signOut } = useAuth();
  const [factor, setFactor] = useState(null);
  const [enrollment, setEnrollment] = useState(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!mfaRequired) return;
    let active = true;
    supabase.auth.mfa.listFactors().then(({ data, error: listError }) => {
      if (!active) return;
      if (listError) setError('Could not load authenticator factors.');
      else setFactor(data?.totp?.find((item) => item.status === 'verified') || null);
    });
    return () => { active = false; };
  }, [mfaRequired]);

  if (loading) return <Loading full label="Checking Admin session…" />;
  if (isAdmin) return <Navigate to="/admin" replace />;
  if (!session || !mfaRequired) return <Navigate to="/login" replace />;

  async function enroll() {
    setError(''); setBusy(true);
    try {
      const { data, error: enrollError } = await supabase.auth.mfa.enroll({ factorType: 'totp' });
      if (enrollError || !data?.id || !data.totp?.qr_code) throw new Error('Could not start authenticator enrollment.');
      setEnrollment(data);
    } catch { setError('Could not start authenticator enrollment. Contact the account owner.'); }
    finally { setBusy(false); }
  }

  async function verify(event) {
    event.preventDefault(); setError(''); setBusy(true);
    try {
      const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({
        factorId: enrollment?.id || factor?.id, code: code.trim(),
      });
      if (verifyError) throw verifyError;
      const { data: { session: updated } } = await supabase.auth.getSession();
      const result = await refreshAuthorization(updated);
      if (result.role !== 'admin') throw new Error('A verified Admin session is required.');
      setEnrollment(null); setCode('');
    } catch { setError('Authenticator verification failed. Check the code and try again.'); }
    finally { setBusy(false); }
  }

  return <main className="login-page"><div className="login-card">
    <h1>Secure YEROME Admin sign-in</h1>
    <p>Use your authenticator to complete sign-in before any financial data is available.</p>
    {error ? <p role="alert" className="form-error">{error}</p> : null}
    {!factor && !enrollment ? <button className="btn btn--primary" disabled={busy} onClick={enroll}>
      Set up authenticator</button> : null}
    {enrollment?.totp?.qr_code ? <div>
      <p>Scan this QR code in your authenticator. Keep the setup secret private.</p>
      <img src={enrollment.totp.qr_code} alt="Authenticator setup QR code" />
      <details><summary>Enter setup key manually</summary><code>{enrollment.totp.secret}</code></details>
    </div> : null}
    {factor || enrollment ? <form onSubmit={verify}>
      <label htmlFor="admin-mfa-code">Six digit authenticator code</label>
      <input id="admin-mfa-code" inputMode="numeric" autoComplete="one-time-code"
        pattern="[0-9]{6}" maxLength="6" required value={code}
        onChange={(event) => setCode(event.target.value)} />
      <button className="btn btn--primary" disabled={busy}>Verify authenticator</button>
    </form> : null}
    <button className="btn btn--secondary" type="button" onClick={signOut}>Sign out</button>
  </div></main>;
}
