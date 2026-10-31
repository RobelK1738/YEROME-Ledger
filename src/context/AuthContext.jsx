// Browser route state follows the server's live session decision. JWT role
// metadata alone never grants a portal.
import { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabase/client.js';
import { ownerLogin as ownerLoginApi } from '../lib/data/adminApi.js';
import { sessionAuthorization, adminPasswordLogin } from '../lib/auth/signIn.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [authorization, setAuthorization] = useState({ role: null });
  const [loading, setLoading] = useState(true);

  const refreshAuthorization = useCallback(async (nextSession) => {
    const result = await sessionAuthorization(nextSession);
    setSession(nextSession ?? null);
    setAuthorization(result);
    setLoading(false);
    return result;
  }, []);

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(async ({ data }) => {
      if (active) await refreshAuthorization(data.session);
    }).catch(() => { if (active) { setAuthorization({ role: null }); setLoading(false); } });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      // Schedule outside Supabase's auth callback to avoid its internal lock.
      setTimeout(() => { if (active) void refreshAuthorization(nextSession); }, 0);
    });
    return () => { active = false; sub.subscription.unsubscribe(); };
  }, [refreshAuthorization]);

  const adminLogin = useCallback(async (email, password) => {
    return adminPasswordLogin(supabase.auth, email, password, refreshAuthorization);
  }, [refreshAuthorization]);

  const ownerLogin = useCallback(async (username, password) => {
    const { access_token, refresh_token } = await ownerLoginApi(username, password);
    const { data, error } = await supabase.auth.setSession({ access_token, refresh_token });
    if (error || !data.session) throw new Error('Invalid sign-in details.');
    const result = await refreshAuthorization(data.session);
    if (result.role !== 'owner') {
      await supabase.auth.signOut({ scope: 'local' });
      await refreshAuthorization(null);
      throw new Error('Invalid sign-in details.');
    }
    return result;
  }, [refreshAuthorization]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    await refreshAuthorization(null);
  }, [refreshAuthorization]);

  const value = useMemo(() => ({
    session, user: session?.user ?? null, role: authorization.role,
    isAdmin: authorization.role === 'admin', isOwner: authorization.role === 'owner',
    isAuthenticated: Boolean(session && authorization.role), loading,
    configured: isSupabaseConfigured, adminLogin, ownerLogin, signOut, refreshAuthorization,
  }), [session, authorization, loading, adminLogin, ownerLogin, signOut, refreshAuthorization]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider.');
  return ctx;
}
