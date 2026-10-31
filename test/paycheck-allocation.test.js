import { test } from 'node:test';
import assert from 'node:assert/strict';
import { projectPerson, ownerStatementDto, adminStatementDto } from '../src/lib/finance-v2/projection.js';
import { incomeForecast, ownerForecastDto } from '../src/lib/finance-v2/forecast.js';
import { nextJobPaychecks, paycheckAllocation, allocateDeposit, yeromePaycheckAllocation, allocateYeromeReceipt } from '../src/lib/presentation/paycheck-allocation.js';

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
    assert.ok(Math.abs(value.ownerCents - value.serviceShareCents) <= 1);
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


test('the US Person transfer equals the YEROME receipt, which funds actual costs exactly once', () => {
  const admin = adminStatementDto(projection);
  for (const row of nextJobPaychecks(person)) {
    const sent = paycheckAllocation(person, row);
    const receipt = yeromePaycheckAllocation(admin, row);
    assert.equal(sent.yeromeCents, receipt.receiptCents);
    assert.equal(receipt.receiptCents, receipt.actualCostCents + receipt.commissionCents + receipt.gangCents + receipt.retainedCents);
    assert.equal(receipt.costParts.reduce((sum, line) => sum + line.cents, 0), receipt.actualCostCents);
    assert.equal(sent.grossCents, sent.taxCents + sent.ownerCents + receipt.actualCostCents + receipt.commissionCents + receipt.gangCents + receipt.retainedCents);
    assert.equal('taxCents' in receipt, false);
    assert.equal('ownerCents' in receipt, false);
  }
  // Independent cent fixtures from the seven-job, $14/hour paycheck case.
  const first = yeromePaycheckAllocation(admin, paycheck);
  assert.deepEqual([plan.grossCents, plan.taxCents, plan.ownerCents, first.receiptCents], [112000, 30037, 20932, 61031]);
  assert.deepEqual([first.actualCostCents, first.commissionCents, first.gangCents, first.retainedCents], [18324, 0, 8196, 34511]);
  assert.deepEqual(first.costParts.map((line) => line.cents), [7436, 3452, 3718, 1859, 1859]);
});

test('receipt allocation reserves referral commissions and respects actual apartment overrides', () => {
  const projected = projectPerson({ owner: { ...owner, v2_partnership: 'MIKI_REFERRAL_2_WAY' }, jobs,
    apartment: { actual_monthly_cents: 80000, quoted_monthly_cents: 110000 }, asOf: '2026-10-31' });
  const admin = adminStatementDto(projected);
  const value = yeromePaycheckAllocation(admin, paycheck);
  assert.equal(admin.actualCostMonthlyCents, 360000);
  assert.equal(admin.agreedChargesMonthlyCents, 915000);
  assert.equal(admin.commissionMonthlyCents, 140000);
  assert.ok(value.commissionCents > 0);
  assert.equal(value.receiptCents, value.actualCostCents + value.commissionCents + value.gangCents + value.retainedCents);
  assert.equal(value.costParts.reduce((sum, line) => sum + line.cents, 0), value.actualCostCents);
});

test('cash receipt previews adjust the remainder, flag shortfalls and do not turn overpayments into profit', () => {
  const value = yeromePaycheckAllocation(adminStatementDto(projection), paycheck);
  for (const received of [value.receiptCents, value.receiptCents - 1000, value.receiptCents + 1000]) {
    const preview = allocateYeromeReceipt(value, received);
    assert.equal(received, preview.actualCostCents + preview.commissionCents + preview.gangCents + preview.retainedCents + preview.unallocatedCents);
    assert.equal(preview.actualCostCents, value.actualCostCents);
    assert.equal(preview.retainedCents, value.retainedCents - Math.max(0, value.receiptCents - received));
    assert.equal(preview.unallocatedCents, Math.max(0, received - value.receiptCents));
  }
  const short = allocateYeromeReceipt(value, 0);
  assert.equal(short.retainedCents, null);
  assert.equal(short.shortfallCents, value.actualCostCents + value.commissionCents + value.gangCents);
  assert.throws(() => allocateYeromeReceipt(value, -1), /nonnegative/);
  assert.throws(() => allocateYeromeReceipt(value, 1.1), /nonnegative/);
});

test('missing or inconsistent internal cost inputs never produce a fabricated receipt allocation', () => {
  const admin = adminStatementDto(projection);
  assert.equal(yeromePaycheckAllocation(person, paycheck), null);
  assert.equal(yeromePaycheckAllocation({ ...admin, actualCostMonthlyCents: null }, paycheck), null);
  assert.equal(yeromePaycheckAllocation({ ...admin, operatingCostBreakdown: [{ key: 'bad', monthlyCents: 1 }] }, paycheck), null);
  assert.throws(() => allocateDeposit(plan, { depositCents: plan.grossCents, withheldCents: 1 }), /exceeds/);
});

test('a profitable US Person split can still leave YEROME with an operating funding gap', () => {
  const projected = projectPerson({ owner, jobs,
    apartment: { actual_monthly_cents: 2000000, quoted_monthly_cents: 90000 }, asOf: '2026-10-31' });
  const admin = adminStatementDto(projected);
  const receipt = yeromePaycheckAllocation(admin, paycheck);
  assert.ok(paycheckAllocation(ownerStatementDto(projected), paycheck).ownerCents > 0);
  assert.ok(receipt.retainedCents < 0);
  const distribution = allocateYeromeReceipt(receipt, receipt.receiptCents);
  assert.equal(distribution.retainedCents, null);
  assert.equal(distribution.shortfallCents, -receipt.retainedCents);
});
