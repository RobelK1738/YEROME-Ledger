#!/usr/bin/env node
// Pin only the existing, verified Admin identity after an approved migration.
// This command never creates users or changes a password.
import { createClient } from '@supabase/supabase-js';
import { pathToFileURL } from 'node:url';
import { loadEnv } from './_env.mjs';

const DESIGNATED_EMAIL = 'robiemelaku@gmail.com';

export function assertBootstrapConfig({ url, serviceKey, adminEmail, expectedProjectRef,
  expectedAdminUserId, auditReference, bootstrapPassword, rotatePassword, createIfMissing }) {
  if (!url || !serviceKey || adminEmail !== DESIGNATED_EMAIL ||
      !/^[a-z0-9]{20}$/.test(expectedProjectRef || '')) {
    throw new Error('Exact Supabase project ref, designated ADMIN_EMAIL and service key are required.');
  }
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    .test(expectedAdminUserId || '')) {
    throw new Error('The previously inventoried Admin UUID is required.');
  }
  if (typeof auditReference !== 'string' || auditReference.trim().length < 8) {
    throw new Error('Audited pin reference is required.');
  }
  if (bootstrapPassword !== undefined || rotatePassword || createIfMissing) {
    throw new Error('Password change and account creation are not supported by this pin-only command.');
  }
  let endpoint;
  try { endpoint = new URL(url); } catch { throw new Error('Invalid Supabase project URL.'); }
  if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password ||
      endpoint.pathname !== '/' || endpoint.search || endpoint.hash ||
      endpoint.hostname !== `${expectedProjectRef}.supabase.co`) {
    throw new Error('Supabase URL does not match the explicitly selected project.');
  }
}

async function allAuthUsers(admin) {
  const users = [];
  for (let page = 1; ; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error('Could not inventory Auth users.');
    users.push(...(data?.users || []));
    if ((data?.users?.length || 0) < 200) return users;
  }
}

export async function bootstrapAdmin(admin, config) {
  assertBootstrapConfig(config);
  const users = await allAuthUsers(admin);
  const matching = users.filter((user) => user.email?.toLowerCase() === DESIGNATED_EMAIL);
  const roleAdmins = users.filter((user) => user.app_metadata?.role === 'admin');
  if (matching.length !== 1 || roleAdmins.length !== 1 ||
      matching[0].id !== roleAdmins[0].id || matching[0].id !== config.expectedAdminUserId) {
    throw new Error('The expected existing Admin identity was not uniquely verified. No account changed.');
  }
  if (!matching[0].email_confirmed_at || matching[0].deleted_at ||
      (matching[0].banned_until && new Date(matching[0].banned_until) > new Date())) {
    throw new Error('The existing Admin is not active and email-confirmed. No account changed.');
  }
  const { data: pinnedId, error: statusError } = await admin.rpc('v2_admin_pin_status');
  if (statusError) throw new Error('Single Admin migration is missing or inaccessible.');
  if (pinnedId && pinnedId !== matching[0].id) {
    throw new Error('Pinned identity conflict. Use the documented recovery procedure.');
  }
  if (pinnedId) return { id: pinnedId, pinned: false, created: false, passwordRotated: false };
  const { data: id, error: pinError } = await admin.rpc('v2_pin_admin', {
    p_user: matching[0].id, p_reference: config.auditReference.trim(),
  });
  if (pinError || id !== matching[0].id) throw new Error('Admin pin failed; inspect project before retry.');
  return { id, pinned: true, created: false, passwordRotated: false };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const env = loadEnv();
  const config = { ...env, bootstrapPassword: process.env.ADMIN_BOOTSTRAP_PASSWORD,
    expectedProjectRef: process.env.EXPECTED_SUPABASE_PROJECT_REF,
    expectedAdminUserId: process.env.EXPECTED_ADMIN_USER_ID,
    auditReference: process.env.ADMIN_BOOTSTRAP_AUDIT_REFERENCE,
    rotatePassword: process.env.ADMIN_ROTATE_PASSWORD === 'true',
    createIfMissing: process.env.ADMIN_CREATE_IF_MISSING === 'true' };
  try {
    assertBootstrapConfig(config);
    const client = createClient(config.url, config.serviceKey,
      { auth: { autoRefreshToken: false, persistSession: false } });
    const result = await bootstrapAdmin(client, config);
    console.log(result.pinned ? 'Existing designated Admin UUID verified and pinned.' :
      'Existing designated Admin UUID was already pinned.');
    console.log('No Auth user was created and no password was changed.');
    console.log('Verify a fresh password login to the pinned Admin account before release.');
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
