import { adminClient, requireAdmin, readJsonBody, serverAudit } from '../_lib/supabaseAdmin.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });
  const auth = await requireAdmin(req);
  if (!auth.ok) return res.status(auth.status).json({ error: auth.error });
  const body = await readJsonBody(req);
  if (!body.referrerOwnerId || !body.referredOwnerId || body.referrerOwnerId === body.referredOwnerId) {
    return res.status(400).json({ error: 'Choose two different US Persons.' });
  }
  const db = adminClient();
  try {
    const { data: referred, error: referredError } = await db.from('owners')
      .select('id,v2_partnership,agreement_verified_at').eq('id', body.referredOwnerId).single();
    if (referredError || referred?.v2_partnership !== 'MIKI_REFERRAL_2_WAY' || !referred.agreement_verified_at) {
      return res.status(409).json({ error: 'Verify the referred US Person’s written commission agreement first.' });
    }
    const { data: referral, error } = await db.from('referrals').insert({
      referrer_owner_id: body.referrerOwnerId,
      referred_owner_id: body.referredOwnerId,
      commission_basis_type: 'flat_per_active_job_month',
      commission_rate: 0,
      flat_amount_cents: 20000,
      name_visible_to_referrer: body.nameVisibleToReferrer === true,
      active: true,
      start_date: body.startDate || new Date().toISOString().slice(0, 10),
    }).select('id').single();
    if (error) throw error;
    await serverAudit(db, { actorUserId: auth.user.id, action: 'v2.referral.created',
      entityType: 'referral', entityId: referral.id, metadata: {
        referrer_owner_id: body.referrerOwnerId, referred_owner_id: body.referredOwnerId,
        monthly_rate_per_job_cents: 20000,
      } });
    return res.status(201).json({ referralId: referral.id });
  } catch (error) {
    console.error('Admin referral setup failed', error?.code || 'unknown');
    return res.status(400).json({ error: 'Could not establish the referral contract.' });
  }
}
