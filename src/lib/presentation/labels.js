// User-facing vocabulary for statuses and settings. Internal API/database names
// (owner, DIRECT_2_WAY, paid) stay unchanged; only what people read lives here.

export const PARTNERSHIP_LABELS = Object.freeze({
  DIRECT_2_WAY: 'Direct · 50/50',
  MIKI_REFERRAL_2_WAY: 'Referred · 50/50 + referral commission',
});

export const PARTNERSHIP_OPTIONS = Object.freeze([
  { value: 'DIRECT_2_WAY', label: 'Direct · 50/50',
    description: 'Contractual share is 50% of quoted net after agreed charges.' },
  { value: 'MIKI_REFERRAL_2_WAY', label: 'Referred · 50/50 + separate commission',
    description: 'Same 50/50 share. The referrer earns a separate $200 per eligible active job each full month.' },
]);

export const FILING_STATUS_OPTIONS = Object.freeze([
  { value: 'single', label: 'Single' },
  { value: 'mfj', label: 'Married filing jointly' },
  { value: 'mfs', label: 'Married filing separately' },
  { value: 'hoh', label: 'Head of household' },
]);

export const PAY_FREQUENCY_LABELS = Object.freeze({
  weekly: 'Weekly',
  biweekly: 'Every two weeks',
  semimonthly: 'Twice monthly',
  monthly: 'Monthly',
});

export const PERIODS_BY_FREQUENCY = Object.freeze({ weekly: '52', biweekly: '26', monthly: '12' });

export const COMPENSATION_LABELS = Object.freeze({ hourly: 'Hourly', salary: 'Annual salary' });

export const PERSON_STATUS = Object.freeze({
  active: { label: 'Active', tone: 'ok' },
  inactive: { label: 'Access paused', tone: 'warn' },
  archived: { label: 'Archived', tone: 'muted' },
});

export const JOB_STATUS = Object.freeze({
  pending: { label: 'Pending', tone: 'info' },
  active: { label: 'Active', tone: 'ok' },
  paused: { label: 'Paused', tone: 'warn' },
  ended: { label: 'Ended', tone: 'muted' },
  archived: { label: 'Archived', tone: 'muted' },
});

export const PAYCHECK_STATUS = Object.freeze({
  scheduled: { label: 'Scheduled', tone: 'info' },
  awaiting: { label: 'Awaiting receipt', tone: 'warn' },
  paid: { label: 'Receipt recorded', tone: 'ok' },
  skipped: { label: 'Skipped', tone: 'muted' },
});

export const OWNER_PAYCHECK_STATUS = Object.freeze({
  scheduled: { label: 'Upcoming', tone: 'info' },
  awaiting: { label: 'Paystub not yet recorded', tone: 'warn' },
  paid: { label: 'Recorded', tone: 'ok' },
  skipped: { label: 'Skipped', tone: 'muted' },
});

export const TRANSFER_STATUS = Object.freeze({
  verified: { label: 'Evidence verified', tone: 'ok' },
  registered: { label: 'Awaiting evidence review', tone: 'warn' },
  historical_review_required: { label: 'Historical review required', tone: 'danger' },
});

export function statusMeta(map, key) {
  return map[key] || { label: key ? String(key).replace(/_/g, ' ') : 'Unknown', tone: 'muted' };
}
