import { verifiedPrincipal, loadPersonProjection, sendApiError } from '../_lib/v2.js';
import { adminStatementDto } from '../../src/lib/finance-v2/projection.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed.' });
  try {
    const principal = await verifiedPrincipal(req);
    if (!principal.ok) return res.status(principal.status).json({ error: 'Not authorized.' });
    if (principal.role !== 'admin') return res.status(403).json({ error: 'Admin required.' });
    const { data: owners, error } = await principal.db.from('owners')
      .select('id,status').order('created_at');
    if (error) throw error;
    const people = [];
    for (const owner of owners || []) {
      const projection = await loadPersonProjection(principal.db, owner.id);
      if (projection) people.push(adminStatementDto(projection));
    }
    const currentPeople = people.filter((person) => person.personStatus !== 'archived');
    const totalMonthlyProfitCents = currentPeople.reduce((sum, person) =>
      sum + (person.yeromeTakeHomeMonthlyCents || 0), 0);
    res.setHeader('Cache-Control', 'private, no-store');
    return res.status(200).json({
      calculationVersion: people[0]?.calculationVersion || null,
      basis: 'estimated monthly run rate',
      totalMonthlyProfitCents,
      people,
      unverifiedCount: currentPeople.filter((person) => !person.projectionAvailable).length,
    });
  } catch (error) {
    return sendApiError(res, error);
  }
}
