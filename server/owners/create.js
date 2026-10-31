// POST /api/owners/create — Admin-only. Creates a Supabase Auth identity for a
// new Owner (from username + password) and the linked owners row, then stamps
// the auth user's app_metadata with { role: 'owner', owner_id }.

import {
  adminClient,
  getEnv,
  requireAdmin,
  readJsonBody,
  validateUsername,
  validatePassword,
  serverAudit,
} from '../_lib/supabaseAdmin.js';

const FILING_STATUSES = ['single', 'mfj', 'mfs', 'hoh'];
const PARTNERSHIPS = ['DIRECT_2_WAY', 'MIKI_REFERRAL_2_WAY'];

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });

  const auth = await requireAdmin(req);
  if (!auth.ok) return res.status(auth.status).json({ error: auth.error });

  const body = await readJsonBody(req);
  const username = String(body.username || '').toLowerCase().trim();
  const { password, displayName } = body;
  const filingStatus = FILING_STATUSES.includes(body.filingStatus) ? body.filingStatus : 'single';
  const partnership = PARTNERSHIPS.includes(body.partnership) ? body.partnership : null;
  const state = body.state || 'TX';
  const notes = body.notes || null;

  const uErr = validateUsername(username);
  if (uErr) return res.status(400).json({ error: uErr });
  const pErr = validatePassword(password);
  if (pErr) return res.status(400).json({ error: pErr });
  if (!displayName || !String(displayName).trim()) {
    return res.status(400).json({ error: 'Display name is required.' });
  }
  if (!partnership) return res.status(400).json({ error: 'Choose a confirmed partnership model.' });

  const admin = adminClient();
  const { ownerAuthDomain } = getEnv();
  const email = `${username}@${ownerAuthDomain}`;

  // Reject duplicate username early with a friendly message.
  const { data: existing } = await admin.from('owners').select('id').eq('username', username).maybeSingle();
  if (existing) return res.status(409).json({ error: 'That username is already taken.' });

  // 1) Create the auth identity.
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: { role: 'owner' },
    user_metadata: { username, display_name: displayName },
  });
  if (createErr || !created?.user) {
    return res.status(400).json({ error: createErr?.message || 'Could not create Owner login.' });
  }
  const authUserId = created.user.id;

  // 2) Insert the owners row.
  const { data: owner, error: ownerErr } = await admin
    .from('owners')
    .insert({
      auth_user_id: authUserId,
      username,
      display_name: String(displayName).trim(),
      filing_status: filingStatus,
      state,
      notes,
      status: 'active',
    })
    .select()
    .single();
  if (ownerErr) {
    // Roll back the auth user so we don't orphan an identity.
    await admin.auth.admin.deleteUser(authUserId).catch(() => {});
    return res.status(400).json({ error: ownerErr.message || 'Could not create Owner record.' });
  }

  const { error: apartmentErr } = await admin.rpc('v2_change_agreement', {
    p_owner: owner.id,
    p_partnership: partnership,
    p_actual_apartment_cents: 65000,
    p_quoted_apartment_cents: 90000,
    p_reference: '',
    p_verified: false,
    p_effective_from: new Date().toISOString().slice(0, 10),
    p_actor: auth.user.id,
  });
  if (apartmentErr) {
    await admin.from('owners').delete().eq('id', owner.id);
    await admin.auth.admin.deleteUser(authUserId).catch(() => {});
    return res.status(500).json({ error: 'Could not save planning inputs.' });
  }

  // 3) Stamp owner_id into app_metadata for fast RLS lookups.
  await admin.auth.admin.updateUserById(authUserId, {
    app_metadata: { role: 'owner', owner_id: owner.id },
  });

  await serverAudit(admin, {
    actorUserId: auth.user.id,
    action: 'owner.created',
    entityType: 'owner',
    entityId: owner.id,
    metadata: { username, display_name: owner.display_name, filing_status: filingStatus,
      partnership, planning_ready: true },
  });

  return res.status(200).json({ ok: true, owner });
}
