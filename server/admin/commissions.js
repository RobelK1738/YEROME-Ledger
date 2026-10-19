import { adminClient, requireAdmin, readJsonBody } from '../_lib/supabaseAdmin.js';
import { allPages } from '../_lib/v2.js';

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
            !body.transferId || !String(body.idempotencyKey || '').trim()) {
          return res.status(400).json({ error: 'Accrual, positive amount, verified transfer and request key required.' });
        }
        const { data, error } = await db.rpc('v2_record_commission_allocation', {
          p_accrual: body.accrualId, p_amount_cents: amount,
          p_transfer: body.transferId, p_key: body.idempotencyKey, p_actor: auth.user.id,
        });
        if (error) throw error;
        return res.status(201).json({ paymentId: data });
      }
      return res.status(400).json({ error: 'Unsupported commission action.' });
    }
    const [referrals, owners, recordedAccruals, payments] = await Promise.all([
      allPages(() => db.from('referrals')
        .select('id,referrer_owner_id,referred_owner_id,commission_basis_type,active,start_date,end_date')
        .order('id')),
      allPages(() => db.from('owners').select('id,display_name').order('id')),
      allPages(() => db.from('v2_commission_accruals')
        .select('id,referral_id,calendar_month,eligible_job_count,amount_cents')
        .order('calendar_month', { ascending: false }).order('id')),
      allPages(() => db.from('v2_commission_payments')
        .select('id,accrual_id,amount_cents,paid_at,evidence_verified').order('id')),
    ]);
    const names = new Map(owners.map((owner) => [owner.id, owner.display_name]));
    const accruals = recordedAccruals.map((accrual) => {
      const paidCents = payments.filter((payment) => payment.accrual_id === accrual.id)
        .reduce((sum, payment) => sum + Number(payment.amount_cents), 0);
      return {
        id: accrual.id, referralId: accrual.referral_id, calendarMonth: accrual.calendar_month,
        eligibleJobCount: accrual.eligible_job_count,
        accruedCents: Number(accrual.amount_cents), paidCents,
        unverifiedPaidCents: payments.filter((payment) => payment.accrual_id === accrual.id && payment.evidence_verified !== true)
          .reduce((sum, payment) => sum + Number(payment.amount_cents), 0),
        owedCents: Number(accrual.amount_cents) - paidCents,
      };
    });
    res.setHeader('Cache-Control', 'private, no-store');
    const today = new Date().toISOString().slice(0, 10);
    return res.status(200).json({
      referrals: referrals.map((referral) => ({
        id: referral.id,
        referrerOwnerId: referral.referrer_owner_id,
        referredOwnerId: referral.referred_owner_id,
        referrerName: names.get(referral.referrer_owner_id) || 'US Person',
        referredName: names.get(referral.referred_owner_id) || 'US Person',
        relationshipCurrent: Boolean(referral.active && referral.start_date <= today &&
          (!referral.end_date || referral.end_date >= today)),
        startDate: referral.start_date, endDate: referral.end_date,
        needsContractReview: referral.commission_basis_type !== 'flat_per_active_job_month',
      })),
      accruals,
    });
  } catch (error) {
    console.error('Admin commission operation failed', error?.code || 'unknown');
    if (error?.message === 'Transfer beneficiary does not match obligation')
      return res.status(409).json({ error: 'This transfer was sent to another recipient. Choose a verified transfer to the person owed.' });
    if (error?.message === 'Transfer must be verified against external evidence before allocation')
      return res.status(409).json({ error: 'Verify the transfer against external evidence before allocating it.' });
    if (error?.message?.includes('External reference collision'))
      return res.status(409).json({ error: 'Bank reference conflicts with recorded transfer evidence. Independent review is required.' });
    if (error?.message?.includes('External transfer already fully allocated') || error?.code === '23505')
      return res.status(409).json({ error: 'This bank transfer is already allocated to this accrual or has no remaining amount.' });
    return res.status(400).json({ error: 'Could not complete the commission record.' });
  }
}
