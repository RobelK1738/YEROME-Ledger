import { test } from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/index.js';
import { adminClient } from '../server/_lib/supabaseAdmin.js';
import { loadPlanningPerson } from '../server/_lib/planning.js';
import { jobFormFromExisting, jobPayload } from '../src/lib/presentation/forms.js';
import { payDetailsFor, payTermsText } from '../src/lib/presentation/people.js';

test('one job setup supplies all pay details; future jobs need no review or activation', async (t) => {
  const settings = { SUPABASE_URL: 'http://127.0.0.1:19999', SUPABASE_SERVICE_ROLE_KEY: 'synthetic-key', ADMIN_EMAIL: 'robiemelaku@gmail.com' };
  const previous = Object.fromEntries(Object.keys(settings).map((key) => [key, process.env[key]]));
  Object.assign(process.env, settings);
  t.after(() => { for (const key of Object.keys(settings)) {
    if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key];
  } });
  const start = `${new Date().getUTCFullYear() + 1}-11-02`;
  const firstPay = start.replace('11-02', '11-13');
  const owner = { id: 'person', display_name: 'Test Person', filing_status: 'single', state: 'TX', status: 'active', v2_partnership: 'DIRECT_2_WAY' };
  const details = { mode: 'hourly', hourly_rate_cents: 1400, expected_weekly_hours: 40,
    pay_frequency: 'biweekly', first_pay_date: firstPay, periods_per_year: 26 };
  const record = { id: 'job', owner_id: owner.id, employer_name: 'Everise', start_date: start, status: 'active' };
  const token = (role) => `header.${Buffer.from(JSON.stringify({ sub: role,
    session_id: '11111111-1111-1111-1111-111111111111', iat: Math.floor(Date.now() / 1000),
    app_metadata: { role } })).toString('base64url')}.synthetic`;
  const saves = [];
  t.mock.method(globalThis, 'fetch', async (input, init) => {
    const url = new URL(input);
    assert.equal(url.origin, settings.SUPABASE_URL);
    const table = url.pathname.split('/').at(-1);
    if (url.pathname === '/auth/v1/user') {
      const role = new Headers(init.headers).get('authorization') === `Bearer ${token('admin')}` ? 'admin' : 'owner';
      return Response.json({ id: role, email: role === 'admin' ? settings.ADMIN_EMAIL : 'owner@example.test', app_metadata: { role } });
    }
    if (table === 'v2_authorize_session') return Response.json(JSON.parse(init.body).p_user);
    if (table === 'owners') return Response.json(url.searchParams.has('id') || url.searchParams.has('auth_user_id') ? owner : [owner]);
    if (table === 'jobs') return Response.json([record]);
    // Existing saved jobs are compatible without any data migration or re-entry.
    if (table === 'job_compensation_terms') return Response.json([{ job_id: 'job', ...details, effective_from: start }]);
    if (table === 'v3_save_job') {
      const input = JSON.parse(init.body); saves.push(input);
      record.planning_pay_details = input.p_details;
      return Response.json('job');
    }
    assert.notEqual(table, 'v2_change_job_terms');
    return Response.json([]);
  });
  async function request(route, role, body, method = 'GET') {
    const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, setHeader() {}, json(data) { this.data = data; return this; } };
    await handler({ method, query: { route }, headers: { authorization: `Bearer ${token(role)}` }, body }, res);
    return res;
  }
  const overview = await request('admin/overview', 'admin');
  assert.equal(overview.statusCode, 200);
  const job = overview.data.people[0].myJobs[0];
  assert.equal(job.status, 'pending');
  assert.equal(job.missingPayDetails, false);
  assert.equal(overview.data.people[0].annualGrossEstimateCents, 0);
  assert.equal(payTermsText(job), '$14.00/hr · 40 h/wk');
  assert.equal(payDetailsFor(job).missingPayDetails, false);
  assert.equal(payDetailsFor(job).firstPayDate, firstPay);
  const form = jobFormFromExisting({ ...job, ownerId: owner.id });
  assert.equal(form.hourlyRate, '14');
  assert.equal(form.firstPayDate, firstPay);
  assert.equal(form.startDate, start);
  assert.equal('effectiveFrom' in form, false);
  assert.equal((await request('admin/job', 'owner', jobPayload(form), 'PATCH')).statusCode, 403);
  assert.equal((await request('admin/job', 'admin', { ...jobPayload(form), firstPayDate: '2026-02-30' }, 'PATCH')).statusCode, 400);
  for (let i = 0; i < 2; i++) assert.equal((await request('admin/job', 'admin', jobPayload(form), 'PATCH')).statusCode, 200);
  assert.equal(saves.length, 2);
  assert.equal(saves[0].p_details.hourly_rate_cents, 1400);
  assert.equal('p_effective_from' in saves[0], false);
  const create = { ...jobPayload(form) }; delete create.jobId; delete create.action;
  assert.equal((await request('admin/job', 'admin', create, 'POST')).statusCode, 201);
  assert.equal(saves[2].p_job, null);
  const statement = await request('me/statement', 'owner');
  assert.equal(statement.statusCode, 200);
  assert.equal(payTermsText(statement.data.myJobs[0]), '$14.00/hr · 40 h/wk');
  assert.equal(statement.data.myJobs[0].savedPayDetails.firstPayDate, firstPay);
  assert.doesNotMatch(JSON.stringify(statement.data), /planning_pay_details|latestTerms|needsTermsReview/);
  // The saved configuration alone powers the future forecast, without a terms row.
  record.start_date = '2026-11-02';
  record.planning_pay_details.first_pay_date = '2026-11-13';
  record.planning_pay_details.hourly_rate_cents = 1500;
  const projected = await loadPlanningPerson(adminClient(), owner.id, '2026-10-30');
  assert.equal(projected.projected.annualGrossCents, 0);
  assert.equal(projected.forecast.nextDate, '2026-11-13');
  assert.equal(projected.forecast.nextGrossCents, 120000);
  assert.ok(projected.forecast.nextNetCents > 0);
  const started = await loadPlanningPerson(adminClient(), owner.id, '2026-11-02');
  assert.equal(started.projected.activeJobCount, 1);
  assert.equal(started.projected.projectionAvailable, true);
  assert.equal(started.projected.annualGrossCents, 3120000);
});
