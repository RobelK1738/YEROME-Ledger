import { roundRatio } from '../finance-v2/index.js';

const twoWeeks = (value) => value == null ? null : roundRatio(value, 12, 26);
const add = (...values) => values.some((v) => v == null) ? null : values.reduce((sum, v) => sum + v, 0);
const subtract = (total, ...values) => add(total, ...values.map((value) => value == null ? null : -value));

/** One statement, two comparable periods. Remainders stay in the residual share. */
export function statementAmounts(person) {
  const monthly = {
    gross: person.monthlyGrossEstimateCents ?? null,
    tax: person.projectionAvailable === false ? null : person.monthlyTaxEstimateCents ?? null,
    net: person.projectionAvailable === false ? null : person.monthlyAfterTaxEquivalentCents ?? null,
    fees: person.agreedChargesMonthlyCents ?? null,
    profit: person.quotedNetMonthlyCents ?? null,
    owner: person.myShareMonthlyCents ?? null,
    costs: person.actualCostMonthlyCents ?? null,
    commissions: person.commissionMonthlyCents ?? null,
    gang: person.gangCutMonthlyCents ?? null,
    yerome: person.yeromeTakeHomeMonthlyCents ?? null,
    commissionIncome: person.commissionIncomeMonthlyCents || 0,
  };
  monthly.service = subtract(monthly.profit, monthly.owner);
  monthly.personalTotal = add(monthly.owner, monthly.commissionIncome);
  const biweekly = Object.fromEntries(Object.entries(monthly).map(([key, value]) => [key, twoWeeks(value)]));
  biweekly.gross = person.annualGrossEstimateCents == null ? twoWeeks(monthly.gross) : roundRatio(person.annualGrossEstimateCents, 1, 26);
  biweekly.tax = monthly.tax == null ? null : person.runRateAnnualTaxEstimateCents == null
    ? subtract(biweekly.gross, biweekly.net) : roundRatio(person.runRateAnnualTaxEstimateCents, 1, 26);
  biweekly.net = subtract(biweekly.gross, biweekly.tax);
  biweekly.profit = subtract(biweekly.net, biweekly.fees);
  biweekly.service = subtract(biweekly.profit, biweekly.owner);
  biweekly.yerome = subtract(biweekly.net, biweekly.costs, biweekly.owner, biweekly.commissions, biweekly.gang);
  biweekly.personalTotal = add(biweekly.owner, biweekly.commissionIncome);
  return { monthly, biweekly };
}

export function companyAmounts(people) {
  const statements = people.map(statementAmounts);
  const keys = Object.keys(statementAmounts({}).monthly);
  return Object.fromEntries(['monthly', 'biweekly'].map((period) => [period,
    Object.fromEntries(keys.map((key) => [key, add(...statements.map((row) => row[period][key]))]))]));
}

/** Group the next income date; never present a partial unknown net as a total. */
export function nextFunds(people) {
  const available = people.filter((p) => p.forecast?.nextDate);
  const date = available.map((p) => p.forecast.nextDate).sort()[0];
  if (!date) return null;
  const selected = available.filter((p) => p.forecast.nextDate === date);
  const forecasts = selected.map((p) => p.forecast);
  const keys = ['ownerShareCents', 'chargesCents', 'serviceShareCents', 'actualCostCents', 'commissionCents', 'gangCutCents', 'yeromeCents'];
  return { date,
    gross: add(...forecasts.map((f) => f.nextGrossCents)),
    tax: add(...forecasts.map((f) => f.nextTaxCents)),
    net: add(...forecasts.map((f) => f.nextNetCents)),
    allocation: Object.fromEntries(keys.map((key) => [key, add(...forecasts.map((f) => f.allocation?.[key] ?? null))])),
    sources: selected.flatMap((p) => p.forecast.upcoming.filter((row) => row.date === date)
      .map((row) => ({ ...row, personName: p.displayName }))),
  };
}
