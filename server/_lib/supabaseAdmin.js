// Server-only Supabase helpers for Vercel serverless functions.
//
// SECURITY: This module uses the SERVICE-ROLE key, which bypasses RLS. It must
// NEVER be imported by client code. Files/directories prefixed with "_" are not
// exposed as HTTP routes by Vercel.

import { createClient } from '@supabase/supabase-js';

export function getEnv() {
  return {
    url: process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
    serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    anonKey: process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    adminEmail: process.env.ADMIN_EMAIL,
    ownerAuthDomain: process.env.OWNER_AUTH_DOMAIN || 'owners.local',
  };
}

/** Service-role client (bypasses RLS). Server use only. */
export function adminClient() {
  const { url, serviceKey } = getEnv();
  if (!url || !serviceKey) throw new Error('Server is missing Supabase configuration.');
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/** Anon client for privilege-free operations (e.g. Owner password sign-in). */
export function anonClient() {
  const { url, anonKey } = getEnv();
  if (!url || !anonKey) throw new Error('Server is missing Supabase configuration.');
  return createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/** Auth verifies the token first; only then read its claims and check live DB state. */
export async function authorizeRequest(req) {
  const header = req.headers.authorization || req.headers.Authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return { ok: false, status: 401, error: 'Not authorized.' };
  const db = adminClient();
  try {
    const { data, error } = await db.auth.getUser(token);
    if (error || !data?.user) return { ok: false, status: 401, error: 'Not authorized.' };
    const user = data.user;
    const claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
    if (claims.sub !== user.id || !Number.isSafeInteger(claims.iat)) {
      return { ok: false, status: 403, error: 'Not authorized.' };
    }
    const { adminEmail } = getEnv();
    const { data: role, error: authError } = await db.rpc('v2_authorize_session', {
      p_user: user.id, p_session: claims.session_id || null, p_iat: claims.iat,
      p_aal: claims.aal || null, p_role: claims.app_metadata?.role || null,
      p_admin_email: adminEmail || null,
    });
    const adminIdentityMatches = adminEmail === 'robiemelaku@gmail.com' &&
      user.email?.toLowerCase() === adminEmail && user.app_metadata?.role === 'admin';
    if (authError || !['admin', 'admin_mfa_required', 'owner'].includes(role) ||
        (role.startsWith('admin') && !adminIdentityMatches) ||
        (role === 'admin' && claims.aal !== 'aal2') ||
        (role === 'owner' && user.app_metadata?.role !== 'owner')) {
      await serverAudit(db, { actorUserId: user.id, action: 'security.authorization_denied',
        entityType: 'auth_user', entityId: user.id, metadata: {} });
      return { ok: false, status: 403, error: 'Not authorized.' };
    }
    return { ok: true, role, user, db };
  } catch {
    return { ok: false, status: 403, error: 'Not authorized.' };
  }
}

/** Every privileged route shares the pinned UUID, current session and MFA gate. */
export async function requireAdmin(req) {
  const auth = await authorizeRequest(req);
  if (!auth.ok) return auth;
  if (auth.role !== 'admin') {
    await serverAudit(auth.db, { actorUserId: auth.user.id, action: 'security.admin_access_denied',
      entityType: 'auth_user', entityId: auth.user.id, metadata: {} });
    return { ok: false, status: 403, error: 'Not authorized.' };
  }
  return auth;
}

/** Owner management must never target the canonical Admin or another admin role. */
export async function manageableOwnerIdentity(db, owner, adminUserId) {
  if (!owner.auth_user_id) return true;
  if (owner.auth_user_id === adminUserId) return false;
  const { data, error } = await db.auth.admin.getUserById(owner.auth_user_id);
  return !error && data?.user?.app_metadata?.role === 'owner';
}

/** Parse a JSON request body defensively (Vercel usually pre-parses it). */
export async function readJsonBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }
  return await new Promise((resolve) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
    });
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        resolve({});
      }
    });
    req.on('error', () => resolve({}));
  });
}

const USERNAME_RE = /^[a-z0-9_]{3,40}$/;

export function validateUsername(username) {
  if (!username || typeof username !== 'string') return 'Username is required.';
  const u = username.toLowerCase();
  if (!USERNAME_RE.test(u)) {
    return 'Username must be 3-40 characters: lowercase letters, numbers, or underscores.';
  }
  return null;
}

export function validatePassword(password) {
  if (!password || typeof password !== 'string' || password.length < 8) {
    return 'Password must be at least 8 characters.';
  }
  return null;
}

/** Write an audit entry with the service-role client (never logs secrets). */
export async function serverAudit(admin, { actorUserId, action, entityType, entityId, metadata }) {
  try {
    const { error } = await admin.from('audit_log').insert({
      actor_user_id: actorUserId ?? null,
      action,
      entity_type: entityType,
      entity_id: entityId ?? null,
      metadata_json: metadata ?? {},
    });
    if (error) throw error;
    return true;
  } catch {
    console.error('Server audit insertion failed');
    return false;
  }
}
