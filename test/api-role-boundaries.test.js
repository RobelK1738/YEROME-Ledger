import { test } from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/index.js';

// Transport fixtures only: no real credentials, sessions or production writes.
test('every privileged API rejects a valid Owner before reading or mutating Admin data', async (t) => {
  const settings = { SUPABASE_URL: 'http://127.0.0.1:19997', SUPABASE_SERVICE_ROLE_KEY: 'synthetic-key', ADMIN_EMAIL: 'robiemelaku@gmail.com' };
  const previous = Object.fromEntries(Object.keys(settings).map((key) => [key, process.env[key]]));
  Object.assign(process.env, settings);
  t.after(() => { for (const key of Object.keys(settings)) {
    if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key];
  } });
  let role = 'owner';
  const token = () => `header.${Buffer.from(JSON.stringify({ sub: role, session_id: '11111111-1111-1111-1111-111111111111',
    iat: Math.floor(Date.now() / 1000), app_metadata: { role } })).toString('base64url')}.synthetic`;
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (input) => {
    const url = new URL(input);
    assert.equal(url.origin, settings.SUPABASE_URL);
    calls.push(url.pathname);
    if (url.pathname === '/auth/v1/user') return Response.json({ id: role, email: role === 'admin' ? settings.ADMIN_EMAIL : 'owner@example.test', app_metadata: { role } });
    if (url.pathname.endsWith('/v2_authorize_session')) return Response.json(role);
    if (url.pathname.endsWith('/owners')) return Response.json(role === 'admin' ? [] : { id: 'own-profile', status: 'active' });
    if (url.pathname.endsWith('/referrals') && role === 'admin') return Response.json([]);
    if (url.pathname.endsWith('/audit_log')) return new Response(null, { status: 201 });
    throw new Error(`Privileged data requested before Admin authorization: ${url.pathname}`);
  });
  const routes = {
    'admin/overview': ['GET'], 'admin/job': ['POST', 'PATCH'], 'admin/person': ['PATCH'],
    'admin/planning': ['PATCH'], 'admin/referral': ['POST', 'PATCH'], 'admin/paycheck': ['POST', 'PATCH'],
    'admin/transfers': ['GET', 'POST'], 'admin/settlements': ['GET', 'POST'], 'admin/commissions': ['GET', 'POST'],
    'owners/create': ['POST'], 'owners/delete': ['POST'], 'owners/reset-password': ['POST'], 'owners/set-status': ['POST'],
  };
  for (const [route, methods] of Object.entries(routes)) for (const method of methods) {
    const response = { statusCode: 200, setHeader() {}, status(code) { this.statusCode = code; return this; }, json(data) { this.data = data; return this; } };
    await handler({ method, query: { route, ownerId: 'someone-else' }, body: { ownerId: 'someone-else' },
      headers: { authorization: `Bearer ${token()}` } }, response);
    assert.equal(response.statusCode, 403, `${method} ${route}`);
    assert.deepEqual(Object.keys(response.data), ['error']);
  }
  assert.ok(calls.length > 0);
  role = 'admin';
  const response = { statusCode: 200, setHeader(name, value) { if (name === 'Cache-Control') this.cache = value; },
    status(code) { this.statusCode = code; return this; }, json(data) { this.data = data; return this; } };
  await handler({ method: 'GET', query: { route: 'admin/overview' }, headers: { authorization: `Bearer ${token()}` } }, response);
  assert.equal(response.statusCode, 200);
  assert.equal(response.cache, 'private, no-store');
  assert.ok(Number.isSafeInteger(response.data.packageAssumptions.fixedActualCents));
  assert.ok(response.data.gangCutDescription);
  assert.deepEqual(response.data.people, []);
});
