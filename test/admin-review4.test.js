import { test } from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/index.js';

// Exercises real routing, auth validation, Supabase client requests and DTOs with
// a synthetic HTTP transport. Database rules run separately in PostgreSQL.
test('Admin routes select historic terms; owners cannot access transfer evidence or mutations', async (t) => {
  const settings = { SUPABASE_URL: 'http://127.0.0.1:19999', SUPABASE_SERVICE_ROLE_KEY: 'synthetic-test-key',
    ADMIN_EMAIL: 'robiemelaku@gmail.com' };
  const previous = Object.fromEntries(Object.keys(settings).map((key) => [key, process.env[key]]));
  Object.assign(process.env, settings);
  t.after(() => { for (const key of Object.keys(settings)) {
    if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key];
  } });
  const writes = [];
  const terms = [
    { id: 'old', effective_from: '2026-01-01', effective_to: '2026-06-30', first_pay_date: '2026-02-13', pay_frequency: 'biweekly' },
    { id: 'new', effective_from: '2026-07-01', effective_to: null, first_pay_date: '2026-07-31', pay_frequency: 'monthly' },
  ];
  const jwt = (kind) => `header.${Buffer.from(JSON.stringify({ sub: kind === 'admin' ? 'admin-id' : 'owner-id',
    session_id: '11111111-1111-1111-1111-111111111111', iat: Math.floor(Date.now() / 1000),
    aal: kind === 'admin' ? 'aal2' : 'aal1', app_metadata: { role: kind === 'admin' ? 'admin' : 'owner' },
  })).toString('base64url')}.synthetic`;
  t.mock.method(globalThis, 'fetch', async (input, init) => {
    const url = new URL(input);
    assert.equal(url.origin, settings.SUPABASE_URL); // Never contact a hosted service.
    if (url.pathname === '/auth/v1/user') {
      const token = new Headers(init.headers).get('authorization');
      const isAdmin = token === `Bearer ${jwt('admin')}`;
      return Response.json({ id: isAdmin ? 'admin-id' : 'owner-id',
        email: isAdmin ? settings.ADMIN_EMAIL : 'owner@example.test',
        app_metadata: { role: isAdmin ? 'admin' : 'owner' } });
    }
    if (url.pathname.endsWith('/v2_authorize_session')) {
      const body = JSON.parse(init.body);
      return Response.json(body.p_user === 'admin-id' ? 'admin' : 'owner');
    }
    if (url.pathname.endsWith('/jobs')) return Response.json({ id: 'job' });
    if (url.pathname.endsWith('/audit_log')) return new Response(null, { status: 201 });
    if (url.pathname.endsWith('/job_compensation_terms')) {
      assert.equal(url.searchParams.has('effective_to'), false);
      return Response.json(terms);
    }
    if (url.pathname.includes('/rpc/')) {
      writes.push({ path: url.pathname, body: JSON.parse(init.body) });
      return Response.json('synthetic-id');
    }
    throw new Error(`Unexpected database request ${url.pathname}`);
  });
  async function request(route, token, body, method = 'POST') {
    const response = { statusCode: 200, status(code) { this.statusCode = code; return this; },
      setHeader() {}, json(data) { this.data = data; return this; } };
    await handler({ method, query: { route }, headers: { authorization: `Bearer ${jwt(token)}` }, body }, response);
    return response;
  }
  for (const role of ['owner-a', 'miki']) {
    for (const [route, method] of [['admin/transfers', 'GET'], ['admin/transfers', 'POST'],
      ['admin/paycheck', 'POST'], ['admin/settlements', 'POST'], ['admin/commissions', 'POST']]) {
      const response = await request(route, role, { action: 'verify', transferId: 'forged' }, method);
      assert.equal(response.statusCode, 403);
      assert.deepEqual(Object.keys(response.data), ['error']);
    }
  }
  assert.equal(writes.length, 0);
  const old = await request('admin/paycheck', 'admin', { jobId: 'job', firstPayDate: '2026-02-13', count: 2 });
  assert.equal(old.statusCode, 200);
  assert.deepEqual(writes.at(-1).body, { p_job: 'job', p_term: 'old',
    p_dates: ['2026-02-13', '2026-02-27'], p_actor: 'admin-id' });
  const countBefore = writes.length;
  assert.equal((await request('admin/paycheck', 'admin', { jobId: 'job', firstPayDate: '2026-06-19', count: 2 })).statusCode, 400);
  assert.equal(writes.length, countBefore);
  assert.equal((await request('admin/paycheck', 'admin', { jobId: 'job', firstPayDate: '2026-07-31', count: 2 })).statusCode, 200);
  assert.equal(writes.at(-1).body.p_term, 'new');
  const transfer = { recipientOwnerId: 'person', totalCents: 20000, paidAt: '2026-03-01', reference: 'bank-ref',
    sourceAccountAlias: 'bank/source', destinationAccountAlias: 'person/destination' };
  assert.equal((await request('admin/transfers', 'admin', { ...transfer, action: 'register' })).statusCode, 201);
  assert.ok(writes.at(-1).path.endsWith('/v2_register_transfer'));
  const beforeVerify = writes.length;
  assert.equal((await request('admin/transfers', 'admin', { ...transfer, action: 'verify', transferId: 'transfer', evidenceReference: 'proof' })).statusCode, 400);
  assert.equal(writes.length, beforeVerify);
  assert.equal((await request('admin/transfers', 'admin', { ...transfer, action: 'verify', transferId: 'transfer', evidenceReference: 'proof', evidenceConfirmed: true })).statusCode, 201);
  assert.ok(writes.at(-1).path.endsWith('/v2_verify_transfer'));
  assert.equal((await request('admin/commissions', 'admin', { action: 'payment', accrualId: 'accrual',
    amountCents: 10000, transferId: 'transfer', idempotencyKey: 'stable' })).statusCode, 201);
  assert.deepEqual(writes.at(-1).body, { p_accrual: 'accrual', p_amount_cents: 10000,
    p_transfer: 'transfer', p_key: 'stable', p_actor: 'admin-id' });
});
