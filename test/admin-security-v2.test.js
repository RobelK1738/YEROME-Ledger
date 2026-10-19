import { test } from 'node:test';
import assert from 'node:assert/strict';
import { requireAdmin } from '../server/_lib/supabaseAdmin.js';

const token = (id, aal = 'aal2', role = 'admin') => `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({
  sub: id, session_id: '11111111-1111-1111-1111-111111111111',
  iat: Math.floor(Date.now() / 1000), aal, app_metadata: { role },
})).toString('base64url')}.synthetic`;

test('correct email and admin role cannot substitute for canonical UUID and MFA authorization', async (t) => {
  const keys = { SUPABASE_URL: 'http://127.0.0.1:19999', SUPABASE_SERVICE_ROLE_KEY: 'synthetic-key', ADMIN_EMAIL: 'robiemelaku@gmail.com' };
  const previous = Object.fromEntries(Object.keys(keys).map((k) => [k, process.env[k]]));
  Object.assign(process.env, keys);
  t.after(() => { for (const k of Object.keys(keys)) {
    if (previous[k] === undefined) delete process.env[k]; else process.env[k] = previous[k];
  } });
  let identity = 'second-admin';
  let liveEmail = keys.ADMIN_EMAIL;
  let liveRole = 'admin';
  t.mock.method(globalThis, 'fetch', async (input, init) => {
    const url = new URL(input); assert.equal(url.origin, keys.SUPABASE_URL);
    if (url.pathname === '/auth/v1/user') return Response.json({ id: identity, email: liveEmail,
      app_metadata: { role: liveRole } });
    if (url.pathname.endsWith('/v2_authorize_session')) {
      const body = JSON.parse(init.body);
      return Response.json(body.p_user === 'canonical-admin' && body.p_aal === 'aal2' ? 'admin' : null);
    }
    if (url.pathname.endsWith('/audit_log')) return new Response(null, { status: 201 });
    throw new Error(`Unexpected request ${url.pathname}`);
  });
  assert.equal((await requireAdmin({ headers: { authorization: `Bearer ${token(identity)}` } })).ok, false);
  identity = 'canonical-admin';
  assert.equal((await requireAdmin({ headers: { authorization: `Bearer ${token(identity, 'aal1')}` } })).ok, false);
  liveEmail = 'wrong@example.test';
  assert.equal((await requireAdmin({ headers: { authorization: `Bearer ${token(identity)}` } })).ok, false);
  liveEmail = keys.ADMIN_EMAIL;
  liveRole = 'owner';
  assert.equal((await requireAdmin({ headers: { authorization: `Bearer ${token(identity)}` } })).ok, false);
  liveRole = 'admin';
  assert.equal((await requireAdmin({ headers: { authorization: `Bearer ${token(identity)}` } })).ok, true);
});
