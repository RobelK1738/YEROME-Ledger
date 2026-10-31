import { test } from 'node:test';
import assert from 'node:assert/strict';
import { projectPerson } from '../src/lib/finance-v2/projection.js';
import { incomeForecast, ownerForecastDto } from '../src/lib/finance-v2/forecast.js';
import { ownerCommissionSources } from '../server/_lib/planning.js';
import handler from '../api/index.js';

const owner = { id: 'person', display_name: 'Owner', status: 'active', state: 'TX', filing_status: 'single', v2_partnership: 'DIRECT_2_WAY' };
const term = (overrides = {}) => ({ mode: 'hourly', hourly_rate_cents: 2500, expected_weekly_hours: 40,
  pay_frequency: 'biweekly', periods_per_year: 26, first_pay_date: '2026-10-30', effective_from: '2026-01-01', ...overrides });
const job = (overrides = {}) => ({ id: 'job', owner_id: owner.id, employer_name: 'Employer', status: 'active',
  start_date: '2026-01-01', termsHistory: [term()], ...overrides });

test('planning needs no agreement, apartment record, referral verification or payment evidence', () => {
  for (const partnership of ['DIRECT_2_WAY', 'MIKI_REFERRAL_2_WAY']) {
    const p = projectPerson({ owner: { ...owner, v2_partnership: partnership, status: 'inactive' },
      jobs: [{ ...job(), terms: term() }], asOf: '2026-10-30' });
    assert.equal(p.projectionAvailable, true);
    assert.ok(p.statement.personShareCents > 0);
    assert.equal(p.statement.quotedCostCents, partnership === 'DIRECT_2_WAY' ? 185000 : 205000);
    assert.equal(p.statement.commissionCents, partnership === 'DIRECT_2_WAY' ? 0 : 20000);
  }
});

test('future jobs immediately project full income and schedule payments from the first pay date', () => {
  const future = job({ start_date: '2026-11-02', termsHistory: [term({ effective_from: '2026-11-02', first_pay_date: '2026-11-13' })] });
  const f = incomeForecast({ owner, jobs: [future], asOf: '2026-10-30' });
  assert.equal(f.nextDate, '2026-11-13');
  assert.equal(f.nextGrossCents, 200000);
  assert.ok(f.nextNetCents > 0);
  assert.ok(f.upcoming.every((row) => row.date >= '2026-11-13' && row.date <= f.end));
});

test('next-fund allocations conserve cents in both views and private costs stay private', () => {
  const f = incomeForecast({ owner: { ...owner, v2_partnership: 'MIKI_REFERRAL_2_WAY' }, jobs: [job(), job({ id: 'second' })], asOf: '2026-10-30' });
  const a = f.allocation;
  assert.equal(a.ownerShareCents + a.actualCostCents + a.commissionCents + a.gangCutCents + a.yeromeCents, f.nextNetCents);
  const publicForecast = ownerForecastDto(f);
  const b = publicForecast.allocation;
  assert.equal(b.ownerShareCents + b.chargesCents + b.serviceShareCents, f.nextNetCents);
  for (const key of ['actualCostCents', 'gangCutCents', 'yeromeCents', 'commissionCents'])
    assert.equal(JSON.stringify(publicForecast).includes(key), false);
});

test('only the first pay date and frequency place income on the calendar', () => {
  const future = job({ status: 'pending', start_date: '2027-02-01', end_date: '2025-12-31',
    termsHistory: [term({ first_pay_date: '2026-11-13', effective_from: '2027-02-01' })],
    statusHistory: [{ status: 'paused', effective_from: '2026-12-01' }] });
  const f = incomeForecast({ owner, asOf: '2026-10-30', jobs: [future] });
  assert.equal(f.nextDate, '2026-11-13');
  assert.ok(f.upcoming.some((row) => row.date === '2027-01-08'));
  assert.ok(f.upcoming.every((row) => row.grossCents === 200000));
  assert.equal(incomeForecast({ owner, asOf: '2026-10-30', jobs: [job({ status: 'paused' })] }).upcoming.length, 0);
  assert.equal(incomeForecast({ owner, asOf: '2026-10-30', jobs: [job({ status: 'ended' })] }).upcoming.length, 0);
  const monthly = incomeForecast({ owner, asOf: '2026-10-01', horizonDays: 123, jobs: [job({
    termsHistory: [term({ mode: 'salary', annual_salary_cents: 1200000, periods_per_year: 12,
      pay_frequency: 'monthly', first_pay_date: '2026-01-31' })] })] });
  assert.deepEqual(monthly.upcoming.map((row) => row.date), ['2026-10-31', '2026-11-30', '2026-12-31', '2027-01-31']);
});

test('incomplete active compensation leaves net estimates unavailable instead of undertaxing', () => {
  const f = incomeForecast({ owner, asOf: '2026-10-30', jobs: [job(), job({ id: 'missing', termsHistory: [] })] });
  assert.equal(f.nextNetCents, null);
  assert.equal(f.allocation, null);
  assert.match(f.warnings.join(' '), /pay details/);
});

test('anonymous referral commission sources do not reveal other owners or their employers', () => {
  const rows = ownerCommissionSources([{ referralId: 'link', referredOwnerId: 'private-id', referredName: 'Private name',
    nameVisible: false, jobs: [{ employerName: 'Private employer' }], eligible: true,
    activeJobCount: 2, ratePerJobCents: 20000, monthlyCents: 40000 }]);
  assert.equal(rows[0].monthlyEquivalentCents, 40000);
  assert.equal(rows[0].referredDisplayName, 'Referred owner');
  assert.doesNotMatch(JSON.stringify(rows), /Private|private-id|employer/);
});

test('Admin saves simple shared instructions; owners cannot write or select another profile', async (t) => {
  const settings = { SUPABASE_URL: 'http://127.0.0.1:19998', SUPABASE_SERVICE_ROLE_KEY: 'synthetic-key', ADMIN_EMAIL: 'robiemelaku@gmail.com' };
  const previous = Object.fromEntries(Object.keys(settings).map((key) => [key, process.env[key]]));
  Object.assign(process.env, settings);
  t.after(() => { for (const key of Object.keys(settings)) {
    if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key];
  } });
  const token = (role) => `header.${Buffer.from(JSON.stringify({ sub: role, session_id: '11111111-1111-1111-1111-111111111111',
    iat: Math.floor(Date.now() / 1000), app_metadata: { role } })).toString('base64url')}.synthetic`;
  const writes = [];
  t.mock.method(globalThis, 'fetch', async (input, init) => {
    const url = new URL(input);
    const table = url.pathname.split('/').at(-1);
    if (url.pathname === '/auth/v1/user') {
      const role = new Headers(init.headers).get('authorization') === `Bearer ${token('admin')}` ? 'admin' : 'owner';
      return Response.json({ id: role, email: role === 'admin' ? settings.ADMIN_EMAIL : 'owner@example.test', app_metadata: { role } });
    }
    if (table === 'v2_authorize_session') return Response.json(JSON.parse(init.body).p_user);
    if (table === 'owners') return Response.json(owner);
    if (table === 'v3_save_projection_plan') { writes.push(JSON.parse(init.body)); return Response.json(null); }
    if (table === 'v3_projection_plans') return Response.json([{ next_fund_date: '2026-11-13', instructions: 'Set aside the projected costs first.', apartment_actual_cents: 65000 }]);
    return Response.json([]);
  });
  async function request(route, role, body, method = 'PATCH') {
    const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, setHeader() {}, json(data) { this.data = data; return this; } };
    await handler({ method, query: { route, ownerId: 'someone-else' }, headers: { authorization: `Bearer ${token(role)}` }, body }, res);
    return res;
  }
  const input = { ownerId: owner.id, action: 'allocation', nextFundDate: '2026-11-13', instructions: 'Set aside the projected costs first.' };
  assert.equal((await request('admin/planning', 'owner', input)).statusCode, 403);
  assert.equal(writes.length, 0);
  assert.equal((await request('admin/planning', 'admin', { ...input, nextFundDate: '2026-02-30' })).statusCode, 400);
  assert.equal((await request('admin/planning', 'admin', input)).statusCode, 200);
  assert.deepEqual(writes[0], { p_owner: owner.id, p_actor: 'admin', p_patch: {
    next_fund_date: input.nextFundDate, instructions: input.instructions } });
  const statement = await request('me/statement', 'owner', null, 'GET');
  assert.equal(statement.statusCode, 200);
  assert.equal(statement.data.displayName, owner.display_name);
  assert.equal(statement.data.allocationPlan.instructions, input.instructions);
  assert.doesNotMatch(JSON.stringify(statement.data), /apartment_actual|actualCost|yeromeTakeHome|gangCut/);
});
