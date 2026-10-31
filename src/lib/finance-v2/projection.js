import { getTaxConfig2026 } from '../calculations/taxConfig2026.js';
import { ownerTaxEstimate } from '../calculations/tax.js';
import {
  CALCULATION_VERSION, PACKAGE_V1, monthlyStatement, roundRatio,
  hourlyBiweeklyGrossCents, hourlyAnnualGrossCents,
} from './index.js';
import { taxReconciliation } from './tax-reconciliation.js';

function termsFor(job) {
  return job.terms || null;
}

function taxYearWagesForJob(job, taxYear) {
  if (job.annualGrossCents == null || !['active', 'ended'].includes(job.status)) return 0;
  if (job.status === 'ended' && !job.endDate) return 0;
  const yearStart = `${taxYear}-01-01`;
  const yearEnd = `${taxYear}-12-31`;
  const start = job.startDate && job.startDate > yearStart ? job.startDate : yearStart;
  const end = job.endDate && job.endDate < yearEnd ? job.endDate : yearEnd;
  if (end < start) return 0;
  const day = 86400000;
  const included = Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / day) + 1;
  const yearDays = Math.round((Date.parse(`${taxYear + 1}-01-01T00:00:00Z`) -
    Date.parse(`${yearStart}T00:00:00Z`)) / day);
  return roundRatio(job.annualGrossCents, included, yearDays);
}

export function jobProjection(job) {
  const terms = termsFor(job);
  if (!terms) return {
    id: job.id, employerName: job.employer_name, status: job.status,
    startDate: job.start_date || null, endDate: job.end_date || null,
    compensationMode: null, annualGrossCents: null, typicalBiweeklyGrossCents: null,
    needsTermsReview: true,
  };
  const annualGrossCents = terms.mode === 'hourly'
    ? hourlyAnnualGrossCents(Number(terms.hourly_rate_cents), Number(terms.expected_weekly_hours))
    : Number(terms.annual_salary_cents);
  const periodsPerYear = Number(terms.periods_per_year) || 26;
  const normalizedBiweeklyGrossCents = terms.mode === 'hourly'
    ? hourlyBiweeklyGrossCents(Number(terms.hourly_rate_cents), Number(terms.expected_weekly_hours))
    : roundRatio(annualGrossCents, 1, 26);
  const typicalEmployerPaycheckGrossCents = roundRatio(annualGrossCents, 1, periodsPerYear);
  return {
    id: job.id,
    employerName: job.employer_name,
    roleTitle: job.role_title || null,
    status: job.status,
    startDate: job.start_date || null,
    endDate: job.end_date || null,
    compensationMode: terms.mode,
    hourlyRateCents: terms.mode === 'hourly' ? Number(terms.hourly_rate_cents) : null,
    expectedWeeklyHours: terms.mode === 'hourly' ? Number(terms.expected_weekly_hours) : null,
    annualGrossCents,
    typicalBiweeklyGrossCents: normalizedBiweeklyGrossCents,
    normalizedBiweeklyGrossCents,
    typicalEmployerPaycheckGrossCents,
    payFrequency: terms.pay_frequency,
    periodsPerYear,
    firstPayDate: terms.first_pay_date || null,
    currentTermsEffectiveFrom: terms.effective_from || null,
    needsTermsReview: false,
  };
}

/** One person's steady-state annual projection; each job belongs to that person. */
export function projectPerson({ owner, jobs = [], apartment = null, paychecks = [], partnerSettlements = [], hasVerifiedReferral = false, agreementEffectiveFrom = null, taxYear = 2026, asOf = new Date().toISOString().slice(0, 10) }) {
  if (taxYear !== 2026) throw new RangeError('Tax year is not configured');
  if (jobs.some((job) => job.owner_id !== owner.id)) throw new RangeError('Cross-person job in projection');
  const myJobs = jobs.map(jobProjection);
  const activeJobs = myJobs.filter((job) => job.status === 'active');
  const incompleteTerms = activeJobs.some((job) => job.needsTermsReview);
  const annualGrossCents = activeJobs.reduce((sum, job) => sum + (job.annualGrossCents || 0), 0);
  // An annual estimate built from today's terms would rewrite earlier months
  // after a raise. Until a dated wage ledger covers every interval, suppress it.
  const annualTaxNeedsReview = jobs.some((job) => {
    const changedTerms = (job.termsHistory || [])
      .filter((term) => term.effective_from <= `${taxYear}-12-31` &&
        (!term.effective_to || term.effective_to >= `${taxYear}-01-01`)).length > 1;
    const history = job.statusHistory || [];
    const pausedDuringYear = history.some((event) =>
      event.status === 'paused' && event.effective_from >= `${taxYear}-01-01` &&
      event.effective_from <= `${taxYear}-12-31`);
    const statusAtYearStart = history.filter((event) =>
      event.effective_from <= `${taxYear}-01-01`)
      .sort((a, b) => a.effective_from.localeCompare(b.effective_from) ||
        Number(a.event_order || 0) - Number(b.event_order || 0)).at(-1)?.status;
    // A current pause may have older, unverified history; never turn received
    // wages into a zero annual liability just because the run rate is now zero.
    return changedTerms || pausedDuringYear || statusAtYearStart === 'paused' ||
      job.status === 'paused';
  });
  const taxYearWagesCents = annualTaxNeedsReview ? null :
    myJobs.reduce((sum, job) => sum + taxYearWagesForJob(job, taxYear), 0);
  const taxConfig = getTaxConfig2026(owner.filing_status);
  const taxEstimate = taxYearWagesCents == null ? null : ownerTaxEstimate({
    grossWagesCents: taxYearWagesCents,
    settings: taxConfig,
    otherIncomeAdjCents: Number(owner.other_income_adjustment_cents) || 0,
    deductionAdjustmentCents: Number(owner.deduction_adjustment_cents) || 0,
  });
  const runRateTaxEstimate = ownerTaxEstimate({
    grossWagesCents: annualGrossCents,
    settings: taxConfig,
    otherIncomeAdjCents: Number(owner.other_income_adjustment_cents) || 0,
    deductionAdjustmentCents: Number(owner.deduction_adjustment_cents) || 0,
  });
  const monthlyAfterTaxCents = roundRatio(annualGrossCents - runRateTaxEstimate.totalTaxCents, 1, 12);
  const stateSupported = owner.state === 'TX';
  // Planning uses Admin-entered inputs. Verification and payment evidence belong
  // to historical settlement, and must never gate an estimate.
  const projectionAvailable = Boolean(owner.status !== 'archived' &&
    ['DIRECT_2_WAY', 'MIKI_REFERRAL_2_WAY'].includes(owner.v2_partnership) &&
    !incompleteTerms && stateSupported);
  const packageVersion = {
    ...PACKAGE_V1,
    fixedActualCents: Number(apartment?.actual_monthly_cents ?? PACKAGE_V1.fixedActualCents),
    fixedQuotedCents: Number(apartment?.quoted_monthly_cents ?? PACKAGE_V1.fixedQuotedCents),
  };
  const statement = projectionAvailable ? monthlyStatement({
    afterTaxCents: monthlyAfterTaxCents,
    activeJobCount: activeJobs.length,
    partnership: owner.v2_partnership,
    packageVersion,
  }) : null;
  const myPaychecks = paychecks
    .filter((check) => jobs.some((job) => job.id === check.job_id))
    .map((check) => ({
      id: check.id,
      jobId: check.job_id,
      payDate: check.pay_date,
      periodStart: check.period_start || null,
      periodEnd: check.period_end || null,
      status: check.status,
      actualGrossCents: check.actual_gross_cents ?? null,
      actualNetReceivedCents: check.actual_net_received_cents ?? null,
      federalWithheldCents: check.federal_withheld_cents ?? null,
      socialSecurityWithheldCents: check.social_security_withheld_cents ?? null,
      medicareWithheldCents: check.medicare_withheld_cents ?? null,
      additionalMedicareWithheldCents: check.additional_medicare_withheld_cents ?? null,
      stateWithheldCents: check.state_withheld_cents ?? null,
      otherDeductionsCents: check.other_deductions_cents ?? null,
      corrected: check.corrected === true,
    }));
  const nextPayDate = myPaychecks
    .filter((check) => check.payDate >= asOf && check.status === 'scheduled')
    .sort((a, b) => a.payDate.localeCompare(b.payDate))[0]?.payDate || null;
  const reconciliation = taxReconciliation({
    projectedLiabilityCents: taxEstimate?.totalTaxCents ?? null,
    socialSecurityAnnualCapCents: roundRatio(taxConfig.social_security_wage_base_cents, 62, 1000),
    paychecks: myPaychecks.filter((check) => check.status === 'paid' &&
      check.payDate >= `${taxYear}-01-01` && check.payDate <= `${taxYear}-12-31`).map((check) => ({
      federalWithheldCents: check.federalWithheldCents,
      socialSecurityWithheldCents: check.socialSecurityWithheldCents,
      medicareWithheldCents: check.medicareWithheldCents,
      additionalMedicareWithheldCents: check.additionalMedicareWithheldCents,
      stateWithheldCents: check.stateWithheldCents,
      actualNetReceivedCents: check.actualNetReceivedCents,
    })),
  });
  return { owner, apartment, agreementEffectiveFrom, myJobs, myPaychecks, activeJobCount: activeJobs.length, annualGrossCents,
    taxYearWagesCents, taxEstimate, annualTaxNeedsReview, runRateTaxEstimate, monthlyAfterTaxCents, statement, nextPayDate, reconciliation,
    partnerSettlements, projectionAvailable, incompleteTerms, stateSupported, taxYear, asOf };
}

/** Explicit allowlist. Never spread an owner, job, or internal statement into it. */
export function ownerStatementDto(projected) {
  const s = projected.statement;
  return {
    calculationVersion: CALCULATION_VERSION,
    taxYear: projected.taxYear,
    taxConfigVersion: projected.taxEstimate?.taxConfigVersion || projected.runRateTaxEstimate.taxConfigVersion,
    asOf: projected.asOf,
    displayName: projected.owner.display_name,
    projectionAvailable: projected.projectionAvailable,
    reviewNeeded: !projected.projectionAvailable,
    activeJobCount: projected.activeJobCount,
    myJobs: projected.myJobs,
    myPaychecks: projected.myPaychecks,
    partnerSettlements: projected.partnerSettlements.map((row) => ({
      paycheckId: row.paycheckId, payDate: row.payDate,
      partnerDueOriginalCents: row.partnerDueOriginalCents,
      partnerDueChangesCents: row.partnerDueChangesCents,
      partnerDueCents: row.partnerDueCents, paidCents: row.paidCents,
      unverifiedPaidCents: row.unverifiedPaidCents || 0,
      owedCents: row.owedCents, overpaidCents: row.overpaidCents || 0,
      lastPaidAt: row.lastPaidAt || null,
      needsAdjustment: row.needsAdjustment === true,
    })),
    nextPayDate: projected.nextPayDate,
    annualGrossEstimateCents: projected.annualGrossCents,
    monthlyGrossEstimateCents: roundRatio(projected.annualGrossCents, 1, 12),
    monthlyTaxEstimateCents: projected.stateSupported
      ? roundRatio(projected.annualGrossCents, 1, 12) - projected.monthlyAfterTaxCents : null,
    runRateAnnualTaxEstimateCents: projected.stateSupported ? projected.runRateTaxEstimate.totalTaxCents : null,
    stateSupported: projected.stateSupported,
    partnershipConfigured: ['DIRECT_2_WAY', 'MIKI_REFERRAL_2_WAY'].includes(projected.owner.v2_partnership),
    taxYearProjectedWagesCents: projected.taxYearWagesCents,
    annualTaxLiabilityEstimateCents: projected.stateSupported ? projected.taxEstimate?.totalTaxCents ?? null : null,
    annualTaxNeedsReview: projected.annualTaxNeedsReview,
    monthlyAfterTaxEquivalentCents: projected.stateSupported ? projected.monthlyAfterTaxCents : null,
    agreedChargesMonthlyCents: s?.quotedCostCents ?? null,
    quotedNetMonthlyCents: s?.quotedNetCents ?? null,
    contractualShareRate: 0.5,
    myShareMonthlyCents: s?.personShareCents ?? null,
    myShareBiweeklyEquivalentCents: s ? roundRatio(s.personShareCents, 12, 26) : null,
    requiresPayoutDecision: s?.needsPayoutPolicy ?? false,
    taxReconciliation: projected.stateSupported ? projected.reconciliation : null,
    estimateLimitations: projected.stateSupported
      ? '2026 Texas planning estimates: monthly share uses current full-year run rate. Annual liability is unavailable after a pay-term change or job pause until dated wages are reviewed. Actual hours, withholding, credits and other income may differ.'
      : 'State tax assumptions are not configured for this US Person; no partner share is projected.',
  };
}

export function adminStatementDto(projected) {
  const s = projected.statement;
  return {
    ...ownerStatementDto(projected),
    ownerId: projected.owner.id,
    personStatus: projected.owner.status,
    partnership: projected.owner.v2_partnership,
    agreementVerifiedAt: projected.owner.agreement_verified_at,
    currentAgreementEffectiveFrom: projected.agreementEffectiveFrom,
    apartmentActualMonthlyCents: projected.apartment?.actual_monthly_cents ?? PACKAGE_V1.fixedActualCents,
    apartmentQuotedMonthlyCents: projected.apartment?.quoted_monthly_cents ?? PACKAGE_V1.fixedQuotedCents,
    actualCostMonthlyCents: s?.actualCostCents ?? null,
    personShareMonthlyCents: s?.personShareCents ?? null,
    commissionMonthlyCents: s?.commissionCents ?? null,
    gangCutMonthlyCents: s?.gangCutCents ?? null,
    yeromeTakeHomeMonthlyCents: s?.yeromeTakeHomeCents ?? null,
  };
}
