import { authorizeRequest } from '../_lib/supabaseAdmin.js';

// Return only the authorized role; no identity or financial data is exposed.
export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed.' });
  const auth = await authorizeRequest(req);
  res.setHeader('Cache-Control', 'private, no-store');
  if (!auth.ok) return res.status(auth.status).json({ error: 'Not authorized.' });
  return res.status(200).json({ role: auth.role });
}
