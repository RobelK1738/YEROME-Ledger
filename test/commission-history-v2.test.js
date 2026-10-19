import { test } from 'node:test';
import assert from 'node:assert/strict';
import { referralCurrentlyEarning, referralCommissionSummary } from '../src/lib/finance-v2/commission-history.js';

test('ended or replaced referral keeps accrued, paid and owed history with zero current forecast', () => {
  const oldReferral = { id: 'old', active: false, start_date: '2026-02-01',
    end_date: '2026-02-28', flat_amount_cents: 20000 };
  const newReferral = { id: 'new', active: true, start_date: '2026-03-01',
    end_date: null, flat_amount_cents: 20000 };
  const asOf = '2026-04-01';
  const oldCurrent = referralCurrentlyEarning(oldReferral, false,
    [{ active: true, effective_from: '2026-02-01', event_order: 1 },
      { active: false, effective_from: '2026-03-01', event_order: 2 }], asOf);
  const historical = referralCommissionSummary({ referral: oldReferral,
    displayName: 'Referred US Person', currentlyEarning: oldCurrent,
    eligibleJobCount: 12,
    accruals: [{ id: 'feb', calendar_month: '2026-02-01',
      eligible_job_count: 2, amount_cents: 40000 }],
    payments: [{ accrual_id: 'feb', amount_cents: 10000,
      paid_at: '2026-03-05T12:00:00Z' }] });
  assert.equal(historical.monthlyEquivalentCents, 0);
  assert.equal(historical.accruedCents, 40000);
  assert.equal(historical.paidCents, 10000);
  assert.equal(historical.owedCents, 30000);
  assert.equal(historical.events[0].owedCents, 30000);
  assert.equal(referralCurrentlyEarning(newReferral, true,
    [{ active: true, effective_from: '2026-03-01', event_order: 3 }], asOf), true);
});
