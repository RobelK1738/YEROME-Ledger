// Form state ⇄ API payload mapping for Admin forms. Payload shapes are the
// existing API contracts; keep them byte-for-byte compatible with the server.

import { dollarsToCents } from '../finance-v2/index.js';
import { RECEIPT_FIELDS } from '../finance-v2/receipt.js';
import { addDaysISO } from './format.js';

const dollarsInput = (cents) => String((Number(cents) || 0) / 100);
const optionalDollars = (cents) => (cents == null ? '' : String(cents / 100));
const laterOf = (date, today) => (date && date > today ? date : today);

// ------------------------------- US Person -------------------------------

export function emptyPersonForm() {
  return { displayName: '', username: '', password: '', filingStatus: 'single',
    partnership: 'DIRECT_2_WAY' };
}

// ---------------------------------- Jobs ----------------------------------

export function emptyJobForm(today, ownerId = '') {
  return { ownerId, employerName: '', roleTitle: '', mode: 'hourly', hourlyRate: '',
    expectedWeeklyHours: '40', annualSalary: '', payFrequency: 'biweekly', periodsPerYear: '26',
    firstPayDate: '', startDate: today, effectiveFrom: today };
}

/** Prefill a pay-terms change; the new terms start the day after the latest version. */
export function jobFormFromExisting(job, today) {
  const latest = job.latestTerms;
  return {
    jobId: job.id, ownerId: job.ownerId, employerName: job.employerName,
    roleTitle: job.roleTitle || '', mode: latest?.mode || job.compensationMode || 'hourly',
    hourlyRate: dollarsInput(latest ? latest.hourlyRateCents : job.hourlyRateCents),
    expectedWeeklyHours: String((latest ? latest.expectedWeeklyHours : job.expectedWeeklyHours) ?? 40),
    annualSalary: dollarsInput(latest ? latest.annualSalaryCents : job.annualGrossCents),
    payFrequency: latest?.payFrequency || job.payFrequency || 'biweekly',
    periodsPerYear: String(latest?.periodsPerYear || job.periodsPerYear || 26),
    firstPayDate: latest?.firstPayDate || job.firstPayDate || '', startDate: '',
    effectiveFrom: laterOf(minimumJobTermsDate(job, today), addDaysISO(today, 1)),
  };
}

export function minimumJobTermsDate(job, today) {
  const latestDate = job.latestTerms?.effectiveFrom || job.currentTermsEffectiveFrom;
  return laterOf(latestDate ? addDaysISO(latestDate, 1) : null, today);
}

export function jobPayload(job) {
  return {
    ...(job.jobId ? { jobId: job.jobId, action: 'change_terms' } : {}),
    ownerId: job.ownerId, employerName: job.employerName, roleTitle: job.roleTitle,
    mode: job.mode, hourlyRateCents: job.mode === 'hourly' ? dollarsToCents(job.hourlyRate) : null,
    expectedWeeklyHours: job.mode === 'hourly' ? Number(job.expectedWeeklyHours) : null,
    annualSalaryCents: job.mode === 'salary' ? dollarsToCents(job.annualSalary) : null,
    payFrequency: job.payFrequency, periodsPerYear: Number(job.periodsPerYear),
    firstPayDate: job.firstPayDate || null, startDate: job.startDate || null,
    effectiveFrom: job.effectiveFrom, status: 'active',
  };
}

export function jobStatusPayload(jobId, action, today) {
  return action === 'end'
    ? { jobId, action: 'end', endDate: today }
    : { jobId, action, effectiveFrom: today };
}

// ------------------------------- Agreement --------------------------------

export function agreementFormFor(person, today) {
  return {
    ownerId: person?.ownerId || '',
    partnership: person?.partnership || 'DIRECT_2_WAY',
    agreementReference: '',
    agreementVerified: Boolean(person?.agreementVerifiedAt),
    actualMonthly: dollarsInput(person?.apartmentActualMonthlyCents || 65000),
    quotedMonthly: dollarsInput(person?.apartmentQuotedMonthlyCents || 90000),
    effectiveFrom: addDaysISO(laterOf(person?.currentAgreementEffectiveFrom, today), 1),
  };
}

export function agreementPayload(agreement) {
  return {
    ownerId: agreement.ownerId, partnership: agreement.partnership,
    agreementReference: agreement.agreementReference, agreementVerified: agreement.agreementVerified,
    actualMonthlyCents: dollarsToCents(agreement.actualMonthly),
    quotedMonthlyCents: dollarsToCents(agreement.quotedMonthly), effectiveFrom: agreement.effectiveFrom,
  };
}

// ------------------------------- Referrals --------------------------------

export function emptyReferralForm(today) {
  return { replaceReferralId: '', referrerOwnerId: '', referredOwnerId: '', startDate: today,
    nameVisibleToReferrer: false };
}

// -------------------------------- Receipts --------------------------------

export const RECEIPT_LINES = Object.freeze([
  { key: 'federal', field: 'federalWithheldCents', label: 'Federal income tax withheld' },
  { key: 'ss', field: 'socialSecurityWithheldCents', label: 'Social Security withheld' },
  { key: 'medicare', field: 'medicareWithheldCents', label: 'Medicare withheld' },
  { key: 'additionalMedicare', field: 'additionalMedicareWithheldCents', label: 'Additional Medicare withheld' },
  { key: 'state', field: 'stateWithheldCents', label: 'State income tax withheld' },
  { key: 'other', field: 'otherDeductionsCents', label: 'Other paycheck deductions' },
]);

export const emptyReceipt = Object.freeze({ actualGross: '', actualNet: '', actualHours: '', federal: '', ss: '',
  medicare: '', additionalMedicare: '', state: '', other: '0', reason: '' });

export function receiptFormFromCheck(check) {
  return {
    actualGross: optionalDollars(check.actualGrossCents), actualNet: optionalDollars(check.actualNetReceivedCents),
    actualHours: '', federal: optionalDollars(check.federalWithheldCents),
    ss: optionalDollars(check.socialSecurityWithheldCents), medicare: optionalDollars(check.medicareWithheldCents),
    additionalMedicare: optionalDollars(check.additionalMedicareWithheldCents),
    state: optionalDollars(check.stateWithheldCents), other: optionalDollars(check.otherDeductionsCents) || '0',
    reason: '',
  };
}

export function receiptPayload(check, receipt) {
  const optional = (value) => (value === '' ? null : dollarsToCents(value));
  return {
    paycheckId: check.id, action: check.status === 'paid' ? 'correct' : 'receive', reason: receipt.reason,
    actualGrossCents: dollarsToCents(receipt.actualGross),
    actualNetReceivedCents: dollarsToCents(receipt.actualNet),
    actualHours: receipt.actualHours === '' ? null : Number(receipt.actualHours),
    federalWithheldCents: optional(receipt.federal),
    socialSecurityWithheldCents: optional(receipt.ss),
    medicareWithheldCents: optional(receipt.medicare),
    additionalMedicareWithheldCents: optional(receipt.additionalMedicare),
    stateWithheldCents: optional(receipt.state),
    otherDeductionsCents: optional(receipt.other),
  };
}

function centsOrNull(value) {
  if (value === '' || value == null) return null;
  try { return dollarsToCents(value); } catch { return null; }
}

/**
 * Live check of the server rule: gross = net + every withholding line + other.
 * Display-only guidance; the server remains the authority.
 */
export function receiptBalance(receipt) {
  const grossCents = centsOrNull(receipt.actualGross);
  const parts = [centsOrNull(receipt.actualNet), ...RECEIPT_LINES.map((line) => centsOrNull(receipt[line.key]))];
  const complete = grossCents != null && parts.every((value) => value != null);
  const accountedCents = parts.reduce((sum, value) => sum + (value || 0), 0);
  return { grossCents, accountedCents, differenceCents: grossCents == null ? null : grossCents - accountedCents,
    complete, balanced: complete && grossCents === accountedCents, fieldCount: RECEIPT_FIELDS.length };
}

// ------------------------------- Payments ---------------------------------

export function paymentKey(kind, obligationId, reference) {
  return `${kind}:${obligationId}:${reference.trim().toLowerCase()}`;
}
