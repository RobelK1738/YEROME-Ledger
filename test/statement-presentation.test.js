import { test } from 'node:test';
import assert from 'node:assert/strict';
import { statementAmounts, companyAmounts, nextFunds } from '../src/lib/presentation/statement.js';
import { ADMIN_NAV, OWNER_NAV } from '../src/app/navigation.js';

const person = { ownerId: 'one', displayName: 'Owner', projectionAvailable: true,
  annualGrossEstimateCents: 2912000, runRateAnnualTaxEstimateCents: 354208,
  monthlyGrossEstimateCents: 242667, monthlyTaxEstimateCents: 29518,
  monthlyAfterTaxEquivalentCents: 213149, agreedChargesMonthlyCents: 185000,
  quotedNetMonthlyCents: 28149, myShareMonthlyCents: 14075,
  actualCostMonthlyCents: 105000, commissionMonthlyCents: 0,
  gangCutMonthlyCents: 21315, yeromeTakeHomeMonthlyCents: 72759,
  commissionIncomeMonthlyCents: 40000 };

test('one monthly/biweekly statement conserves income, tax, costs and both splits', () => {
  const statement = statementAmounts(person);
  for (const value of Object.values(statement)) {
    assert.equal(value.gross - value.tax, value.net);
    assert.equal(value.net - value.fees, value.profit);
    assert.equal(value.owner + value.service, value.profit);
    assert.equal(value.costs + value.owner + value.commissions + value.gang + value.yerome, value.net);
    assert.equal(value.owner + value.commissionIncome, value.personalTotal);
  }
  assert.equal(statement.biweekly.gross, 112000);
  assert.equal(statement.biweekly.tax, 13623);
  assert.equal(statement.biweekly.net, 98377);
  assert.equal(statement.biweekly.owner, 6496);
  assert.equal(statement.biweekly.fees, 85385);
  assert.notEqual(statement.biweekly.gross, Math.round(statement.monthly.gross / 2));
});

test('company statements sum each owner’s exact period allocation', () => {
  const second = { ...person, ownerId: 'two', commissionIncomeMonthlyCents: 0 };
  const company = companyAmounts([person, second]);
  const first = statementAmounts(person), other = statementAmounts(second);
  for (const period of ['monthly', 'biweekly']) for (const key of Object.keys(company[period]))
    assert.equal(company[period][key], first[period][key] + other[period][key]);
  assert.equal(company.biweekly.net, company.biweekly.costs + company.biweekly.owner + company.biweekly.commissions + company.biweekly.gang + company.biweekly.yerome);
});

test('incomplete inputs stay unknown instead of silently contributing zero', () => {
  const incomplete = statementAmounts({ ...person, projectionAvailable: false, myShareMonthlyCents: null });
  assert.equal(incomplete.monthly.tax, null);
  assert.equal(incomplete.biweekly.net, null);
  assert.equal(incomplete.biweekly.personalTotal, null);
  assert.equal(companyAmounts([person, { ...person, projectionAvailable: false }]).monthly.net, null);
});

test('next funds group the same date without combining different paydays or unknown nets', () => {
  const forecast = (date, id, amount) => ({ nextDate: date, nextGrossCents: 112000,
    nextTaxCents: amount == null ? null : 13623, nextNetCents: amount,
    allocation: { ownerShareCents: 6496, chargesCents: 85385, serviceShareCents: 6496 },
    upcoming: [{ jobId: id, employerName: id, date, grossCents: 112000 }] });
  const fund = nextFunds([
    { ...person, forecast: forecast('2026-11-13', 'a', 98377) },
    { ...person, displayName: 'Second', forecast: forecast('2026-11-13', 'b', 98377) },
    { ...person, forecast: forecast('2026-11-27', 'c', 98377) },
  ]);
  assert.equal(fund.date, '2026-11-13');
  assert.equal(fund.gross, 224000);
  assert.equal(fund.net, 196754);
  assert.equal(fund.sources.length, 2);
  assert.equal(fund.allocation.ownerShareCents + fund.allocation.chargesCents + fund.allocation.serviceShareCents, fund.net);
  assert.equal(nextFunds([{ ...person, forecast: forecast('2026-11-13', 'a', null) }]).net, null);
});

test('primary navigation is two Admin destinations and one Owner statement', () => {
  assert.deepEqual(ADMIN_NAV.filter((item) => item.primary).map((item) => item.label), ['Statement', 'Owners']);
  assert.equal(OWNER_NAV.length, 1);
  assert.equal(OWNER_NAV[0].to, '/owner');
});
