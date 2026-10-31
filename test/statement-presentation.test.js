import { test } from 'node:test';
import assert from 'node:assert/strict';
import { statementAmounts, companyAmounts, nextFunds, costDetails, taxDetails } from '../src/lib/presentation/statement.js';
import { projectPerson, ownerStatementDto, adminStatementDto } from '../src/lib/finance-v2/projection.js';
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

test('allocation tabs are available to both roles beside their statements', () => {
  assert.deepEqual(ADMIN_NAV.filter((item) => item.primary).map((item) => item.label), ['Statement', 'Owners', 'Allocations']);
  assert.deepEqual(OWNER_NAV.map((item) => item.label), ['Statement', 'Allocations']);
  assert.equal(OWNER_NAV[1].to, '/owner/allocations');
  assert.equal(OWNER_NAV[0].to, '/owner');
});

test('seven-job workbook example has itemized charges and separate private operating costs', () => {
  const owner = { id: 'seven', display_name: 'Seven-job owner', status: 'active', state: 'TX', filing_status: 'single', v2_partnership: 'DIRECT_2_WAY' };
  const jobs = [1400, 1900, 1800, 2000, 1800, 1400, 1900].map((rate, index) => ({
    id: `job-${index}`, owner_id: owner.id, employer_name: `Employer ${index + 1}`, status: 'active', start_date: '2026-11-02',
    terms: { mode: 'hourly', hourly_rate_cents: rate, expected_weekly_hours: 40, pay_frequency: 'biweekly', periods_per_year: 26, first_pay_date: '2026-11-13' },
  }));
  const projected = projectPerson({ owner, jobs, asOf: '2026-10-31' });
  const publicDto = ownerStatementDto(projected), adminDto = adminStatementDto(projected);
  assert.equal(publicDto.activeJobCount, 7);
  assert.equal(publicDto.annualGrossEstimateCents, 25376000);
  assert.deepEqual(publicDto.serviceChargeBreakdown.map((line) => line.monthlyCents), [280000, 90000, 280000, 70000, 35000]);
  assert.deepEqual(adminDto.operatingCostBreakdown.map((line) => line.monthlyCents), [140000, 65000, 70000, 35000, 35000]);
  assert.equal('operatingCostBreakdown' in publicDto, false);
  assert.equal(publicDto.agreedChargesMonthlyCents, 755000);
  assert.equal(adminDto.actualCostMonthlyCents, 345000);
  const taxes = taxDetails([publicDto]);
  assert.equal(taxes.reduce((sum, line) => sum + line.monthlyCents, 0), publicDto.monthlyTaxEstimateCents);
  assert.equal(taxes.reduce((sum, line) => sum + line.biweeklyCents, 0), statementAmounts(publicDto).biweekly.tax);
  assert.equal(taxes.find((line) => line.key === 'state').monthlyCents, 0);
  assert.equal(taxes.find((line) => line.key === 'state').biweeklyCents, 0);
  assert.deepEqual(taxDetails([{ ...publicDto, projectionAvailable: false }]), []);
  for (const actual of [false, true]) {
    const lines = costDetails([adminDto], actual);
    const amounts = statementAmounts(adminDto);
    const key = actual ? 'costs' : 'fees';
    assert.equal(lines.reduce((sum, line) => sum + line.monthlyCents, 0), amounts.monthly[key]);
    assert.equal(lines.reduce((sum, line) => sum + line.biweeklyCents, 0), amounts.biweekly[key]);
  }

});

test('referral source amounts sum to the displayed two-week income without a rounding gap', () => {
  const commissionSources = [1, 2, 3].map((id) => ({ referralId: String(id), monthlyEquivalentCents: 20000 }));
  const values = statementAmounts({ ...person, commissionIncomeMonthlyCents: 60000, commissionSources });
  assert.equal(values.biweekly.commissionIncome, 3 * 9231);
  assert.equal(values.biweekly.personalTotal, values.biweekly.owner + 3 * 9231);
});

test('each period divides its own rounded profit equally within one cent', () => {
  const s = statementAmounts({ ...person, annualGrossEstimateCents: 30000000,
    runRateAnnualTaxEstimateCents: 8487325, monthlyGrossEstimateCents: 2500000,
    monthlyTaxEstimateCents: 707277, monthlyAfterTaxEquivalentCents: 1792723,
    agreedChargesMonthlyCents: 755000, quotedNetMonthlyCents: 1037723, myShareMonthlyCents: 518862 });
  assert.deepEqual([s.biweekly.profit, s.biweekly.owner, s.biweekly.service], [478948, 239474, 239474]);
});
