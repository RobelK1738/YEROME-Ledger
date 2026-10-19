import { verifiedPrincipal, sendApiError, eligibleJobCountAsOf, allPages } from '../_lib/v2.js';
import { referralCurrentlyEarning, referralCommissionSummary } from '../../src/lib/finance-v2/commission-history.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed.' });
  try {
    const principal = await verifiedPrincipal(req);
    if (!principal.ok) return res.status(principal.status).json({ error: 'Not authorized.' });
    if (principal.role !== 'owner') return res.status(403).json({ error: 'Owner account required.' });
    const { db, ownerId } = principal;
    const asOf = new Date().toISOString().slice(0, 10);
    const referrals = await allPages(() => db.from('referrals')
      .select('id,referred_owner_id,commission_basis_type,flat_amount_cents,active,start_date,end_date,name_visible_to_referrer')
      .eq('referrer_owner_id', ownerId)
      .eq('commission_basis_type', 'flat_per_active_job_month')
      .order('id'));
    const rows = [];
    for (const referral of referrals) {
      const [nameResult, accruals, agreementResult, statusEvents] = await Promise.all([
        referral.name_visible_to_referrer
          ? db.from('owners').select('display_name').eq('id', referral.referred_owner_id).maybeSingle()
          : Promise.resolve({ data: null, error: null }),
        allPages(() => db.from('v2_commission_accruals')
          .select('id,calendar_month,eligible_job_count,amount_cents')
          .eq('referral_id', referral.id).order('calendar_month', { ascending: false }).order('id')),
        db.from('v2_agreement_versions').select('id').eq('owner_id', referral.referred_owner_id)
          .eq('partnership', 'MIKI_REFERRAL_2_WAY').not('verified_at', 'is', null)
          .lte('effective_from', asOf).or(`effective_to.is.null,effective_to.gte.${asOf}`).limit(1),
        allPages(() => db.from('v2_referral_status_events')
          .select('active,effective_from,event_order').eq('referral_id', referral.id)
          .lte('effective_from', asOf).order('effective_from').order('event_order')),
      ]);
      if (nameResult.error || agreementResult.error) throw nameResult.error || agreementResult.error;
      const currentlyEarning = referralCurrentlyEarning(referral,
        Boolean(agreementResult.data?.length), statusEvents, asOf);
      const eligibleJobCount = currentlyEarning
        ? await eligibleJobCountAsOf(db, referral.referred_owner_id, asOf) : 0;
      const accrualIds = accruals.map((item) => item.id);
      const payments = [];
      for (let offset = 0; offset < accrualIds.length; offset += 100) {
        payments.push(...await allPages(() => db.from('v2_commission_payments')
          .select('id,accrual_id,amount_cents,paid_at,evidence_verified')
          .in('accrual_id', accrualIds.slice(offset, offset + 100)).order('paid_at').order('id')));
      }
      rows.push(referralCommissionSummary({ referral,
        displayName: nameResult.data?.display_name || 'Referred US Person',
        currentlyEarning, eligibleJobCount, accruals, payments }));
    }
    res.setHeader('Cache-Control', 'private, no-store');
    return res.status(200).json({ basis: 'estimated full-month run rate', referrals: rows });
  } catch (error) {
    return sendApiError(res, error);
  }
}
