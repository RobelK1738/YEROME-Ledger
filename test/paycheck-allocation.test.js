import { test } from 'node:test';
import assert from 'node:assert/strict';
import { projectPerson, ownerStatementDto } from '../src/lib/finance-v2/projection.js';
import { incomeForecast, ownerForecastDto } from '../src/lib/finance-v2/forecast.js';
import { nextJobPaychecks, paycheckAllocation, allocateDeposit } from '../src/lib/presentation/paycheck-allocation.js';

const owner = { id: 'owner', display_name: 'Owner', status: 'active', state: 'TX', filing_status: 'single', v2_partnership: 'DIRECT_2_WAY' };
const dates = ['2026-11-13', '2026-11-13', '2026-11-27', '2026-11-27', '2026-12-04', '2026-12-11', '2026-12-11'];
const jobs = [1400,1900,1800,1966,1800,1400,1900].map((rate, index) => ({ id: `job-${index}`, owner_id: owner.id,
  employer_name: `Employer ${index}`, status: 'active', terms: { mode: 'hourly', hourly_rate_cents: rate,
    expected_weekly_hours: 40, periods_per_year: 26, pay_frequency: 'biweekly', first_pay_date: dates[index] } }));
const projection = projectPerson({ owner, jobs, asOf: '2026-10-31' });
const person = { ...ownerStatementDto(projection), forecast: ownerForecastDto(incomeForecast({ owner, jobs, asOf: '2026-10-31' })) };
const paycheck = nextJobPaychecks(person)[0];
const plan = paycheckAllocation(person, paycheck);

test('seven jobs each have one next paycheck despite repeated or differently ordered dates', () => {
  const next = nextJobPaychecks({ ...person, forecast: { upcoming: [...person.forecast.upcoming].reverse() } });
  assert.equal(next.length, 7);
  assert.equal(new Set(next.map((row) => row.jobId)).size, 7);
  for (const row of next) assert.equal(row.date, dates[Number(row.jobId.slice(4))]);
  assert.equal(next[0].date, '2026-11-13');
});

test('each job’s gross is fully allocated and YEROME includes charges plus its profit share', () => {
  for (const row of nextJobPaychecks(person)) {
    const value = paycheckAllocation(person, row);
    assert.equal(value.grossCents, value.taxCents + value.yeromeCents + value.ownerCents);
    assert.equal(value.yeromeCents, value.chargesCents + value.serviceShareCents);
    assert.equal(value.taxParts.reduce((sum, line) => sum + line.cents, 0), value.taxCents);
    assert.equal(value.taxParts.find((line) => line.key === 'state').cents, 0);
    assert.equal('actualCostCents' in value, false);
    assert.equal('gangCutCents' in value, false);
  }
});

test('withholding is credited once while other deductions reduce available take-home', () => {
  for (const withheldCents of [0, 10000, plan.taxCents]) {
    const depositCents = plan.grossCents - withheldCents;
    const value = allocateDeposit(plan, { depositCents, withheldCents });
    assert.equal(value.taxReserveCents, plan.taxCents - withheldCents);
    assert.equal(value.takeHomeCents, plan.ownerCents);
    assert.equal(value.depositCents, value.taxReserveCents + value.yeromeCents + value.takeHomeCents);
  }
  const withBenefits = allocateDeposit(plan, { depositCents: plan.grossCents - plan.taxCents - 7000, withheldCents: plan.taxCents });
  assert.equal(withBenefits.taxReserveCents, 0);
  assert.equal(withBenefits.takeHomeCents, plan.ownerCents - 7000);
});

test('overwithholding never becomes a negative reserve or an assumed cash refund', () => {
  const withheldCents = plan.taxCents + 5000;
  const value = allocateDeposit(plan, { depositCents: plan.grossCents - withheldCents, withheldCents });
  assert.equal(value.taxReserveCents, 0);
  assert.equal(value.yeromeCents, plan.yeromeCents);
  assert.equal(value.takeHomeCents, plan.ownerCents - 5000);
});

test('a funding gap withholds take-home instructions rather than inventing available money', () => {
  const value = allocateDeposit(plan, { depositCents: 1000, withheldCents: 0 });
  assert.equal(value.takeHomeCents, null);
  assert.equal(value.shortfallCents, plan.taxCents + plan.yeromeCents - 1000);
  assert.throws(() => allocateDeposit(plan, { depositCents: -1, withheldCents: 0 }), /nonnegative/);
  assert.throws(() => allocateDeposit(plan, { depositCents: 1000, withheldCents: 0.1 }), /nonnegative/);
});

test('incomplete or loss projections cannot produce transfer instructions; referral income is separate', () => {
  assert.equal(paycheckAllocation({ ...person, projectionAvailable: false }, paycheck), null);
  assert.equal(paycheckAllocation(person, { ...paycheck, taxCents: null }), null);
  assert.equal(paycheckAllocation(person, { ...paycheck, netCents: -1 }), null);
  assert.equal(paycheckAllocation({ ...person, myShareMonthlyCents: -100 }, paycheck), null);
  assert.deepEqual(paycheckAllocation({ ...person, commissionIncomeMonthlyCents: 40000 }, paycheck), plan);
  assert.deepEqual(nextJobPaychecks({}), []);
});
