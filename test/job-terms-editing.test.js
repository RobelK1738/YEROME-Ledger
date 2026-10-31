import { test } from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/index.js';
import { jobFormFromExisting, jobPayload, minimumJobTermsDate } from '../src/lib/presentation/forms.js';

test('Admin editing sees future terms without using them in as-of statements; date errors are actionable', async (t) => {
  const settings = { SUPABASE_URL: 'http://127.0.0.1:19999', SUPABASE_SERVICE_ROLE_KEY: 'synthetic-key',
    ADMIN_EMAIL: 'robiemelaku@gmail.com' };
  const previous = Object.fromEntries(Object.keys(settings).map((key) => [key, process.env[key]]));
  Object.assign(process.env, settings);
  t.after(() => { for (const key of Object.keys(settings)) {
    if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key];
  } });
  const start = `${new Date().getUTCFullYear() + 1}-11-02`;
  const today = `${new Date().getUTCFullYear()}-10-30`;
  const next = start.replace('11-02', '11-03');
  const owner = { id: 'person', display_name: 'Test Person', filing_status: 'single', state: 'TX', status: 'active' };
  const future = { job_id: 'job', effective_from: start, mode: 'hourly', hourly_rate_cents: 1400,
    expected_weekly_hours: '40.000', annual_salary_cents: null, pay_frequency: 'biweekly',
    first_pay_date: start.replace('11-02', '11-13'), periods_per_year: 26 };
  const token = (role) => `header.${Buffer.from(JSON.stringify({ sub: role,
    session_id: '11111111-1111-1111-1111-111111111111', iat: Math.floor(Date.now() / 1000),
    app_metadata: { role } })).toString('base64url')}.synthetic`;
  let editReads = 0;
  let rpcError = 'New terms must start prospectively after current terms';
  let mutation;
  t.mock.method(globalThis, 'fetch', async (input, init) => {
    const url = new URL(input);
    assert.equal(url.origin, settings.SUPABASE_URL);
    const table = url.pathname.split('/').at(-1);
    if (url.pathname === '/auth/v1/user') {
      const role = new Headers(init.headers).get('authorization') === `Bearer ${token('admin')}` ? 'admin' : 'owner';
      return Response.json({ id: role, email: role === 'admin' ? settings.ADMIN_EMAIL : 'owner@example.test',
        app_metadata: { role } });
    }
    if (table === 'v2_authorize_session') return Response.json(JSON.parse(init.body).p_user);
    if (table === 'owners') return Response.json(url.searchParams.has('id') || url.searchParams.has('auth_user_id')
      ? owner : [owner]);
    if (table === 'jobs') return Response.json([{ id: 'job', owner_id: owner.id, employer_name: 'Test Employer',
      start_date: start, status: 'active' }]);
    if (table === 'job_compensation_terms') {
      if (url.searchParams.get('effective_to') === 'is.null') editReads += 1;
      return Response.json([future]);
    }
    if (table === 'v2_change_job_terms') {
      mutation = JSON.parse(init.body);
      return rpcError ? Response.json({ code: 'P0001', message: rpcError }, { status: 400 }) : Response.json('new-term');
    }
    return Response.json([]);
  });
  async function request(route, role, body, method = 'GET') {
    const res = { statusCode: 200, status(code) { this.statusCode = code; return this; },
      setHeader() {}, json(data) { this.data = data; return this; } };
    await handler({ method, query: { route }, headers: { authorization: `Bearer ${token(role)}` }, body }, res);
    return res;
  }
  const overview = await request('admin/overview', 'admin');
  assert.equal(overview.statusCode, 200);
  const job = overview.data.people[0].myJobs[0];
  assert.equal(job.latestTerms.effectiveFrom, start);
  assert.equal(job.compensationMode, null);
  assert.equal(overview.data.people[0].annualGrossEstimateCents, 0);
  const form = jobFormFromExisting(job, today);
  assert.equal(form.hourlyRate, '14');
  assert.equal(Number(form.expectedWeeklyHours), 40);
  assert.equal(form.firstPayDate, future.first_pay_date);
  assert.equal(form.effectiveFrom, next);
  assert.equal(minimumJobTermsDate(job, today), next);
  assert.equal(minimumJobTermsDate(job, next.replace('11-03', '11-10')), next.replace('11-03', '11-10'));
  assert.equal(editReads, 1);
  assert.equal((await request('admin/overview', 'owner')).statusCode, 403);
  assert.equal(editReads, 1);
  const statement = await request('me/statement', 'owner');
  assert.equal(statement.statusCode, 200);
  assert.equal(statement.data.myJobs[0].compensationMode, null);
  assert.equal('latestTerms' in statement.data.myJobs[0], false);
  assert.equal(editReads, 1);
  const invalid = await request('admin/job', 'admin', { ...jobPayload(form), effectiveFrom: today }, 'PATCH');
  assert.equal(invalid.statusCode, 400);
  assert.match(invalid.data.error, /after the latest saved terms/);
  rpcError = null;
  assert.equal((await request('admin/job', 'admin', jobPayload(form), 'PATCH')).statusCode, 200);
  assert.equal(mutation.p_effective_from, next);
  assert.equal(mutation.p_hourly_rate_cents, 1400);
  rpcError = 'private internal configuration details';
  const unknown = await request('admin/job', 'admin', jobPayload(form), 'PATCH');
  assert.doesNotMatch(unknown.data.error, /private internal/);
});
