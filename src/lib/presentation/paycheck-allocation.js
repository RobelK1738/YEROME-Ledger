import { roundRatio } from '../finance-v2/index.js';

/** One next income date per job. No receipt or payment record is created. */
export function nextJobPaychecks(person) {
  const next = new Map();
  const upcoming = [...(person.forecast?.upcoming || [])].sort((a, b) => a.date.localeCompare(b.date) || a.jobId.localeCompare(b.jobId));
  for (const paycheck of upcoming) if (!next.has(paycheck.jobId)) next.set(paycheck.jobId, paycheck);
  return [...next.values()];
}

/** Split a job's expected gross using the owner's existing monthly model. */
export function paycheckAllocation(person, paycheck) {
  const monthlyNet = person.monthlyAfterTaxEquivalentCents;
  if (!person.projectionAvailable || paycheck.taxCents == null || paycheck.netCents == null || paycheck.netCents < 0 ||
      !Number.isSafeInteger(monthlyNet) || monthlyNet <= 0 || person.myShareMonthlyCents == null || person.agreedChargesMonthlyCents == null) return null;
  const ownerCents = roundRatio(person.myShareMonthlyCents, paycheck.netCents, monthlyNet);
  const chargesCents = roundRatio(person.agreedChargesMonthlyCents, paycheck.netCents, monthlyNet);
  const yeromeCents = paycheck.netCents - ownerCents;
  if (ownerCents < 0 || yeromeCents < 0) return null;
  const taxParts = (person.taxBreakdownAnnual || []).map((line) => ({ key: line.key, label: line.label,
    cents: roundRatio(line.annualCents, paycheck.grossCents, person.annualGrossEstimateCents) }));
  if (taxParts.length) taxParts[0].cents = paycheck.taxCents - taxParts.slice(1).reduce((sum, line) => sum + line.cents, 0);
  return { grossCents: paycheck.grossCents, taxCents: paycheck.taxCents, chargesCents,
    serviceShareCents: yeromeCents - chargesCents, yeromeCents, ownerCents, taxParts };
}

/** Withholding is credited once. Other payroll deductions reduce available cash. */
export function allocateDeposit(plan, { depositCents, withheldCents }) {
  if (!plan || ![depositCents, withheldCents].every((value) => Number.isSafeInteger(value) && value >= 0))
    throw new RangeError('Enter a nonnegative deposit and tax withholding amount.');
  const taxReserveCents = Math.max(0, plan.taxCents - withheldCents);
  const balanceCents = depositCents - taxReserveCents - plan.yeromeCents;
  return { depositCents, withheldCents, taxReserveCents, yeromeCents: plan.yeromeCents,
    takeHomeCents: balanceCents < 0 ? null : balanceCents,
    shortfallCents: Math.max(0, -balanceCents) };
}
