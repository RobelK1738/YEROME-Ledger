// Historical person/job/pay records must be retained. Admins can archive a
// person through the status endpoint after the associated obligations are met.
import { requireAdmin } from '../_lib/supabaseAdmin.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });
  const auth = await requireAdmin(req);
  if (!auth.ok) return res.status(auth.status).json({ error: auth.error });
  return res.status(409).json({ error: 'Permanent deletion is disabled. Archive the US Person instead.' });
}
