import { test } from 'node:test';
import assert from 'node:assert/strict';
import { projectPerson, ownerStatementDto, adminStatementDto } from '../src/lib/finance-v2/projection.js';

const owner = {
  id: 'person-a', display_name: 'Person A', filing_status: 'single', state: 'TX',
  status: 'active',
  v2_partnership: 'DIRECT_2_WAY', agreement_verified_at: '2026-01-01T00:00:00Z',
};
const hourly = (id, rate, hours) => ({
  id, owner_id: owner.id, employer_name: `Employer ${id}`, status: 'active', pay_frequency: 'biweekly',
  terms: { mode: 'hourly', hourly_rate_cents: rate, expected_weekly_hours: hours, periods_per_year: 26 },
});

test('hourly jobs aggregate at the person level and private fields stay out of owner DTO', () => {
  const jobs = [hourly('one', 1850, 35), hourly('two', 2200, 40)];
  const projected = projectPerson({ owner, jobs, apartment: { actual_monthly_cents: 65000, quoted_monthly_cents: 90000 }, taxYear: 2026 });
  assert.equal(projected.annualGrossCents, (129500 + 176000) * 26);
  assert.equal(projected.activeJobCount, 2);
  assert.equal(projected.taxEstimate.grossWagesCents, projected.annualGrossCents);
  const partner = ownerStatementDto(projected);
  const admin = adminStatementDto(projected);
  assert.equal(partner.myJobs.length, 2);
  assert.equal(partner.myJobs[0].typicalBiweeklyGrossCents, 129500);
  assert.equal(partner.myJobs[1].typicalBiweeklyGrossCents, 176000);
  assert.equal(partner.myShareMonthlyCents, admin.personShareMonthlyCents);
  assert.equal('actualCostMonthlyCents' in partner, false);
  assert.equal('gangCutMonthlyCents' in partner, false);
  assert.equal('yeromeTakeHomeMonthlyCents' in partner, false);
  assert.equal(JSON.stringify(partner).includes('actual_monthly_cents'), false);
});

test('unverified legacy partnership gives no share or payment instruction', () => {
  const projected = projectPerson({ owner: { ...owner, v2_partnership: null }, jobs: [hourly('one', 1850, 35)], apartment: null, taxYear: 2026 });
  const dto = ownerStatementDto(projected);
  assert.equal(dto.projectionAvailable, false);
  assert.equal(dto.myShareMonthlyCents, null);
});

test('two people retain separate tax positions and two apartment costs', () => {
  const personA = projectPerson({ owner, jobs: [hourly('one', 1850, 35)], apartment: { actual_monthly_cents: 65000, quoted_monthly_cents: 90000 }, taxYear: 2026 });
  const personB = projectPerson({ owner: { ...owner, id: 'person-b' }, jobs: [{ ...hourly('two', 2200, 40), owner_id: 'person-b' }], apartment: { actual_monthly_cents: 65000, quoted_monthly_cents: 90000 }, taxYear: 2026 });
  assert.equal(personA.statement.actualCostCents + personB.statement.actualCostCents, 210000);
  assert.equal(personA.taxEstimate.grossWagesCents, 129500 * 26);
  assert.equal(personB.taxEstimate.grossWagesCents, 176000 * 26);
});

test('scheduled checks do not count as received cash or withholding', () => {
  const projected = projectPerson({
    owner, jobs: [hourly('one', 1850, 35)],
    apartment: { actual_monthly_cents: 65000, quoted_monthly_cents: 90000 },
    paychecks: [
      { id: 'scheduled', job_id: 'one', pay_date: '2026-11-01', status: 'scheduled' },
      { id: 'received', job_id: 'one', pay_date: '2026-10-01', status: 'paid',
        actual_net_received_cents: 100000, federal_withheld_cents: 20000 },
    ], asOf: '2026-10-18', taxYear: 2026,
  });
  assert.equal(projected.reconciliation.actualWithholdingCents, 20000);
  assert.equal(projected.reconciliation.actualNetReceivedCents, 100000);
  assert.equal(projected.reconciliation.missingNetCount, 0);
  assert.equal(projected.nextPayDate, '2026-11-01');
});

test('unsupported state blocks partner and tax amounts', () => {
  const projected = projectPerson({ owner: { ...owner, state: 'CA' },
    jobs: [hourly('one', 1850, 35)],
    apartment: { actual_monthly_cents: 65000, quoted_monthly_cents: 90000 },
    taxYear: 2026 });
  const dto = ownerStatementDto(projected);
  assert.equal(dto.projectionAvailable, false);
  assert.equal(dto.annualTaxLiabilityEstimateCents, null);
  assert.equal(dto.monthlyAfterTaxEquivalentCents, null);
  assert.equal(dto.taxReconciliation, null);
});

test('dated employment changes tax-year liability without changing monthly run rate', () => {
  const full = projectPerson({ owner, jobs: [hourly('one', 1850, 35)],
    apartment: { actual_monthly_cents: 65000, quoted_monthly_cents: 90000 },
    taxYear: 2026 });
  const partial = projectPerson({ owner, jobs: [{ ...hourly('one', 1850, 35),
    start_date: '2026-07-01' }],
    apartment: { actual_monthly_cents: 65000, quoted_monthly_cents: 90000 },
    taxYear: 2026 });
  assert.equal(full.annualGrossCents, partial.annualGrossCents);
  assert.equal(full.statement.personShareCents, partial.statement.personShareCents);
  assert.ok(partial.taxYearWagesCents < full.taxYearWagesCents);
  assert.ok(partial.taxEstimate.totalTaxCents < full.taxEstimate.totalTaxCents);
});
