import { adminClient, requireAdmin, readJsonBody } from '../_lib/supabaseAdmin.js';
import { allPages } from '../_lib/v2.js';

export default async function handler(req, res) {
  if (!['GET', 'POST'].includes(req.method)) return res.status(405).json({ error: 'Method not allowed.' });
  const auth = await requireAdmin(req);
  if (!auth.ok) return res.status(auth.status).json({ error: auth.error });
  const db = adminClient();
  try {
    if (req.method === 'GET') {
      const [transfers, verifications, partner, commission] = await Promise.all([
        allPages(() => db.from('v2_external_transfers')
          .select('id,recipient_owner_id,reference,total_cents,paid_at,source_account_alias,destination_account_alias,channel,currency')
          .order('paid_at', { ascending: false }).order('id')),
        allPages(() => db.from('v2_transfer_verifications')
          .select('transfer_id,evidence_reference,verified_at').order('transfer_id')),
        allPages(() => db.from('v2_partner_payments').select('id,transfer_id,amount_cents').order('id')),
        allPages(() => db.from('v2_commission_payments').select('id,transfer_id,amount_cents').order('id')),
      ]);
      res.setHeader('Cache-Control', 'private, no-store');
      return res.status(200).json({ transfers: transfers.map((row) => {
        const proof = verifications.find((item) => item.transfer_id === row.id);
        const allocatedCents = [...partner, ...commission].filter((item) => item.transfer_id === row.id)
          .reduce((sum, item) => sum + Number(item.amount_cents), 0);
        return { id: row.id, recipientOwnerId: row.recipient_owner_id, reference: row.reference,
          totalCents: Number(row.total_cents), paidAt: row.paid_at,
          sourceAccountAlias: row.source_account_alias, destinationAccountAlias: row.destination_account_alias,
          currency: row.currency, channel: row.channel,
          status: !row.recipient_owner_id ? 'historical_review_required' : proof ? 'verified' : 'registered',
          evidenceReference: proof?.evidence_reference || null, verifiedAt: proof?.verified_at || null,
          allocatedCents, availableCents: Number(row.total_cents) - allocatedCents };
      }) });
    }
    const body = await readJsonBody(req);
    const total = Number(body.totalCents);
    if (!Number.isSafeInteger(total) || total <= 0 || !body.recipientOwnerId ||
        !body.paidAt || !String(body.reference || '').trim() ||
        !String(body.sourceAccountAlias || '').trim() || !String(body.destinationAccountAlias || '').trim()) {
      return res.status(400).json({ error: 'Recipient, amount, date, bank reference and private account aliases required.' });
    }
    const args = { p_recipient: body.recipientOwnerId, p_total: total, p_paid_at: body.paidAt,
      p_reference: body.reference, p_source: body.sourceAccountAlias,
      p_destination: body.destinationAccountAlias, p_actor: auth.user.id };
    let result;
    if (body.action === 'register') result = await db.rpc('v2_register_transfer', args);
    else if (body.action === 'verify' && body.evidenceConfirmed === true && body.transferId &&
        String(body.evidenceReference || '').trim()) {
      result = await db.rpc('v2_verify_transfer', { ...args, p_transfer: body.transferId,
        p_evidence: body.evidenceReference });
    } else return res.status(400).json({ error: 'Review the external evidence and explicitly confirm it before verification.' });
    if (result.error) throw result.error;
    return res.status(201).json({ transferId: result.data });
  } catch (error) {
    console.error('Transfer request failed', error?.code || 'unknown');
    return res.status(409).json({ error: 'Transfer evidence is incomplete or conflicts with an immutable record. Independent review is required.' });
  }
}
