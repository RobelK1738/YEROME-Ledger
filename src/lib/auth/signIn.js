// Keep password rejection distinct from a failed server authorization check.
// Never surface provider messages: they can contain internal account details.
export async function sessionAuthorization(session, request = fetch) {
  if (!session?.access_token) return { role: null };
  try {
    const response = await request('/api/auth/session', {
      headers: { Authorization: `Bearer ${session.access_token}` }, cache: 'no-store',
    });
    if (!response.ok) return { role: null, failure: response.status === 401 ? 'expired'
      : response.status === 403 ? 'access' : 'unavailable' };
    const result = await response.json();
    return ['admin', 'owner'].includes(result.role) ? { role: result.role } : { role: null, failure: 'access' };
  } catch { return { role: null, failure: 'unavailable' }; }
}

function passwordFailure(error) {
  if (error?.status === 429 || ['over_request_rate_limit', 'over_email_send_rate_limit'].includes(error?.code))
    return 'Too many sign-in attempts. Wait a few minutes and try again.';
  if (error?.code === 'invalid_credentials')
    return 'Email or password was not accepted. Use your current Admin password or reset it.';
  if (error?.status >= 500 || error?.name === 'AuthRetryableFetchError' || error instanceof TypeError)
    return 'Could not reach the sign-in service. Try again shortly.';
  return 'Sign-in could not be completed. Try again or use password recovery.';
}

export async function adminPasswordLogin(auth, email, password, refreshAuthorization) {
  let result;
  try { result = await auth.signInWithPassword({ email: email.trim(), password }); }
  catch (error) { throw new Error(passwordFailure(error)); }
  if (result.error) throw new Error(passwordFailure(result.error));
  if (!result.data?.session) throw new Error('Sign-in did not create a session. Try again.');
  const authorization = await refreshAuthorization(result.data.session);
  if (authorization.role === 'admin') return authorization;
  // Drop the local session even if Auth is temporarily unreachable.
  try { await auth.signOut({ scope: 'local' }); } catch { /* Keep safe failure below. */ }
  await refreshAuthorization(null);
  if (authorization.failure === 'unavailable')
    throw new Error('Your password was accepted, but the app could not verify access. Try again shortly.');
  if (authorization.failure === 'expired')
    throw new Error('Your sign-in session expired. Sign in again.');
  throw new Error('Your password was accepted, but this account does not have Admin access.');
}
