/** Current run rate is independent of posted historical accruals and payments. */
export function referralCurrentlyEarning(referral, hasCurrentAgreement, statusEvents, asOf) {
  if (!hasCurrentAgreement || !referral.active || !referral.start_date ||
      referral.start_date > asOf || (referral.end_date && referral.end_date < asOf)) return false;
  const latest = [...statusEvents].filter((event) => event.effective_from <= asOf)
    .sort((a, b) => a.effective_from.localeCompare(b.effective_from) ||
      Number(a.event_order) - Number(b.event_order)).at(-1);
  return latest?.active === true;
}

export function referralCommissionSummary({ referral, displayName, currentlyEarning,
  eligibleJobCount, accruals, payments }) {
  const ratePerJobCents = Number(referral.flat_amount_cents);
  const paidByAccrual = new Map();
  const lastPaidByAccrual = new Map();
  for (const payment of payments) {
    paidByAccrual.set(payment.accrual_id,
      (paidByAccrual.get(payment.accrual_id) || 0) + Number(payment.amount_cents));
    if (!lastPaidByAccrual.has(payment.accrual_id) ||
        payment.paid_at > lastPaidByAccrual.get(payment.accrual_id)) {
      lastPaidByAccrual.set(payment.accrual_id, payment.paid_at);
    }
  }
  const events = accruals.map((accrual) => {
    const paidCents = paidByAccrual.get(accrual.id) || 0;
    return { calendarMonth: accrual.calendar_month,
      eligibleJobCount: accrual.eligible_job_count,
      accruedCents: Number(accrual.amount_cents), paidCents,
      owedCents: Number(accrual.amount_cents) - paidCents,
      lastPaidAt: lastPaidByAccrual.get(accrual.id) || null };
  });
  const accruedCents = events.reduce((sum, event) => sum + event.accruedCents, 0);
  const paidCents = events.reduce((sum, event) => sum + event.paidCents, 0);
  return { referralId: referral.id, referredDisplayName: displayName,
    currentlyEarning, eligibleJobCount: currentlyEarning ? eligibleJobCount : 0,
    ratePerJobCents, monthlyEquivalentCents: currentlyEarning ? eligibleJobCount * ratePerJobCents : 0,
    annualEquivalentCents: currentlyEarning ? eligibleJobCount * ratePerJobCents * 12 : 0,
    needsContractReview: false, accruedCents, paidCents,
    owedCents: accruedCents - paidCents, events };
}
