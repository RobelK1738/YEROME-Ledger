import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateUsername } from '../server/_lib/supabaseAdmin.js';
import { normalizeUsername, usernameError } from '../src/lib/presentation/username.js';
import { agreementFormFor, agreementPayload, emptyJobForm, jobFormFromExisting, jobPayload,
  jobStatusPayload, receiptBalance, receiptFormFromCheck, receiptPayload } from '../src/lib/presentation/forms.js';
import { overviewMetrics, reviewReasons, paycheckDisplayStatus } from '../src/lib/presentation/people.js';
import { auditActionLabel, auditCategory, auditMatches, auditSummary } from '../src/lib/presentation/audit.js';
import { formatMonth, money, relativeDays } from '../src/lib/presentation/format.js';

test('username guidance accepts exactly what the server accepts', () => {
  const samples = ['michael_abate', 'Michael_Abate', '  abc  ', 'ab', 'a'.repeat(40), 'a'.repeat(41),
    'michael@example.com', 'michael abate', 'michael.abate', 'michael-abate', 'ünïcode', '', '123', '___'];
  for (const sample of samples) {
    const clientOk = usernameError(sample) === null;
    const serverOk = validateUsername(normalizeUsername(sample)) === null;
    assert.equal(clientOk, serverOk, `mismatch for ${JSON.stringify(sample)}`);
  }
  assert.match(usernameError('michael@example.com'), /not an email/);
  assert.match(usernameError('michael abate'), /Spaces/);
});

test('job payload switches cleanly between hourly and salary terms', () => {
  const base = { ...emptyJobForm('2026-10-22', 'owner-1'), employerName: 'Acme', hourlyRate: '25.50',
    annualSalary: '80000', firstPayDate: '2026-10-30' };
  const hourly = jobPayload(base);
  assert.equal(hourly.hourlyRateCents, 2550);
  assert.equal(hourly.expectedWeeklyHours, 40);
  assert.equal(hourly.annualSalaryCents, null);
  assert.equal(hourly.action, undefined);
  const salary = jobPayload({ ...base, mode: 'salary' });
  assert.equal(salary.hourlyRateCents, null);
  assert.equal(salary.expectedWeeklyHours, null);
  assert.equal(salary.annualSalaryCents, 8_000_000);
  assert.deepEqual(Object.keys(salary).sort(), ['annualSalaryCents', 'effectiveFrom', 'employerName',
    'expectedWeeklyHours', 'firstPayDate', 'hourlyRateCents', 'mode', 'ownerId', 'payFrequency',
    'periodsPerYear', 'roleTitle', 'startDate', 'status'].sort());
});

test('changing terms starts the day after the later of today and current terms', () => {
  const job = { id: 'job-1', ownerId: 'owner-1', employerName: 'Acme', compensationMode: 'salary',
    annualGrossCents: 6_000_000, payFrequency: 'monthly', periodsPerYear: 12, firstPayDate: '2026-01-31',
    currentTermsEffectiveFrom: '2026-11-01' };
  const form = jobFormFromExisting(job, '2026-10-22');
  assert.equal(form.effectiveFrom, '2026-11-02');
  assert.equal(form.startDate, '');
  const payload = jobPayload(form);
  assert.equal(payload.action, 'change_terms');
  assert.equal(payload.jobId, 'job-1');
  assert.equal(payload.startDate, null);
  assert.deepEqual(jobStatusPayload('job-1', 'end', '2026-10-22'), { jobId: 'job-1', action: 'end', endDate: '2026-10-22' });
  assert.deepEqual(jobStatusPayload('job-1', 'pause', '2026-10-22'), { jobId: 'job-1', action: 'pause', effectiveFrom: '2026-10-22' });
});

test('agreement prefill and payload keep apartment defaults and prospective dates', () => {
  const form = agreementFormFor({ ownerId: 'o', partnership: 'DIRECT_2_WAY', agreementVerifiedAt: null,
    apartmentActualMonthlyCents: null, apartmentQuotedMonthlyCents: null, currentAgreementEffectiveFrom: '2026-01-01' }, '2026-10-22');
  assert.equal(form.actualMonthly, '650');
  assert.equal(form.quotedMonthly, '900');
  assert.equal(form.effectiveFrom, '2026-10-23');
  assert.deepEqual(agreementPayload(form), { ownerId: 'o', partnership: 'DIRECT_2_WAY', agreementReference: '',
    agreementVerified: false, actualMonthlyCents: 65000, quotedMonthlyCents: 90000, effectiveFrom: '2026-10-23' });
});

test('receipt balance mirrors the server gross = net + deductions rule', () => {
  const receipt = { actualGross: '1000', actualNet: '760', actualHours: '', federal: '100', ss: '62',
    medicare: '14.50', additionalMedicare: '0', state: '0', other: '63.50', reason: '' };
  assert.deepEqual({ ...receiptBalance(receipt), fieldCount: undefined },
    { grossCents: 100000, accountedCents: 100000, differenceCents: 0, complete: true, balanced: true, fieldCount: undefined });
  assert.equal(receiptBalance({ ...receipt, other: '' }).complete, false);
  assert.equal(receiptBalance({ ...receipt, net: '700', actualNet: '700' }).differenceCents, 6000);
  const payload = receiptPayload({ id: 'p', status: 'scheduled' }, receipt);
  assert.equal(payload.action, 'receive');
  assert.equal(payload.medicareWithheldCents, 1450);
  assert.equal(payload.actualHours, null);
  assert.equal(receiptPayload({ id: 'p', status: 'paid' }, receipt).action, 'correct');
  assert.equal(receiptFormFromCheck({ actualGrossCents: null, otherDeductionsCents: null }).other, '0');
});

test('overview separates active profiles from people with active jobs', () => {
  const person = (overrides) => ({ ownerId: overrides.ownerId, displayName: overrides.ownerId, personStatus: 'active',
    activeJobCount: 0, projectionAvailable: false, agreementVerifiedAt: null, partnership: 'DIRECT_2_WAY',
    apartmentQuotedMonthlyCents: 90000, myJobs: [], myPaychecks: [], partnerSettlements: [], ...overrides });
  const overview = { totalMonthlyProfitCents: 12345, people: [
    person({ ownerId: 'a', activeJobCount: 2, projectionAvailable: true, agreementVerifiedAt: '2026-01-01',
      myJobs: [{ id: 'j1', status: 'active' }],
      myPaychecks: [
        { id: 'c1', jobId: 'j1', payDate: '2026-10-20', status: 'scheduled' },
        { id: 'c2', jobId: 'j1', payDate: '2026-10-30', status: 'scheduled' },
        { id: 'c3', jobId: 'j1', payDate: '2026-10-10', status: 'paid', actualNetReceivedCents: 50000 },
      ],
      partnerSettlements: [{ paidCents: 700 }] }),
    person({ ownerId: 'b' }),
    person({ ownerId: 'c', personStatus: 'inactive' }),
    person({ ownerId: 'd', personStatus: 'archived', activeJobCount: 5 }),
  ] };
  const metrics = overviewMetrics(overview, [], '2026-10-22');
  assert.equal(metrics.totalProfiles, 3);
  assert.equal(metrics.activeProfiles, 2);
  assert.equal(metrics.peopleWithActiveJobs, 1);
  assert.equal(metrics.activeJobs, 2);
  assert.equal(metrics.reviewQueue.length, 2);
  assert.deepEqual(metrics.upcoming.map((c) => c.id), ['c2']);
  assert.deepEqual(metrics.awaitingReceipt.map((c) => c.id), ['c1']);
  assert.deepEqual(metrics.recordedLast30, { count: 1, netCents: 50000 });
  assert.equal(metrics.partnerPaymentsRecordedCents, 700);
  assert.equal(paycheckDisplayStatus({ status: 'scheduled', payDate: '2026-10-20' }, '2026-10-22'), 'awaiting');
});

test('review reasons explain why an estimate is withheld', () => {
  const reasons = reviewReasons({ ownerId: 'x', personStatus: 'active', projectionAvailable: false,
    agreementVerifiedAt: null, partnership: 'MIKI_REFERRAL_2_WAY', apartmentQuotedMonthlyCents: 90000,
    myJobs: [{ status: 'active', needsTermsReview: true }] }, []);
  assert.deepEqual(reasons.map((r) => r.key), ['agreement', 'referral', 'terms']);
  assert.deepEqual(reviewReasons({ projectionAvailable: true }), []);
});

test('audit rows get readable labels, categories and searchable summaries', () => {
  assert.equal(auditActionLabel('v2.paycheck.received'), 'Paycheck receipt recorded');
  assert.equal(auditActionLabel('v2.some_new.thing'), 'Some new thing');
  assert.equal(auditCategory('owner.created'), 'people');
  assert.equal(auditCategory('v2.transfer.registered'), 'transfers');
  const entry = { action: 'owner.status_changed', entity_type: 'owner',
    metadata_json: { from: 'active', to: 'inactive', login_disabled: true } };
  assert.equal(auditSummary(entry), 'active → inactive');
  assert.equal(auditMatches(entry, { query: 'inactive' }), true);
  assert.equal(auditMatches(entry, { category: 'jobs' }), false);
});

test('formatting helpers handle missing values', () => {
  assert.equal(money(null), '—');
  assert.equal(money(123456), '$1,234.56');
  assert.equal(formatMonth('2026-09-01'), 'September 2026');
  assert.equal(relativeDays('2026-10-25', '2026-10-22'), 'in 3 days');
});
