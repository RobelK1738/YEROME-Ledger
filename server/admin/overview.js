import { PACKAGE_V1 } from '../../src/lib/finance-v2/index.js';
import { verifiedPrincipal, sendApiError, allPages } from '../_lib/v2.js';
import { loadPlanningPerson, planningDto, loadCommissionProjections } from '../_lib/planning.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed.' });
  try {
    const principal = await verifiedPrincipal(req);
    if (!principal.ok) return res.status(principal.status).json({ error: 'Not authorized.' });
    if (principal.role !== 'admin') return res.status(403).json({ error: 'Admin required.' });
    const asOf = new Date().toISOString().slice(0, 10);
    const owners = await allPages(() => principal.db.from('owners').select('id').order('id'));
    const people = [];
    for (const owner of owners) {
      const data = await loadPlanningPerson(principal.db, owner.id, asOf);
      if (data) people.push(planningDto(data, true));
    }
    const commissions = await loadCommissionProjections(principal.db, asOf);
    for (const person of people) {
      person.commissionIncomeMonthlyCents = commissions.filter((row) => row.referrerOwnerId === person.ownerId)
        .reduce((sum, row) => sum + row.monthlyCents, 0);
    }
    const current = people.filter((person) => person.personStatus !== 'archived');
    res.setHeader('Cache-Control', 'private, no-store');
    return res.status(200).json({ packageAssumptions: PACKAGE_V1, gangCutDescription: '10% of after-tax income', asOf, basis: 'estimated monthly run rate', commissions,
      totalMonthlyProfitCents: current.reduce((sum, row) => sum + (row.yeromeTakeHomeMonthlyCents || 0), 0),
      people,
      unverifiedCount: current.filter((row) => !row.projectionAvailable).length });
  } catch (error) { return sendApiError(res, error); }
}
