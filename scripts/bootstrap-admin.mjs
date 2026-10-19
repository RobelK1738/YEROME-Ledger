#!/usr/bin/env node
// Run locally against a verified project after isolated rehearsal. The fresh
// bootstrap password is supplied in process env only and never printed.
import { createClient } from '@supabase/supabase-js';
import { pathToFileURL } from 'node:url';
import { loadEnv } from './_env.mjs';

const DESIGNATED_EMAIL = 'robiemelaku@gmail.com';

export function assertBootstrapConfig({ url, serviceKey, adminEmail, expectedProjectRef }) {
  if (!url || !serviceKey || adminEmail !== DESIGNATED_EMAIL ||
      !/^[a-z0-9]{20}$/.test(expectedProjectRef || '')) {
    throw new Error('Exact Supabase project ref, designated ADMIN_EMAIL and service key are required.');
  }
  let host;
  try { host = new URL(url).hostname; } catch { throw new Error('Invalid Supabase project URL.'); }
  if (host !== `${expectedProjectRef}.supabase.co`) {
    throw new Error('Supabase URL does not match the explicitly selected project.');
  }
}

function strongPassword(password) {
  return typeof password === 'string' && password.length >= 20 &&
    /[a-z]/.test(password) && /[A-Z]/.test(password) && /[0-9]/.test(password) &&
    /[^a-zA-Z0-9]/.test(password);
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
  if (matching.length > 1 || roleAdmins.length > 1 ||
      (roleAdmins.length === 1 && roleAdmins[0].id !== matching[0]?.id)) {
    throw new Error('Conflicting Admin identities require independent review. No account changed.');
  }
  const { data: pinnedId, error: statusError } = await admin.rpc('v2_admin_pin_status');
  if (statusError) throw new Error('Single Admin migration is missing or inaccessible.');
  if (pinnedId && (!matching.length || pinnedId !== matching[0].id)) {
    throw new Error('Pinned identity conflict. Use the documented recovery procedure.');
  }
  if (matching.length && matching[0].app_metadata?.role !== 'admin') {
    throw new Error('Designated email has a non-Admin identity. Resolve it independently.');
  }
  const password = config.bootstrapPassword;
  if ((!pinnedId || config.rotatePassword) && !strongPassword(password)) {
    throw new Error('A new strong temporary bootstrap password is required.');
  }
  let user = matching[0];
  if (!user) {
    const { data, error } = await admin.auth.admin.createUser({
      email: DESIGNATED_EMAIL, password, email_confirm: true, app_metadata: { role: 'admin' },
    });
    if (error || !data?.user) throw new Error('Could not create designated Admin.');
    user = data.user;
  } else if (password && (!pinnedId || config.rotatePassword)) {
    const { error } = await admin.auth.admin.updateUserById(user.id, { password });
    if (error) throw new Error('Could not rotate designated Admin password.');
  }
  const { data: id, error: pinError } = await admin.rpc('v2_pin_admin', {
    p_user: user.id, p_reference: config.auditReference,
  });
  if (pinError || id !== user.id) throw new Error('Admin pin failed; inspect project before retry.');
  return { id, created: !matching.length, passwordRotated: Boolean(password) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const bootstrapPassword = process.env.ADMIN_BOOTSTRAP_PASSWORD;
  delete process.env.ADMIN_BOOTSTRAP_PASSWORD;
  const env = loadEnv();
  const config = { ...env, bootstrapPassword,
    expectedProjectRef: process.env.EXPECTED_SUPABASE_PROJECT_REF,
    auditReference: process.env.ADMIN_BOOTSTRAP_AUDIT_REFERENCE,
    rotatePassword: process.env.ADMIN_ROTATE_PASSWORD === 'true' };
  try {
    assertBootstrapConfig(config);
    if (!config.auditReference || config.auditReference.trim().length < 8) {
      throw new Error('Audited bootstrap reference is required.');
    }
    const client = createClient(config.url, config.serviceKey,
      { auth: { autoRefreshToken: false, persistSession: false } });
    const result = await bootstrapAdmin(client, config);
    console.log(result.created ? 'Designated Admin created and pinned.' :
      'Designated Admin identity verified and pinned.');
    console.log(result.passwordRotated ? 'Temporary password used; remove it from the shell environment.' :
      'No password was changed on this idempotent run.');
    console.log('Complete TOTP enrollment and a fresh AAL2 login before release.');
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
