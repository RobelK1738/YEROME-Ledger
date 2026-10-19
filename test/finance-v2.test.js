import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DIRECT_2_WAY,
  MIKI_REFERRAL_2_WAY,
  monthlyStatement,
  dollarsToCents,
  allocateCents,
  hourlyBiweeklyGrossCents,
} from '../src/lib/finance-v2/index.js';

const cases = [
  [1, '3368.75', 75938, 65938, 20000, 33688, 122249, 112249],
  [2, '6303.333333', 175167, 155167, 40000, 63033, 247133, 227133],
  [3, '9160', 270500, 240500, 60000, 91600, 368900, 338900],
  [5, '14835.416666', 459271, 409271, 100000, 148354, 610917, 560917],
  [10, '27904.166666', 875209, 775209, 200000, 279042, 1171166, 1071166],
  [12, '33125', 1041250, 921250, 240000, 331250, 1395000, 1275000],
];

test('workbook inputs produce cent-balanced direct and referred statements', () => {
  for (const [jobs, dollars, directShare, referredShare, commission, gang, directProfit, referredProfit] of cases) {
    const afterTaxCents = dollarsToCents(dollars);
    const direct = monthlyStatement({ afterTaxCents, activeJobCount: jobs, partnership: DIRECT_2_WAY });
    const referred = monthlyStatement({ afterTaxCents, activeJobCount: jobs, partnership: MIKI_REFERRAL_2_WAY });
    assert.equal(direct.personShareCents, directShare, `direct share n=${jobs}`);
    assert.equal(referred.personShareCents, referredShare, `referred share n=${jobs}`);
    assert.equal(referred.commissionCents, commission);
    assert.equal(direct.gangCutCents, gang);
    assert.equal(direct.yeromeTakeHomeCents, directProfit);
    assert.equal(referred.yeromeTakeHomeCents, referredProfit);
    for (const statement of [direct, referred]) {
      assert.equal(statement.afterTaxCents,
        statement.actualCostCents + statement.personShareCents + statement.commissionCents +
        statement.gangCutCents + statement.yeromeTakeHomeCents);
      assert.equal(Object.keys(statement).some((key) => /reserve|safety/i.test(key)), false);
    }
  }
});

test('every active-job count keeps one apartment and a $200 referral commission per job', () => {
  for (let jobs = 0; jobs <= 12; jobs++) {
    const afterTaxCents = 4_000_000;
    const direct = monthlyStatement({ afterTaxCents, activeJobCount: jobs, partnership: DIRECT_2_WAY });
    const referred = monthlyStatement({ afterTaxCents, activeJobCount: jobs, partnership: MIKI_REFERRAL_2_WAY });
    assert.equal(direct.actualCostCents, 65_000 + 40_000 * jobs);
    assert.equal(direct.quotedCostCents, 90_000 + 95_000 * jobs);
    assert.equal(referred.quotedCostCents, 90_000 + 115_000 * jobs);
    assert.equal(referred.commissionCents, 20_000 * jobs);
    assert.equal(direct.personShareCents - referred.personShareCents, 10_000 * jobs);
    assert.equal(direct.yeromeTakeHomeCents - referred.yeromeTakeHomeCents, 10_000 * jobs);
  }
});

test('negative quoted net remains visible for an explicit payout decision', () => {
  const result = monthlyStatement({ afterTaxCents: 0, activeJobCount: 1, partnership: DIRECT_2_WAY });
  assert.equal(result.quotedNetCents, -185_000);
  assert.equal(result.personShareCents, -92_500);
  assert.equal(result.actualCostCents + result.personShareCents + result.yeromeTakeHomeCents, 0);
});

test('hourly biweekly gross and annual fixed-charge allocation are exact', () => {
  assert.equal(hourlyBiweeklyGrossCents(1850, 35), 129_500);
  assert.equal(hourlyBiweeklyGrossCents(2200, 40), 176_000);
  for (const periods of [24, 26, 27, 52]) {
    const amounts = allocateCents(1_080_000, periods);
    assert.equal(amounts.length, periods);
    assert.equal(amounts.reduce((a, b) => a + b, 0), 1_080_000);
  }
  assert.equal(allocateCents(1_080_000, 26)[0], 41_539);
});
