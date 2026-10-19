const DIMENSIONS = Object.freeze({
  sourceNetCents: ['source_net_cents', 'after_tax_delta_cents'],
  quotedCostCents: ['quoted_cost_cents', 'quoted_cost_delta_cents'],
  actualCostCents: ['actual_cost_cents', 'actual_cost_delta_cents'],
  partnerDueCents: ['partner_due_cents', 'partner_due_delta_cents'],
  commissionCents: ['commission_cents', 'commission_delta_cents'],
  gangCutCents: ['gang_cut_cents', 'gang_delta_cents'],
  yeromeResidualCents: ['yerome_residual_cents', 'yerome_delta_cents'],
});

/** One posted check, its immutable revisions, and external partner payments. */
export function postedSettlementView(row, adjustments = [], payments = []) {
  const original = {};
  const changes = {};
  const current = {};
  for (const [name, [source, delta]] of Object.entries(DIMENSIONS)) {
    original[name] = Number(row[source]);
    changes[name] = adjustments.reduce((sum, item) => sum + Number(item[delta]), 0);
    current[name] = original[name] + changes[name];
    if (![original[name], changes[name], current[name]].every(Number.isSafeInteger)) {
      throw new RangeError('Settlement amount is not integer cents');
    }
  }
  const balanced = (values) => values.sourceNetCents === values.actualCostCents +
    values.partnerDueCents + values.commissionCents + values.gangCutCents +
    values.yeromeResidualCents;
  if (!balanced(original) || !balanced(changes) || !balanced(current)) {
    throw new Error('Posted settlement does not conserve cents');
  }
  const paidCents = payments.reduce((sum, payment) => sum + Number(payment.amount_cents), 0);
  if (!Number.isSafeInteger(paidCents)) throw new RangeError('Payment total is not integer cents');
  return { original, changes, current, paidCents,
    owedCents: Math.max(current.partnerDueCents - paidCents, 0),
    overpaidCents: Math.max(paidCents - current.partnerDueCents, 0),
    lastPaidAt: payments.map((payment) => payment.paid_at).sort().at(-1) || null };
}

export function adminPostedSettlementDto(row, adjustments = [], payments = []) {
  const ledger = postedSettlementView(row, adjustments, payments);
  return { settlementId: row.id, paycheckId: row.job_paycheck_id,
    payDate: row.pay_date, ...ledger.current,
    original: ledger.original, changes: ledger.changes,
    paidCents: ledger.paidCents, owedCents: ledger.owedCents,
    overpaidCents: ledger.overpaidCents,
    receiptCorrectionSequence: row.receipt_correction_sequence };
}
