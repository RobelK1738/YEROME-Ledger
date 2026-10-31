import { verifiedPrincipal } from '../_lib/v2.js';
import { readJsonBody } from '../_lib/supabaseAdmin.js';
import { validISODate } from '../../src/lib/finance-v2/allocation-plan.js';

export default async function handler(req, res) {
  if (req.method !== 'PATCH') return res.status(405).json({ error: 'Method not allowed.' });
  try {
    const principal = await verifiedPrincipal(req);
    if (!principal.ok) return res.status(principal.status).json({ error: 'Not authorized.' });
    if (principal.role !== 'admin') return res.status(403).json({ error: 'Admin required.' });
    const body = await readJsonBody(req);
    if (!body.ownerId) return res.status(400).json({ error: 'Choose an owner.' });
    let patch;
    if (body.action === 'assumptions') {
      if (!['DIRECT_2_WAY', 'MIKI_REFERRAL_2_WAY'].includes(body.partnership) ||
        ![body.actualMonthlyCents, body.quotedMonthlyCents].every((value) => Number.isSafeInteger(value) && value >= 0))
        return res.status(400).json({ error: 'Choose a partnership and nonnegative monthly costs.' });
      patch = { partnership: body.partnership, apartment_actual_cents: body.actualMonthlyCents,
        apartment_charge_cents: body.quotedMonthlyCents };
    } else if (body.action === 'allocation') {
      if ((body.nextFundDate && !validISODate(body.nextFundDate)) ||
        typeof body.instructions !== 'string' || body.instructions.length > 5000)
        return res.status(400).json({ error: 'Use a valid date and instructions of 5,000 characters or fewer.' });
      patch = { next_fund_date: body.nextFundDate || null, instructions: body.instructions.trim() };
    } else return res.status(400).json({ error: 'Choose assumptions or allocation.' });
    const { error } = await principal.db.rpc('v3_save_projection_plan', {
      p_owner: body.ownerId, p_patch: patch, p_actor: principal.user.id,
    });
    if (error) throw error;
    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error('Planning inputs save failed', error?.code || 'unknown');
    return res.status(500).json({ error: 'Could not save planning inputs. Please try again.' });
  }
}
