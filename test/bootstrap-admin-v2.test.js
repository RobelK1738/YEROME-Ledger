import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertBootstrapConfig, bootstrapAdmin } from '../scripts/bootstrap-admin.mjs';

const config = { url: 'https://abcdefghijklmnopqrst.supabase.co',
  expectedProjectRef: 'abcdefghijklmnopqrst', serviceKey: 'synthetic',
  adminEmail: 'robiemelaku@gmail.com', auditReference: 'synthetic approved rehearsal',
  bootstrapPassword: 'Fresh-Synthetic-Secret-2026!' };
function client(users, pin = null) {
  const calls = [];
  const db = { auth: { admin: {
    async listUsers() { calls.push('list'); return { data: { users }, error: null }; },
    async createUser() { calls.push('create'); const user = { id: 'one', email: config.adminEmail,
      app_metadata: { role: 'admin' } }; users.push(user); return { data: { user }, error: null }; },
    async updateUserById() { calls.push('rotate'); return { error: null }; },
  } }, async rpc(name, args) { calls.push(name); if (name === 'v2_admin_pin_status') return { data: pin, error: null };
    return { data: args.p_user, error: null }; } };
  return { db, calls };
}
test('bootstrap is idempotent and never creates a backup Admin', async () => {
  const first = client([]);
  assert.equal((await bootstrapAdmin(first.db,config)).created,true);
  assert.equal(first.calls.filter((call) => call === 'create').length,1);
  const second = client([{ id:'one', email:config.adminEmail,app_metadata:{role:'admin'} }],'one');
  const result = await bootstrapAdmin(second.db,{...config,bootstrapPassword:undefined});
  assert.equal(result.created,false);
  assert.equal(second.calls.includes('create'),false);
  assert.equal(second.calls.includes('rotate'),false);
});
test('bootstrap refuses ambiguous roles, wrong project and weak password before mutation', async () => {
  assert.throws(() => assertBootstrapConfig({...config,expectedProjectRef:'wrong'}),/project/);
  const conflicts = client([{id:'one',email:config.adminEmail,app_metadata:{role:'admin'}},
    {id:'two',email:'other@example.test',app_metadata:{role:'admin'}}]);
  await assert.rejects(bootstrapAdmin(conflicts.db,config),/Conflicting Admin/);
  assert.deepEqual(conflicts.calls,['list']);
  const weak = client([]);
  await assert.rejects(bootstrapAdmin(weak.db,{...config,bootstrapPassword:'old'}),/strong/);
  assert.deepEqual(weak.calls,['list','v2_admin_pin_status']);
});
