import { adminClient, requireAdmin, readJsonBody } from '../_lib/supabaseAdmin.js';

const PARTNERSHIPS = new Set(['DIRECT_2_WAY', 'MIKI_REFERRAL_2_WAY']);

export default async function handler(req, res) {
  if (req.method !== 'PATCH') return res.status(405).json({ error: 'Method not allowed.' });
  const auth = await requireAdmin(req);
  if (!auth.ok) return res.status(auth.status).json({ error: auth.error });
  const body = await readJsonBody(req);
  const reference = String(body.agreementReference || '').trim();
  const actual = Number(body.actualMonthlyCents);
  const quoted = Number(body.quotedMonthlyCents);
  if (!body.ownerId || !PARTNERSHIPS.has(body.partnership) || (body.agreementVerified && !reference) || !body.effectiveFrom ||
      !Number.isSafeInteger(actual) || actual < 0 || !Number.isSafeInteger(quoted) || quoted < 0) {
    return res.status(400).json({ error: 'Partnership, written agreement reference, and apartment amounts are required.' });
  }
  const db = adminClient();
  try {
    const { data, error } = await db.rpc('v2_change_agreement', {
      p_owner: body.ownerId, p_partnership: body.partnership,
      p_actual_apartment_cents: actual, p_quoted_apartment_cents: quoted,
      p_reference: reference, p_verified: body.agreementVerified === true,
      p_effective_from: body.effectiveFrom, p_actor: auth.user.id,
    });
    if (error) throw error;
    return res.status(200).json({ ok: true, agreementVersionId: data });
  } catch (error) {
    console.error('Admin agreement update failed', error?.code || 'unknown');
    return res.status(400).json({ error: 'Could not save agreement review.' });
  }
}
