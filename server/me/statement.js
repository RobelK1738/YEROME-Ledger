import { verifiedPrincipal, sendApiError } from '../_lib/v2.js';
import { loadPlanningPerson, planningDto, loadCommissionProjections, ownerCommissionSources } from '../_lib/planning.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed.' });
  try {
    const principal = await verifiedPrincipal(req);
    if (!principal.ok) return res.status(principal.status).json({ error: 'Not authorized.' });
    if (principal.role !== 'owner') return res.status(403).json({ error: 'Owner account required.' });
    const asOf = new Date().toISOString().slice(0, 10);
    const data = await loadPlanningPerson(principal.db, principal.ownerId, asOf);
    if (!data) return res.status(404).json({ error: 'Profile not found.' });
    const commissionSources = ownerCommissionSources(await loadCommissionProjections(principal.db, asOf, principal.ownerId));
    res.setHeader('Cache-Control', 'private, no-store');
    return res.status(200).json({ ...planningDto(data), commissionSources,
      commissionIncomeMonthlyCents: commissionSources.reduce((sum, row) => sum + row.monthlyEquivalentCents, 0) });
  } catch (error) { return sendApiError(res, error); }
}
