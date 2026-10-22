// Human-readable presentation of audit_log rows. The raw row is never altered;
// unknown actions fall back to a readable form of their code.

const ACTION_LABELS = Object.freeze({
  'owner.created': 'US Person created',
  'owner.password_reset': 'US Person password reset',
  'owner.status_changed': 'US Person status changed',
  'owner.archived': 'US Person archived',
  'owner.status_changed_auth_retry_needed': 'Status changed — sign-in update needs retry',
  'security.admin_access_denied': 'Admin access denied',
  'security.authorization_denied': 'Authorization denied',
  'security.admin_pinned': 'Admin identity pinned',
  'security.identity_sessions_revoked': 'Sessions revoked',
  'v2.agreement.changed': 'Agreement version saved',
  'v2.referral.replaced': 'Referral recorded',
  'v2.referral.ended': 'Referral ended',
  'v2.job.created': 'Job created',
  'v2.job.status_changed': 'Job status changed',
  'v2.job.terms_changed': 'Job pay terms changed',
  'v2.pay_schedule.generated': 'Pay dates scheduled',
  'v2.paycheck.received': 'Paycheck receipt recorded',
  'v2.paycheck.corrected': 'Paycheck receipt corrected',
  'v2.settlement.posted': 'Settlement month posted',
  'v2.settlement.adjusted': 'Settlement adjusted',
  'v2.settlement.receipt_reconciled': 'Receipt correction reconciled',
  'v2.partner.payment_recorded': 'Partner payment recorded',
  'v2.commission.accrued': 'Commission accrued',
  'v2.commission.payment_recorded': 'Commission payment recorded',
  'v2.transfer.registered': 'Transfer registered',
  'v2.transfer.evidence_verified': 'Transfer evidence verified',
});

export const AUDIT_CATEGORIES = Object.freeze([
  { value: 'people', label: 'US Persons & agreements' },
  { value: 'jobs', label: 'Jobs' },
  { value: 'pay', label: 'Paychecks & schedules' },
  { value: 'settlements', label: 'Settlements & partner payments' },
  { value: 'commissions', label: 'Commissions' },
  { value: 'transfers', label: 'Transfers' },
  { value: 'security', label: 'Security' },
  { value: 'other', label: 'Other' },
]);

function humanize(code) {
  const words = String(code || 'unknown').replace(/^v2\./, '').replace(/[._]+/g, ' ').trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function auditActionLabel(action) {
  return ACTION_LABELS[action] || humanize(action);
}

export function auditCategory(action = '') {
  if (action.startsWith('security.')) return 'security';
  if (action.startsWith('owner.') || action.startsWith('v2.agreement.') || action.startsWith('v2.referral.')) return 'people';
  if (action.startsWith('v2.job.')) return 'jobs';
  if (action.startsWith('v2.pay_schedule.') || action.startsWith('v2.paycheck.')) return 'pay';
  if (action.startsWith('v2.settlement.') || action.startsWith('v2.partner.')) return 'settlements';
  if (action.startsWith('v2.commission.')) return 'commissions';
  if (action.startsWith('v2.transfer.')) return 'transfers';
  return 'other';
}

export function auditTone(action = '') {
  if (action.startsWith('security.') || action.endsWith('retry_needed')) return 'danger';
  if (action.includes('corrected') || action.includes('adjusted') || action.endsWith('archived') ||
      action.endsWith('ended')) return 'warn';
  if (action.includes('payment') || action.includes('verified') || action.includes('received')) return 'ok';
  return 'info';
}

const ENTITY_LABELS = Object.freeze({
  owner: 'US Person', job: 'Job', job_paycheck: 'Paycheck', paycheck: 'Paycheck',
  referral: 'Referral', transfer: 'Transfer', settlement: 'Settlement', commission: 'Commission',
});

export function auditEntityLabel(entityType) {
  if (!entityType) return '—';
  return ENTITY_LABELS[entityType] || humanize(entityType);
}

const SUMMARY_KEYS = ['display_name', 'username', 'employer_name', 'employer', 'calendar_month', 'pay_date',
  'reference', 'from', 'to', 'status', 'partnership', 'count'];

/** A short, safe one-line description from scalar metadata values. */
export function auditSummary(entry) {
  const metadata = entry?.metadata_json && typeof entry.metadata_json === 'object' ? entry.metadata_json : {};
  const parts = [];
  if (metadata.from != null && metadata.to != null) parts.push(`${metadata.from} → ${metadata.to}`);
  for (const key of SUMMARY_KEYS) {
    if (key === 'from' || key === 'to') continue;
    const value = metadata[key];
    if (value == null || typeof value === 'object' || value === '') continue;
    parts.push(String(value));
    if (parts.length >= 3) break;
  }
  return parts.join(' · ');
}

export function auditMatches(entry, { query = '', category = '' } = {}) {
  if (category && auditCategory(entry.action) !== category) return false;
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  const haystack = [entry.action, auditActionLabel(entry.action), entry.entity_type, entry.entity_id,
    JSON.stringify(entry.metadata_json || {})].join(' ').toLowerCase();
  return haystack.includes(needle);
}
