import { verifiedPrincipal, sendApiError } from '../_lib/v2.js';
import { loadCommissionProjections, ownerCommissionSources } from '../_lib/planning.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed.' });
  try {
    const principal = await verifiedPrincipal(req);
    if (!principal.ok) return res.status(principal.status).json({ error: 'Not authorized.' });
    if (principal.role !== 'owner') return res.status(403).json({ error: 'Owner account required.' });
    const sources = await loadCommissionProjections(principal.db, new Date().toISOString().slice(0, 10), principal.ownerId);
    res.setHeader('Cache-Control', 'private, no-store');
    return res.status(200).json({ basis: 'estimated monthly run rate', referrals: ownerCommissionSources(sources) });
  } catch (error) { return sendApiError(res, error); }
}
