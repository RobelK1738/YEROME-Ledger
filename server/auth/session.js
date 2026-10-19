import { authorizeRequest } from '../_lib/supabaseAdmin.js';

// AAL1 canonical Admin may only reach this enrollment-status endpoint. It never
// returns the pin, session claims, other identities or financial records.
export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed.' });
  const auth = await authorizeRequest(req);
  res.setHeader('Cache-Control', 'private, no-store');
  if (!auth.ok) return res.status(auth.status).json({ error: 'Not authorized.' });
  return res.status(200).json({ role: auth.role === 'admin_mfa_required' ? null : auth.role,
    mfaRequired: auth.role === 'admin_mfa_required' });
}
