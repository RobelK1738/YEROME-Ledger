import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertBootstrapConfig, bootstrapAdmin } from '../scripts/bootstrap-admin.mjs';

const adminId = '40000000-0000-4000-8000-000000000004';
const adminUser = { id: adminId, email: 'robiemelaku@gmail.com',
  email_confirmed_at: '2026-10-20T00:00:00Z', app_metadata: { role: 'admin' } };
const config = { url: 'https://abcdefghijklmnopqrst.supabase.co',
  expectedProjectRef: 'abcdefghijklmnopqrst', expectedAdminUserId: adminId,
  serviceKey: 'synthetic', adminEmail: adminUser.email,
  auditReference: 'synthetic approved rehearsal' };

function client(users, pin = null) {
  const calls = [];
  const db = { auth: { admin: {
    async listUsers() { calls.push('list'); return { data: { users }, error: null }; },
    async createUser() { calls.push('create'); throw new Error('Must never create an Admin'); },
    async updateUserById() { calls.push('rotate'); throw new Error('Must never rotate a password'); },
  } }, async rpc(name, args) {
    calls.push(name);
    if (name === 'v2_admin_pin_status') return { data: pin, error: null };
    return { data: args.p_user, error: null };
  } };
  return { db, calls };
}

test('pins the exact existing Admin UUID without creating an account or changing the password', async () => {
  const first = client([adminUser]);
  const result = await bootstrapAdmin(first.db, config);
  assert.deepEqual(result, { id: adminId, pinned: true, created: false, passwordRotated: false });
  assert.deepEqual(first.calls, ['list', 'v2_admin_pin_status', 'v2_pin_admin']);

  const repeated = client([adminUser], adminId);
  assert.deepEqual(await bootstrapAdmin(repeated.db, config),
    { id: adminId, pinned: false, created: false, passwordRotated: false });
  assert.deepEqual(repeated.calls, ['list', 'v2_admin_pin_status']);
});

test('refuses absent, conflicting, unconfirmed, or unexpected Admin identities before mutation', async () => {
  for (const [users, options] of [
    [[], config],
    [[adminUser, { id: 'other', email: 'other@example.test', app_metadata: { role: 'admin' } }], config],
    [[{ ...adminUser, email_confirmed_at: null }], config],
    [[{ ...adminUser, deleted_at: '2026-10-21T00:00:00Z' }], config],
    [[{ ...adminUser, banned_until: '2999-01-01T00:00:00Z' }], config],
    [[adminUser], { ...config, expectedAdminUserId: '50000000-0000-4000-8000-000000000005' }],
  ]) {
    const check = client(users);
    await assert.rejects(bootstrapAdmin(check.db, options));
    assert.equal(check.calls.includes('create'), false);
    assert.equal(check.calls.includes('rotate'), false);
    assert.equal(check.calls.includes('v2_pin_admin'), false);
  }
});

test('refuses a pin held by a different UUID', async () => {
  const check = client([adminUser], '50000000-0000-4000-8000-000000000005');
  await assert.rejects(bootstrapAdmin(check.db, config), /Pinned identity conflict/);
  assert.deepEqual(check.calls, ['list', 'v2_admin_pin_status']);
});

test('rejects password inputs, wrong project, and missing pinned UUID', async () => {
  assert.throws(() => assertBootstrapConfig({ ...config, expectedProjectRef: 'wrong' }), /project/);
  assert.throws(() => assertBootstrapConfig({ ...config, url: 'http://abcdefghijklmnopqrst.supabase.co' }), /project/);
  assert.throws(() => assertBootstrapConfig({ ...config, expectedAdminUserId: undefined }), /UUID/);
  for (const unsafe of [{ bootstrapPassword: 'Fresh-Synthetic-Secret-2026!' },
    { rotatePassword: true }, { createIfMissing: true }]) {
    const check = client([adminUser]);
    await assert.rejects(bootstrapAdmin(check.db, { ...config, ...unsafe }), /password|creation/i);
    assert.deepEqual(check.calls, []);
  }
});
