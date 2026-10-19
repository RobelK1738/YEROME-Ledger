// POST /api/owners/set-status — Admin-only. Updates an Owner's status and can
// enable/disable their login by banning/unbanning the auth identity.

import { adminClient, requireAdmin, manageableOwnerIdentity, readJsonBody, serverAudit } from '../_lib/supabaseAdmin.js';

const STATUSES = ['active', 'inactive', 'archived'];
// Effectively permanent ban to disable a login; 'none' re-enables it.
const BAN_DURATION = '876000h';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });

  const auth = await requireAdmin(req);
  if (!auth.ok) return res.status(auth.status).json({ error: auth.error });

  const body = await readJsonBody(req);
  const { ownerId } = body;
  const status = STATUSES.includes(body.status) ? body.status : null;
  if (!ownerId) return res.status(400).json({ error: 'ownerId is required.' });
  if (!status) return res.status(400).json({ error: 'A valid status is required.' });

  const disableLogin = status !== 'active';

  const admin = adminClient();
  const { data: owner, error: ownerErr } = await admin
    .from('owners')
    .select('id, auth_user_id, username, status')
    .eq('id', ownerId)
    .maybeSingle();
  if (ownerErr || !owner) return res.status(404).json({ error: 'Owner not found.' });
  if (!await manageableOwnerIdentity(admin, owner, auth.user.id)) {
    return res.status(403).json({ error: 'This identity cannot be managed as an Owner.' });
  }

  if (!disableLogin && owner.auth_user_id) {
    const { error: unbanError } = await admin.auth.admin
      .updateUserById(owner.auth_user_id, { ban_duration: 'none' });
    if (unbanError) return res.status(503).json({ error: 'Could not reactivate the Auth account.' });
  }

  const { error: updErr } = await admin.from('owners').update({ status }).eq('id', ownerId);
  if (updErr) return res.status(400).json({ error: 'Could not update status.' });

  if (disableLogin && owner.auth_user_id) {
    const { error: banError } = await admin.auth.admin
      .updateUserById(owner.auth_user_id, { ban_duration: BAN_DURATION });
    if (banError) {
      console.error('Owner Auth status update failed', banError.code || 'unknown');
      await serverAudit(admin, { actorUserId: auth.user.id, action: 'owner.status_changed_auth_retry_needed',
        entityType: 'owner', entityId: owner.id,
        metadata: { from: owner.status, to: status, login_disabled: disableLogin } });
      return res.status(503).json({ error: 'Person status changed, but Auth access update failed. Retry the status action.' });
    }
  }

  await serverAudit(admin, {
    actorUserId: auth.user.id,
    action: status === 'archived' ? 'owner.archived' : 'owner.status_changed',
    entityType: 'owner',
    entityId: owner.id,
    metadata: { from: owner.status, to: status, login_disabled: disableLogin },
  });

  return res.status(200).json({ ok: true });
}
