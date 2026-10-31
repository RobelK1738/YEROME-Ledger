import authSession from '../server/auth/session.js';
import adminTransfers from '../server/admin/transfers.js';
import adminCommissions from '../server/admin/commissions.js';
import adminJob from '../server/admin/job.js';
import adminOverview from '../server/admin/overview.js';
import adminPaycheck from '../server/admin/paycheck.js';
import adminPerson from '../server/admin/person.js';
import adminPlanning from '../server/admin/planning.js';
import adminReferral from '../server/admin/referral.js';
import adminSettlements from '../server/admin/settlements.js';
import meCommissions from '../server/me/commissions.js';
import meStatement from '../server/me/statement.js';
import ownerLogin from '../server/owner-login.js';
import ownersCreate from '../server/owners/create.js';
import ownersDelete from '../server/owners/delete.js';
import ownersResetPassword from '../server/owners/reset-password.js';
import ownersSetStatus from '../server/owners/set-status.js';

const routes = Object.freeze({
  'auth/session': authSession,
  'admin/transfers': adminTransfers,
  'admin/commissions': adminCommissions,
  'admin/job': adminJob,
  'admin/overview': adminOverview,
  'admin/paycheck': adminPaycheck,
  'admin/person': adminPerson,
  'admin/planning': adminPlanning,
  'admin/referral': adminReferral,
  'admin/settlements': adminSettlements,
  'me/commissions': meCommissions,
  'me/statement': meStatement,
  'owner-login': ownerLogin,
  'owners/create': ownersCreate,
  'owners/delete': ownersDelete,
  'owners/reset-password': ownersResetPassword,
  'owners/set-status': ownersSetStatus,
});

export default function handler(req, res) {
  const rawRoute = req.query?.route || new URL(req.url, 'http://localhost').pathname.replace(/^\/api\//, '');
  const route = Array.isArray(rawRoute) ? rawRoute.join('/') : String(rawRoute);
  const selected = Object.hasOwn(routes, route) ? routes[route] : null;
  if (!selected) return res.status(404).json({ error: 'API route not found.' });
  return selected(req, res);
}
