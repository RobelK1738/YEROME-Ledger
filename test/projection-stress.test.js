import { test } from 'node:test';
import assert from 'node:assert/strict';
import { projectPerson, ownerStatementDto, adminStatementDto } from '../src/lib/finance-v2/projection.js';
import { incomeForecast, ownerForecastDto } from '../src/lib/finance-v2/forecast.js';
import { statementAmounts } from '../src/lib/presentation/statement.js';
import { paycheckAllocation, yeromePaycheckAllocation } from '../src/lib/presentation/paycheck-allocation.js';
import { ownerTaxEstimate } from '../src/lib/calculations/tax.js';
import { getTaxConfig2026 } from '../src/lib/calculations/taxConfig2026.js';

test('high combined wages reconcile to independent IRS and payroll-tax amounts', () => {
  // $283,900 taxable: $58,448 + 35% of ($283,900 - $256,225).
  const estimate = ownerTaxEstimate({ grossWagesCents: 30000000, settings: getTaxConfig2026('single') });
  assert.deepEqual([estimate.federalIncomeTaxCents, estimate.socialSecurityCents,
    estimate.medicareCents, estimate.additionalMedicareCents, estimate.totalTaxCents],
  [6813425, 1143900, 435000, 90000, 8482325]);
});

test('288 varied projections conserve money and keep private totals out of Owner DTOs', () => {
  let cases = 0;
  for (const filing of ['single', 'mfj', 'mfs', 'hoh'])
    for (const partnership of ['DIRECT_2_WAY', 'MIKI_REFERRAL_2_WAY'])
      for (const frequency of ['weekly', 'biweekly', 'monthly'])
        for (const count of [0, 1, 7, 25])
          for (const rate of [0, 1999, 10000]) {
            const owner = { id: 'synthetic', display_name: 'Synthetic owner', status: 'active', state: 'TX',
              filing_status: filing, v2_partnership: partnership, private_note: 'PRIVATE_CANARY' };
            const jobs = Array.from({ length: count }, (_, index) => ({ id: `job-${index}`, owner_id: owner.id,
              employer_name: `Employer ${index}`, status: 'active', private_note: 'PRIVATE_CANARY',
              terms: { mode: 'hourly', hourly_rate_cents: rate, expected_weekly_hours: 37.5,
                pay_frequency: frequency, periods_per_year: { weekly: 52, biweekly: 26, monthly: 12 }[frequency],
                first_pay_date: '2026-11-13' } }));
            const p = projectPerson({ owner, jobs, asOf: '2026-10-31' });
            const publicPerson = ownerStatementDto(p);
            const privatePerson = adminStatementDto(p);
            const forecast = incomeForecast({ owner, jobs, asOf: '2026-10-31' });
            assert.doesNotMatch(JSON.stringify({ ...publicPerson, forecast: ownerForecastDto(forecast) }),
              /PRIVATE_CANARY|actualCost|operatingCost|gangCut|yeromeTakeHome|apartmentActual|referrerOwnerId/);
            for (const value of Object.values(statementAmounts(privatePerson))) {
              assert.equal(value.gross - value.tax, value.net);
              assert.equal(value.net - value.fees, value.profit);
              assert.equal(value.owner + value.service, value.profit);
              assert.ok(Math.abs(value.owner - value.service) <= 1);
              assert.equal(value.owner + value.costs + value.commissions + value.gang + value.yerome, value.net);
            }
            for (const check of forecast.upcoming) {
              if (check.taxCents == null) assert.equal(check.netCents, null);
              else assert.equal(check.grossCents - check.taxCents, check.netCents);
              const a = paycheckAllocation(publicPerson, check);
              const b = yeromePaycheckAllocation(privatePerson, check);
              if (!a) { assert.equal(b, null); continue; }
              assert.equal(a.grossCents, a.taxCents + a.yeromeCents + a.ownerCents);
              assert.ok(Math.abs(a.ownerCents - a.serviceShareCents) <= 1);
              assert.equal(a.yeromeCents, b.receiptCents);
              assert.equal(b.receiptCents, b.actualCostCents + b.commissionCents + b.gangCents + b.retainedCents);
              assert.equal(b.actualCostCents, b.costParts.reduce((sum, line) => sum + line.cents, 0));
            }
            cases++;
          }
  assert.equal(cases, 288);
});
