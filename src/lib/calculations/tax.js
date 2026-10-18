// Pure federal/state tax estimation functions. All monetary inputs/outputs are
// INTEGER CENTS. Rates are decimals. These functions are deterministic and are
// covered by test/tax-v2.test.js.
//
// CRITICAL BUSINESS RULE (PRD 3.3 / 8 / 14.1):
// Taxes are computed on an Owner's COMBINED projected wages across all active
// jobs, THEN allocated to jobs for reporting. Never tax each job independently.

import { roundCents } from '../formatting/money.js';
import { ACTIVE_JOB_STATUSES } from '../constants.js';
import { roundRatio } from '../finance-v2/index.js';

function rateUnits(rate) {
  const value = Number(rate);
  if (!Number.isFinite(value) || value < 0 || value > 1) throw new RangeError('Invalid tax rate');
  return Math.round(value * 100000);
}

/** Normalize a settings object so brackets are always an array of {rate,min,max}. */
export function normalizeSettings(settings) {
  if (!settings) return null;
  const brackets = settings.federal_brackets || settings.federal_brackets_json || [];
  return { ...settings, federal_brackets: brackets };
}

/**
 * Projected combined taxable wages for an Owner (cents).
 * Uses the job's projected_tax_year_wages_cents override when present, otherwise
 * annual_salary_cents. Only ACTIVE jobs contribute to projections.
 */
export function projectedOwnerWages(jobs = []) {
  return jobs
    .filter((j) => ACTIVE_JOB_STATUSES.includes(j.status))
    .reduce((sum, j) => {
      const wage =
        j.projected_tax_year_wages_cents != null && j.projected_tax_year_wages_cents !== ''
          ? Number(j.projected_tax_year_wages_cents)
          : Number(j.annual_salary_cents) || 0;
      return sum + (Number.isFinite(wage) ? wage : 0);
    }, 0);
}

/**
 * Estimated taxable income (cents), never below zero. The standard deduction
 * applies to federal income tax, but never reduces Social Security/Medicare wages.
 */
export function taxableIncome(grossCents, settings, otherIncomeAdjCents = 0, deductionAdjustmentCents = 0) {
  const gross = Number(grossCents) || 0;
  const other = Number(otherIncomeAdjCents) || 0;
  const standardDeduction = Number(settings?.standard_deduction_cents) || 0;
  const additionalDeduction = Number(deductionAdjustmentCents) || 0;
  return Math.max(0, gross + other - standardDeduction - additionalDeduction);
}

/**
 * Progressive federal income tax (cents) for a taxable-income amount.
 * Applies each marginal bracket rate only to the slice of income within it.
 */
export function federalIncomeTax(taxableCents, settings) {
  const taxable = Math.max(0, Number(taxableCents) || 0);
  const brackets = normalizeSettings(settings)?.federal_brackets || [];
  let taxUnits = 0n;
  for (const bracket of brackets) {
    const min = Number(bracket.min) || 0;
    const max = bracket.max == null ? Infinity : Number(bracket.max);
    if (taxable <= min) break;
    const slice = Math.min(taxable, max) - min;
    if (slice > 0) taxUnits += BigInt(slice) * BigInt(rateUnits(bracket.rate));
  }
  return Number((taxUnits * 2n + 100000n) / 200000n);
}

/** Employee Social Security (cents): min(wages, wage base) * rate. */
export function socialSecurity(wagesCents, settings) {
  const wages = Math.max(0, Number(wagesCents) || 0);
  const base = Number(settings?.social_security_wage_base_cents) || 0;
  const rate = Number(settings?.social_security_rate) || 0;
  return roundRatio(Math.min(wages, base), rateUnits(rate), 100000);
}

/** Base Medicare (cents): wages * rate. No ordinary wage cap. */
export function medicare(wagesCents, settings) {
  const wages = Math.max(0, Number(wagesCents) || 0);
  const rate = Number(settings?.medicare_rate) || 0;
  return roundRatio(wages, rateUnits(rate), 100000);
}

/** Additional Medicare Tax (cents): max(0, wages - threshold) * rate. */
export function additionalMedicare(wagesCents, settings) {
  const wages = Math.max(0, Number(wagesCents) || 0);
  const threshold = Number(settings?.additional_medicare_threshold_cents) || 0;
  const rate = Number(settings?.additional_medicare_rate) || 0;
  return roundRatio(Math.max(0, wages - threshold), rateUnits(rate), 100000);
}

/** State income tax (cents). Texas defaults to 0. */
export function stateTax(taxableOrWagesCents, settings) {
  const amount = Math.max(0, Number(taxableOrWagesCents) || 0);
  const rate = Number(settings?.state_income_tax_rate) || 0;
  return roundRatio(amount, rateUnits(rate), 100000);
}

/**
 * Compute the full Owner-level tax estimate from combined wages.
 * Returns every component plus totals (all cents) and the effective rate.
 */
export function ownerTaxEstimate({
  grossWagesCents,
  settings,
  otherIncomeAdjCents = 0,
  deductionAdjustmentCents = 0,
}) {
  const norm = normalizeSettings(settings);
  const gross = Math.max(0, Number(grossWagesCents) || 0);
  const taxable = taxableIncome(gross, norm, otherIncomeAdjCents, deductionAdjustmentCents);

  const federal = federalIncomeTax(taxable, norm);
  const ss = socialSecurity(gross, norm);
  const med = medicare(gross, norm);
  const addlMed = additionalMedicare(gross, norm);
  const state = stateTax(taxable, norm);

  const total = federal + ss + med + addlMed + state;

  return {
    taxYear: norm?.year ?? null,
    taxConfigVersion: norm?.version ?? 'unversioned-legacy-settings',
    grossWagesCents: gross,
    taxableIncomeCents: taxable,
    federalIncomeTaxCents: federal,
    socialSecurityCents: ss,
    medicareCents: med,
    additionalMedicareCents: addlMed,
    stateTaxCents: state,
    totalTaxCents: total,
    effectiveRate: gross > 0 ? total / gross : 0,
  };
}

/** Effective tax rate as a decimal. */
export function effectiveTaxRate(totalTaxCents, grossCents) {
  const gross = Number(grossCents) || 0;
  if (gross <= 0) return 0;
  return (Number(totalTaxCents) || 0) / gross;
}

/**
 * Allocate an Owner-level tax estimate to a single job by wage ratio.
 * ratio = jobWages / totalOwnerWages. Returns allocated cents for each
 * component. These are reporting allocations, NOT payroll calculations.
 */
export function allocateJobTax(ownerEstimate, jobWagesCents, totalOwnerWagesCents) {
  const total = Number(totalOwnerWagesCents) || 0;
  const jobWages = Number(jobWagesCents) || 0;
  const ratio = total > 0 ? jobWages / total : 0;
  return {
    ratio,
    federalIncomeTaxCents: roundCents(ownerEstimate.federalIncomeTaxCents * ratio),
    socialSecurityCents: roundCents(ownerEstimate.socialSecurityCents * ratio),
    medicareCents: roundCents(ownerEstimate.medicareCents * ratio),
    additionalMedicareCents: roundCents(ownerEstimate.additionalMedicareCents * ratio),
    stateTaxCents: roundCents(ownerEstimate.stateTaxCents * ratio),
    totalTaxCents: roundCents(ownerEstimate.totalTaxCents * ratio),
  };
}
