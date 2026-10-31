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
      !Number.isSafeInteger(monthlyNet) || monthlyNet <= 0 || person.myShareMonthlyCents == null || person.myShareMonthlyCents < 0 || person.agreedChargesMonthlyCents == null) return null;
  const chargesCents = roundRatio(person.agreedChargesMonthlyCents, paycheck.netCents, monthlyNet);
  const ownerCents = roundRatio(paycheck.netCents - chargesCents, 1, 2);
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
  if (depositCents + withheldCents > plan.grossCents)
    throw new RangeError('Deposit plus taxes withheld exceeds the expected gross. Ask Admin to revise the plan if gross pay changed.');
  const taxReserveCents = Math.max(0, plan.taxCents - withheldCents);
  const balanceCents = depositCents - taxReserveCents - plan.yeromeCents;
  return { depositCents, withheldCents, taxReserveCents, yeromeCents: plan.yeromeCents,
    takeHomeCents: balanceCents < 0 ? null : balanceCents,
    shortfallCents: Math.max(0, -balanceCents) };
}

/** YEROME starts with the US Person's transfer, not the employer's gross pay. */
export function yeromePaycheckAllocation(person, paycheck) {
  const ownerPlan = paycheckAllocation(person, paycheck);
  const amounts = [person.actualCostMonthlyCents, person.commissionMonthlyCents, person.gangCutMonthlyCents];
  if (!ownerPlan || !amounts.every((value) => Number.isSafeInteger(value) && value >= 0)) return null;
  const costLines = person.operatingCostBreakdown || [];
  if (costLines.length && (costLines.some((line) => !Number.isSafeInteger(line.monthlyCents)) ||
      costLines.reduce((sum, line) => sum + line.monthlyCents, 0) !== person.actualCostMonthlyCents)) return null;
  const scale = (value) => roundRatio(value, paycheck.netCents, person.monthlyAfterTaxEquivalentCents);
  const actualCostCents = scale(person.actualCostMonthlyCents);
  const commissionCents = scale(person.commissionMonthlyCents);
  const gangCents = scale(person.gangCutMonthlyCents);
  const costParts = costLines.map((line) => ({ key: line.key, label: line.label, cents: scale(line.monthlyCents) }));
  if (costParts.length) costParts[costParts.length - 1].cents = actualCostCents - costParts.slice(0, -1).reduce((sum, line) => sum + line.cents, 0);
  const retainedCents = ownerPlan.yeromeCents - actualCostCents - commissionCents - gangCents;
  return { receiptCents: ownerPlan.yeromeCents, actualCostCents, commissionCents, gangCents,
    retainedCents, costParts };
}

/** Actual cash may reduce available profit; money above the plan stays unallocated. */
export function allocateYeromeReceipt(plan, receivedCents) {
  if (!plan || !Number.isSafeInteger(receivedCents) || receivedCents < 0)
    throw new RangeError('Enter a nonnegative amount received from the US Person.');
  const unallocatedCents = Math.max(0, receivedCents - plan.receiptCents);
  const balanceCents = receivedCents - unallocatedCents - plan.actualCostCents - plan.commissionCents - plan.gangCents;
  return { receivedCents, actualCostCents: plan.actualCostCents, commissionCents: plan.commissionCents,
    gangCents: plan.gangCents, retainedCents: balanceCents < 0 ? null : balanceCents,
    shortfallCents: Math.max(0, -balanceCents), unallocatedCents,
    belowPlanCents: Math.max(0, plan.receiptCents - receivedCents) };
}
