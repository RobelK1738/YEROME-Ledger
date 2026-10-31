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
  if (person.commissionSources?.length) {
    biweekly.commissionIncome = person.commissionSources.reduce((sum, source) => sum + twoWeeks(source.monthlyEquivalentCents), 0);
    biweekly.personalTotal = add(biweekly.owner, biweekly.commissionIncome);
  }
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

/** Itemized costs must add to the same total in each displayed period. */
export function costDetails(people, actual = false) {
  const merged = new Map();
  for (const person of people) {
    const lines = person[actual ? 'operatingCostBreakdown' : 'serviceChargeBreakdown'];
    const amounts = statementAmounts(person);
    const total = amounts.biweekly[actual ? 'costs' : 'fees'];
    if (!lines?.length || total == null) return [];
    let remaining = total;
    lines.forEach((line, index) => {
      const biweeklyCents = index === lines.length - 1 ? remaining : twoWeeks(line.monthlyCents);
      remaining -= biweeklyCents;
      const previous = merged.get(line.key) || { ...line, monthlyCents: 0, biweeklyCents: 0 };
      merged.set(line.key, { ...previous, monthlyCents: previous.monthlyCents + line.monthlyCents,
        perJobCents: previous.perJobCents === line.perJobCents ? line.perJobCents : null,
        biweeklyCents: previous.biweeklyCents + biweeklyCents });
    });
  }
  return [...merged.values()];
}

/** Allocate annual tax components to the displayed periods; federal carries rounding cents. */
export function taxDetails(people) {
  const merged = new Map();
  for (const person of people) {
    const lines = person.taxBreakdownAnnual;
    const amounts = statementAmounts(person);
    if (!lines?.length || amounts.monthly.tax == null) return [];
    const details = lines.map((line) => ({ key: line.key, label: line.label,
      monthlyCents: roundRatio(line.annualCents, 1, 12), biweeklyCents: roundRatio(line.annualCents, 1, 26) }));
    for (const period of ['monthly', 'biweekly']) {
      const field = `${period}Cents`;
      details[0][field] = amounts[period].tax - details.slice(1).reduce((sum, line) => sum + line[field], 0);
    }
    for (const line of details) {
      const previous = merged.get(line.key) || { ...line, monthlyCents: 0, biweeklyCents: 0 };
      merged.set(line.key, { ...previous, monthlyCents: previous.monthlyCents + line.monthlyCents,
        biweeklyCents: previous.biweeklyCents + line.biweeklyCents });
    }
  }
  return [...merged.values()];
}

/** Reuse the visible two-week allocation only when every amount actually matches. */
export function fundMatchesBiweekly(people, admin = false) {
  const fund = nextFunds(people);
  if (!fund) return false;
  const values = companyAmounts(people).biweekly;
  const pairs = [['gross', fund.gross], ['tax', fund.tax], ['net', fund.net], ['owner', fund.allocation.ownerShareCents],
    ...(admin ? [['costs', fund.allocation.actualCostCents], ['commissions', fund.allocation.commissionCents],
      ['gang', fund.allocation.gangCutCents], ['yerome', fund.allocation.yeromeCents]]
      : [['fees', fund.allocation.chargesCents], ['service', fund.allocation.serviceShareCents]])];
  return pairs.every(([key, amount]) => amount != null && values[key] === amount);
}
