import { adminClient, requireAdmin, readJsonBody } from '../_lib/supabaseAdmin.js';

export default async function handler(req, res) {
  if (!['POST', 'PATCH'].includes(req.method)) return res.status(405).json({ error: 'Method not allowed.' });
  const auth = await requireAdmin(req);
  if (!auth.ok) return res.status(auth.status).json({ error: auth.error });
  const body = await readJsonBody(req);
  const db = adminClient();
  if (req.method === 'PATCH') {
    if (!body.referralId || body.action !== 'end') return res.status(400).json({ error: 'Referral ID and end action required.' });
    const { data, error } = await db.rpc('v2_end_referral', {
      p_referral: body.referralId, p_effective_from: body.effectiveFrom || new Date().toISOString().slice(0, 10),
      p_actor: auth.user.id,
    });
    if (error) return res.status(400).json({ error: 'Could not end referral; review effective date and history.' });
    return res.status(200).json({ statusEventId: data });
  }
  if (!body.referrerOwnerId || !body.referredOwnerId || body.referrerOwnerId === body.referredOwnerId) {
    return res.status(400).json({ error: 'Choose two different US Persons.' });
  }
  try {
    const startDate = body.startDate || new Date().toISOString().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) return res.status(400).json({ error: 'Valid start date required.' });
    const { data: referralId, error } = await db.rpc('v2_replace_referral', {
      p_existing: body.replaceReferralId || null,
      p_referrer: body.referrerOwnerId, p_referred: body.referredOwnerId,
      p_start: startDate, p_name_visible: body.nameVisibleToReferrer === true,
      p_actor: auth.user.id,
    });
    if (error) throw error;
    return res.status(201).json({ referralId });
  } catch (error) {
    console.error('Admin referral setup failed', error?.code || 'unknown');
    return res.status(400).json({ error: 'Could not establish the referral contract.' });
  }
}
