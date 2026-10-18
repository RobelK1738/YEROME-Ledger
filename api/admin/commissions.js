import { adminClient, requireAdmin, readJsonBody } from '../_lib/supabaseAdmin.js';

export default async function handler(req, res) {
  if (!['GET', 'POST'].includes(req.method)) return res.status(405).json({ error: 'Method not allowed.' });
  const auth = await requireAdmin(req);
  if (!auth.ok) return res.status(auth.status).json({ error: auth.error });
  const db = adminClient();
  try {
    if (req.method === 'POST') {
      const body = await readJsonBody(req);
      if (body.action === 'accrue') {
        if (!body.referralId || !/^\d{4}-\d{2}-01$/.test(body.calendarMonth || '')) {
          return res.status(400).json({ error: 'Choose a referral and completed calendar month.' });
        }
        const { data, error } = await db.rpc('v2_post_full_month_commission', {
          p_referral: body.referralId, p_month: body.calendarMonth, p_actor: auth.user.id,
        });
        if (error) throw error;
        return res.status(201).json({ accrualId: data });
      }
      if (body.action === 'payment') {
        const amount = Number(body.amountCents);
        if (!body.accrualId || !Number.isSafeInteger(amount) || amount <= 0 ||
            !body.paidAt || !String(body.paymentReference || '').trim()) {
          return res.status(400).json({ error: 'Accrual, amount, date and external payment reference are required.' });
        }
        const { data, error } = await db.rpc('v2_record_commission_payment', {
          p_accrual: body.accrualId, p_amount_cents: amount,
          p_paid_at: body.paidAt, p_reference: String(body.paymentReference).trim(),
          p_actor: auth.user.id,
        });
        if (error) throw error;
        return res.status(201).json({ paymentId: data });
      }
      return res.status(400).json({ error: 'Unsupported commission action.' });
    }
    const [referralsResult, ownersResult, accrualResult, paymentResult] = await Promise.all([
      db.from('referrals').select('id,referrer_owner_id,referred_owner_id,commission_basis_type,active')
        .eq('active', true),
      db.from('owners').select('id,display_name'),
      db.from('v2_commission_accruals').select('id,referral_id,calendar_month,eligible_job_count,amount_cents')
        .order('calendar_month', { ascending: false }),
      db.from('v2_commission_payments').select('accrual_id,amount_cents,paid_at'),
    ]);
    for (const result of [referralsResult, ownersResult, accrualResult, paymentResult]) {
      if (result.error) throw result.error;
    }
    const names = new Map((ownersResult.data || []).map((owner) => [owner.id, owner.display_name]));
    const accruals = (accrualResult.data || []).map((accrual) => {
      const paidCents = (paymentResult.data || []).filter((payment) => payment.accrual_id === accrual.id)
        .reduce((sum, payment) => sum + Number(payment.amount_cents), 0);
      return {
        id: accrual.id, referralId: accrual.referral_id, calendarMonth: accrual.calendar_month,
        eligibleJobCount: accrual.eligible_job_count,
        accruedCents: Number(accrual.amount_cents), paidCents,
        owedCents: Number(accrual.amount_cents) - paidCents,
      };
    });
    res.setHeader('Cache-Control', 'private, no-store');
    return res.status(200).json({
      referrals: (referralsResult.data || []).map((referral) => ({
        id: referral.id,
        referrerName: names.get(referral.referrer_owner_id) || 'US Person',
        referredName: names.get(referral.referred_owner_id) || 'US Person',
        needsContractReview: referral.commission_basis_type !== 'flat_per_active_job_month',
      })),
      accruals,
    });
  } catch (error) {
    console.error('Admin commission operation failed', error?.code || 'unknown');
    return res.status(400).json({ error: 'Could not complete the commission record.' });
  }
}
