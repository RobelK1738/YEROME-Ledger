// Read-only views derived from the Admin overview response. These only regroup
// and count API values; no financial amount is recalculated here.

import { addDaysISO, money, todayISO } from './format.js';

export function currentPeople(people = []) {
  return people.filter((person) => person.personStatus !== 'archived');
}

export function findPerson(people = [], ownerId) {
  return people.find((person) => person.ownerId === ownerId) || null;
}

export function flattenJobs(people = []) {
  return people.flatMap((person) => (person.myJobs || []).map((job) => ({
    ...job,
    ownerId: person.ownerId,
    personName: person.displayName,
    personStatus: person.personStatus,
  })));
}

export function flattenPaychecks(people = []) {
  return people.flatMap((person) => (person.myPaychecks || []).map((check) => {
    const job = (person.myJobs || []).find((item) => item.id === check.jobId);
    return {
      ...check,
      ownerId: person.ownerId,
      personName: person.displayName,
      personStatus: person.personStatus,
      employerName: job?.employerName || 'Job',
      roleTitle: job?.roleTitle || null,
    };
  })).sort((a, b) => b.payDate.localeCompare(a.payDate));
}

/** A scheduled paycheck whose date has passed and has no recorded receipt yet. */
export function isAwaitingReceipt(check, today = todayISO()) {
  return check.status === 'scheduled' && check.payDate < today;
}

export function paycheckDisplayStatus(check, today = todayISO()) {
  return isAwaitingReceipt(check, today) ? 'awaiting' : check.status;
}

export function hasCurrentReferral(ownerId, referrals = []) {
  return referrals.some((row) => row.referredOwnerId === ownerId && row.relationshipCurrent && !row.needsContractReview);
}

/** Why a person's estimate is withheld, in plain language. Empty when estimated. */
export function reviewReasons(person) {
  if (!person || person.projectionAvailable || person.personStatus === 'archived') return [];
  const reasons = [];
  if (!person.partnership) reasons.push({ key: 'partnership', label: 'Choose a partnership model' });
  if (person.stateSupported === false) reasons.push({ key: 'state', label: 'State tax assumptions are not configured' });
  if ((person.myJobs || []).some((job) => job.status === 'active' && job.missingPayDetails))
    reasons.push({ key: 'terms', label: 'An active job is missing pay details' });
  if (!reasons.length) reasons.push({ key: 'inputs', label: 'Complete the projection inputs' });
  return reasons;
}

export function overviewMetrics(overview, referrals = [], today = todayISO()) {
  const people = currentPeople(overview?.people || []);
  const checks = flattenPaychecks(people);
  const horizon = addDaysISO(today, 14);
  const lookback = addDaysISO(today, -30);
  const recent = checks.filter((check) => check.status === 'paid' && check.payDate >= lookback && check.payDate <= today);
  return {
    totalProfiles: people.length,
    activeProfiles: people.filter((person) => person.personStatus === 'active').length,
    pausedProfiles: people.filter((person) => person.personStatus === 'inactive').length,
    peopleWithActiveJobs: people.filter((person) => person.activeJobCount > 0).length,
    activeJobs: people.reduce((sum, person) => sum + (person.activeJobCount || 0), 0),
    totalJobs: people.reduce((sum, person) => sum + (person.myJobs || []).length, 0),
    estimatedPeople: people.filter((person) => person.projectionAvailable).length,
    yeromeMonthlyEstimateCents: overview?.totalMonthlyProfitCents ?? null,
    reviewQueue: people
      .map((person) => ({ person, reasons: reviewReasons(person, referrals) }))
      .filter((item) => item.reasons.length),
    upcoming: checks
      .filter((check) => check.status === 'scheduled' && check.payDate >= today && check.payDate <= horizon)
      .sort((a, b) => a.payDate.localeCompare(b.payDate)),
    awaitingReceipt: checks
      .filter((check) => isAwaitingReceipt(check, today))
      .sort((a, b) => a.payDate.localeCompare(b.payDate)),
    scheduledCount: checks.filter((check) => check.status === 'scheduled').length,
    recordedLast30: {
      count: recent.length,
      netCents: recent.reduce((sum, check) => sum + (check.actualNetReceivedCents || 0), 0),
    },
    partnerPaymentsRecordedCents: people.reduce((sum, person) =>
      sum + (person.partnerSettlements || []).reduce((inner, row) => inner + (row.paidCents || 0), 0), 0),
  };
}

/** Use already-submitted details when a future job has not started yet. */
export function payDetailsFor(job) {
  return !job.compensationMode && job.savedPayDetails
    ? { ...job, ...job.savedPayDetails, status: job.status } : job;
}

/** "$25.00/hr · 40 h/wk" or "$80,000.00/yr" from saved inputs. */
export function payTermsText(job) {
  const details = payDetailsFor(job);
  if (!details.compensationMode) return null;
  return details.compensationMode === 'hourly'
    ? `${money(details.hourlyRateCents)}/hr · ${details.expectedWeeklyHours} h/wk`
    : `${money(details.annualGrossCents)}/yr`;
}
