import { verifiedPrincipal, sendApiError } from '../_lib/v2.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed.' });
  try {
    const principal = await verifiedPrincipal(req);
    if (!principal.ok) return res.status(principal.status).json({ error: 'Not authorized.' });
    if (principal.role !== 'owner') return res.status(403).json({ error: 'Owner account required.' });
    const { db, ownerId } = principal;
    const { data: referrals, error } = await db.from('referrals')
      .select('id,referred_owner_id,commission_basis_type,flat_amount_cents,active,name_visible_to_referrer')
      .eq('referrer_owner_id', ownerId).eq('active', true)
      .eq('commission_basis_type', 'flat_per_active_job_month');
    if (error) throw error;
    const rows = [];
    const asOf = new Date().toISOString().slice(0, 10);
    for (const referral of referrals || []) {
      const [{ count, error: countError }, nameResult, accrualResult, agreementResult] = await Promise.all([
        db.from('jobs').select('id', { count: 'exact', head: true })
          .eq('owner_id', referral.referred_owner_id).eq('status', 'active')
          .lte('start_date', asOf).or(`end_date.is.null,end_date.gte.${asOf}`),
        referral.name_visible_to_referrer
          ? db.from('owners').select('display_name').eq('id', referral.referred_owner_id).maybeSingle()
          : Promise.resolve({ data: null, error: null }),
        db.from('v2_commission_accruals').select('id,calendar_month,eligible_job_count,amount_cents')
          .eq('referral_id', referral.id).order('calendar_month', { ascending: false }),
        db.from('v2_agreement_versions').select('id').eq('owner_id', referral.referred_owner_id)
          .eq('partnership', 'MIKI_REFERRAL_2_WAY').not('verified_at', 'is', null)
          .lte('effective_from', asOf).or(`effective_to.is.null,effective_to.gte.${asOf}`).limit(1),
      ]);
      if (countError || nameResult.error || accrualResult.error || agreementResult.error) {
        throw countError || nameResult.error || accrualResult.error || agreementResult.error;
      }
      if (!agreementResult.data?.length) continue;
      const accruals = accrualResult.data || [];
      const accrualIds = accruals.map((item) => item.id);
      const paymentResult = accrualIds.length
        ? await db.from('v2_commission_payments').select('accrual_id,amount_cents,paid_at')
          .in('accrual_id', accrualIds)
        : { data: [], error: null };
      if (paymentResult.error) throw paymentResult.error;
      const payments = paymentResult.data || [];
      const eligibleJobCount = Number(count) || 0;
      const needsContractReview = referral.commission_basis_type !== 'flat_per_active_job_month';
      const ratePerJobCents = needsContractReview ? 0 : Number(referral.flat_amount_cents ?? 20000);
      const events = accruals.map((accrual) => {
        const paidCents = payments.filter((payment) => payment.accrual_id === accrual.id)
          .reduce((sum, payment) => sum + Number(payment.amount_cents), 0);
        return {
          calendarMonth: accrual.calendar_month,
          eligibleJobCount: accrual.eligible_job_count,
          accruedCents: Number(accrual.amount_cents),
          paidCents,
          owedCents: Number(accrual.amount_cents) - paidCents,
          lastPaidAt: payments.filter((payment) => payment.accrual_id === accrual.id)
            .map((payment) => payment.paid_at).sort().at(-1) || null,
        };
      });
      const accruedCents = events.reduce((sum, event) => sum + event.accruedCents, 0);
      const paidCents = events.reduce((sum, event) => sum + event.paidCents, 0);
      rows.push({
        referralId: referral.id,
        referredDisplayName: nameResult.data?.display_name || 'Referred US Person',
        eligibleJobCount,
        ratePerJobCents,
        monthlyEquivalentCents: eligibleJobCount * ratePerJobCents,
        annualEquivalentCents: eligibleJobCount * ratePerJobCents * 12,
        needsContractReview,
        accruedCents,
        paidCents,
        owedCents: accruedCents - paidCents,
        events,
      });
    }
    res.setHeader('Cache-Control', 'private, no-store');
    return res.status(200).json({ basis: 'estimated full-month run rate', referrals: rows });
  } catch (error) {
    return sendApiError(res, error);
  }
}
