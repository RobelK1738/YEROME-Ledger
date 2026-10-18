import { monthlyStatement } from './index.js';
import { validatedReceipt } from './receipt.js';

function asInteger(value, label) {
  if (!Number.isSafeInteger(value)) throw new TypeError(`${label} must be integer cents`);
  return value;
}

/** Allocate a signed monthly total by dated deposit weights, preserving cents. */
export function allocateWeightedCents(totalCents, weights) {
  asInteger(totalCents, 'Monthly amount');
  if (!weights.length || weights.some((weight) => !Number.isSafeInteger(weight) || weight < 0)) {
    throw new RangeError('Nonnegative receipt weights are required');
  }
  const sum = weights.reduce((a, b) => a + b, 0);
  const basis = sum === 0 ? weights.map(() => 1) : weights;
  const denominator = BigInt(basis.reduce((a, b) => a + b, 0));
  const magnitude = BigInt(Math.abs(totalCents));
  const parts = basis.map((weight, index) => {
    const numerator = magnitude * BigInt(weight);
    return { index, amount: numerator / denominator, remainder: numerator % denominator };
  });
  let remaining = magnitude - parts.reduce((a, part) => a + part.amount, 0n);
  const ranked = [...parts].sort((a, b) => a.remainder === b.remainder
    ? a.index - b.index : a.remainder > b.remainder ? -1 : 1);
  for (const part of ranked) {
    if (remaining === 0n) break;
    part.amount += 1n;
    remaining -= 1n;
  }
  return parts.map((part) => Number(part.amount) * Math.sign(totalCents));
}

/** Proposed receipt-net closed-month policy. Posting stays approval-gated. */
export function settlementProposal({ ownerId, calendarMonth, paychecks, activeJobCount,
  partnership, packageVersion, agreementVersionId }) {
  if (!/^\d{4}-\d{2}-01$/.test(calendarMonth) || !ownerId || !agreementVersionId) {
    throw new RangeError('Owner, agreement version and calendar month are required');
  }
  if (!paychecks?.length || paychecks.some((check) => check.status !== 'paid' ||
      check.payDate.slice(0, 7) !== calendarMonth.slice(0, 7))) {
    throw new RangeError('All dated employer checks for the month need received paystubs');
  }
  const checks = [...paychecks].sort((a, b) => a.payDate.localeCompare(b.payDate) || a.id.localeCompare(b.id));
  if (new Set(checks.map((check) => check.id)).size !== checks.length) throw new RangeError('Duplicate paycheck');
  for (const check of checks) validatedReceipt(check.receipt);
  const afterTaxCents = checks.reduce((sum, check) => sum + check.receipt.actualNetReceivedCents, 0);
  asInteger(afterTaxCents, 'Receipt total');
  const statement = monthlyStatement({ afterTaxCents, activeJobCount, partnership, packageVersion });
  const weights = checks.map((check) => check.receipt.actualNetReceivedCents);
  const allocations = {
    quotedCostCents: allocateWeightedCents(statement.quotedCostCents, weights),
    actualCostCents: allocateWeightedCents(statement.actualCostCents, weights),
    partnerDueCents: allocateWeightedCents(statement.personShareCents, weights),
    commissionCents: allocateWeightedCents(statement.commissionCents, weights),
    gangCutCents: allocateWeightedCents(statement.gangCutCents, weights),
  };
  const lines = checks.map((check, index) => {
    const sourceNetCents = check.receipt.actualNetReceivedCents;
    const actualCostCents = allocations.actualCostCents[index];
    const partnerDueCents = allocations.partnerDueCents[index];
    const commissionCents = allocations.commissionCents[index];
    const gangCutCents = allocations.gangCutCents[index];
    return {
      paycheckId: check.id, payDate: check.payDate,
      receiptCorrectionSequence: check.receiptCorrectionSequence || 0,
      sourceGrossCents: check.receipt.actualGrossCents, sourceNetCents,
      quotedCostCents: allocations.quotedCostCents[index], actualCostCents,
      partnerDueCents, commissionCents, gangCutCents,
      yeromeResidualCents: sourceNetCents - actualCostCents - partnerDueCents - commissionCents - gangCutCents,
    };
  });
  if (lines.reduce((sum, line) => sum + line.yeromeResidualCents, 0) !== statement.yeromeTakeHomeCents) {
    throw new Error('Settlement fails conservation');
  }
  return { calculationVersion: 'receipt-net-closed-month-proposal-v1', ownerId, calendarMonth,
    agreementVersionId, activeJobCount, partnership,
    afterTaxCents, quotedCostCents: statement.quotedCostCents,
    actualCostCents: statement.actualCostCents, partnerDueCents: statement.personShareCents,
    commissionCents: statement.commissionCents, gangCutCents: statement.gangCutCents,
    yeromeResidualCents: statement.yeromeTakeHomeCents,
    needsLossDecision: statement.needsPayoutPolicy, lines };
}
