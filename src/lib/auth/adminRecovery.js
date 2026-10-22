// Recovery credentials are handled only on /reset-password. Supabase's global
// URL detection stays disabled so other routes cannot consume a recovery link.
export const ADMIN_EMAIL = 'robiemelaku@gmail.com';
export const ADMIN_RECOVERY_REDIRECT_URL = 'https://yerome-ledger.vercel.app/reset-password';

const EXPIRED_CODES = new Set(['otp_expired', 'expired_token', 'token_expired']);

function errorKind(error) {
  return EXPIRED_CODES.has(error?.code) ? 'expired' : 'invalid';
}

function isAdminUser(user) {
  return user?.email?.toLowerCase() === ADMIN_EMAIL && user?.app_metadata?.role !== 'owner';
}

async function discardLocalSession(auth) {
  try { await auth.signOut({ scope: 'local' }); } catch { /* Never show Auth internals. */ }
}

async function redeem(auth, callback) {
  try {
    let result;
    if (callback.kind === 'pkce') {
      result = await auth.exchangeCodeForSession(callback.code,
        callback.flowId ? { flowId: callback.flowId } : undefined);
      if (result.error || !result.data?.session) return { kind: errorKind(result.error) };
      // A valid OAuth or signup code must not unlock the password form.
      if (result.data.redirectType !== 'recovery') {
        await discardLocalSession(auth);
        return { kind: 'invalid' };
      }
    } else {
      result = await auth.setSession({
        access_token: callback.accessToken, refresh_token: callback.refreshToken,
      });
      if (result.error || !result.data?.session) return { kind: errorKind(result.error) };
    }
    // getUser validates the session with Auth; getSession alone trusts local storage.
    const { data, error } = await auth.getUser();
    if (error || !isAdminUser(data?.user)) {
      await discardLocalSession(auth);
      return { kind: errorKind(error) };
    }
    return { kind: 'ready' };
  } catch (error) {
    return { kind: errorKind(error) };
  }
}

function recoveryAttempt(callback) {
  let secret = callback;
  let pending;
  return {
    kind: 'link',
    redeem(auth) {
      if (!pending) {
        const captured = secret;
        secret = null;
        pending = redeem(auth, captured);
      }
      return pending;
    },
  };
}

// Called once before React mounts. The fragment and query are removed before
// any async Auth call, React render, link click, or browser navigation.
export function captureAdminRecoveryCallback(location, history) {
  const query = new URLSearchParams(location.search);
  const fragment = new URLSearchParams(location.hash.replace(/^#/, ''));
  // Dashboard-issued messages without redirectTo use the production Site URL.
  // Move its implicit recovery callback to the dedicated route before render.
  const siteFallback = location.pathname === '/' &&
    (fragment.get('type') === 'recovery' || fragment.has('error_code'));
  if (location.pathname !== '/reset-password' && !siteFallback) return { kind: 'none' };
  if (!location.search && !location.hash) return { kind: 'none' };
  try { history.replaceState(history.state, '', '/reset-password'); }
  catch {
    // A failed history replacement must never proceed to redeem a visible token.
    location.replace?.('/reset-password');
    return { kind: 'invalid' };
  }

  const code = query.get('error_code') || fragment.get('error_code');
  if (query.has('error') || fragment.has('error') || code) {
    return { kind: EXPIRED_CODES.has(code) ? 'expired' : 'invalid' };
  }
  if (query.has('code')) {
    const authCode = query.get('code');
    return authCode ? recoveryAttempt({ kind: 'pkce', code: authCode,
      flowId: query.get('sb_flow_id') }) : { kind: 'invalid' };
  }
  if (fragment.has('access_token') || fragment.has('refresh_token')) {
    const accessToken = fragment.get('access_token');
    const refreshToken = fragment.get('refresh_token');
    if (fragment.get('type') !== 'recovery' || !accessToken || !refreshToken) {
      return { kind: 'invalid' };
    }
    return recoveryAttempt({ kind: 'implicit', accessToken, refreshToken });
  }
  return { kind: 'invalid' };
}

export function hasPasswordInput(password) {
  return typeof password === 'string' && password.length > 0;
}

export async function requestAdminRecovery(auth, email) {
  // Do not initiate recovery for Owner accounts or expose account existence.
  if (email?.trim().toLowerCase() !== ADMIN_EMAIL) return { kind: 'sent' };
  try {
    const { error } = await auth.resetPasswordForEmail(ADMIN_EMAIL,
      { redirectTo: ADMIN_RECOVERY_REDIRECT_URL });
    return { kind: error ? 'unavailable' : 'sent' };
  } catch { return { kind: 'unavailable' }; }
}

export async function completeAdminRecovery(auth, password, authorized) {
  if (!authorized || !hasPasswordInput(password)) return { kind: 'invalid' };
  try {
    const { data, error } = await auth.getUser();
    if (error || !isAdminUser(data?.user)) return { kind: errorKind(error) };
    const update = await auth.updateUser({ password });
    if (update.error) {
      if (EXPIRED_CODES.has(update.error.code)) return { kind: 'expired' };
      if (update.error.status === 401 || update.error.status === 403) return { kind: 'invalid' };
      return { kind: 'password-rejected' };
    }
    // Global sign-out revokes refresh tokens; Admin must sign in again.
    try {
      const signOut = await auth.signOut({ scope: 'global' });
      if (signOut.error) throw signOut.error;
      return { kind: 'complete', revoked: true };
    } catch {
      await discardLocalSession(auth);
      return { kind: 'complete', revoked: false };
    }
  } catch (error) {
    return { kind: errorKind(error) };
  }
}
