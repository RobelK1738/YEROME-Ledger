import { verifiedPrincipal, loadPersonProjection, sendApiError } from '../_lib/v2.js';
import { ownerStatementDto } from '../../src/lib/finance-v2/projection.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed.' });
  try {
    const principal = await verifiedPrincipal(req);
    if (!principal.ok) return res.status(principal.status).json({ error: 'Not authorized.' });
    if (principal.role !== 'owner') return res.status(403).json({ error: 'Owner account required.' });
    const projection = await loadPersonProjection(principal.db, principal.ownerId);
    if (!projection) return res.status(404).json({ error: 'Profile not found.' });
    res.setHeader('Cache-Control', 'private, no-store');
    return res.status(200).json(ownerStatementDto(projection));
  } catch (error) {
    return sendApiError(res, error);
  }
}
