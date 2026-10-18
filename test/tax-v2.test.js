import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getTaxConfig2026 } from '../src/lib/calculations/taxConfig2026.js';
import { taxableIncome, ownerTaxEstimate, projectedOwnerWages } from '../src/lib/calculations/tax.js';
import { taxReconciliation } from '../src/lib/finance-v2/tax-reconciliation.js';

test('2026 single $50k wages uses the official $16,100 standard deduction', () => {
  const settings = getTaxConfig2026('single');
  assert.equal(taxableIncome(5_000_000, settings), 3_390_000);
  const estimate = ownerTaxEstimate({ grossWagesCents: 5_000_000, settings });
  assert.equal(estimate.federalIncomeTaxCents, 382_000);
  assert.equal(estimate.socialSecurityCents, 310_000);
  assert.equal(estimate.medicareCents, 72_500);
  assert.equal(estimate.totalTaxCents, 764_500);
});

test("two $50k jobs combine for a single person's annual tax estimate", () => {
  const jobs = [
    { status: 'active', annual_salary_cents: 5_000_000 },
    { status: 'active', annual_salary_cents: 5_000_000 },
  ];
  const wages = projectedOwnerWages(jobs);
  const estimate = ownerTaxEstimate({ grossWagesCents: wages, settings: getTaxConfig2026('single') });
  assert.equal(estimate.federalIncomeTaxCents, 1_317_000);
  assert.equal(estimate.totalTaxCents, 2_082_000);
});

test('deduction adjustments affect federal taxable income, not payroll wages', () => {
  const estimate = ownerTaxEstimate({
    grossWagesCents: 5_000_000,
    settings: getTaxConfig2026('single'),
    deductionAdjustmentCents: 100_000,
  });
  assert.equal(estimate.taxableIncomeCents, 3_290_000);
  assert.equal(estimate.socialSecurityCents, 310_000);
});

test('withholding and actual net deposit remain distinct from projected liability', () => {
  const result = taxReconciliation({
    projectedLiabilityCents: 2_082_000,
    socialSecurityAnnualCapCents: 1_143_900,
    estimatedTaxPaymentsCents: 10_000,
    paychecks: [
      { employerId: 'A', federalWithheldCents: 400_000, socialSecurityWithheldCents: 310_000, medicareWithheldCents: 72_500, actualNetReceivedCents: 4_000_000 },
      { employerId: 'B', federalWithheldCents: 400_000, socialSecurityWithheldCents: 310_000, medicareWithheldCents: 72_500, actualNetReceivedCents: 4_000_000 },
    ],
  });
  assert.equal(result.actualWithholdingCents, 1_565_000);
  assert.equal(result.actualNetReceivedCents, 8_000_000);
  assert.equal(result.actualSocialSecurityWithheldCents, 620_000);
  assert.equal(result.potentialExcessSocialSecurityCents, 0);
  assert.equal(result.projectedGapCents, 507_000);
});

test('two employers can withhold above the combined Social Security wage cap', () => {
  const config = getTaxConfig2026('single');
  const projected = ownerTaxEstimate({ grossWagesCents: 20_000_000, settings: config });
  assert.equal(projected.socialSecurityCents, 1_143_900);
  const cash = taxReconciliation({
    projectedLiabilityCents: projected.totalTaxCents,
    socialSecurityAnnualCapCents: projected.socialSecurityCents,
    paychecks: [
      { socialSecurityWithheldCents: 620_000, actualNetReceivedCents: 8_000_000 },
      { socialSecurityWithheldCents: 620_000, actualNetReceivedCents: 8_000_000 },
    ],
  });
  assert.equal(cash.actualSocialSecurityWithheldCents, 1_240_000);
  assert.equal(cash.potentialExcessSocialSecurityCents, 96_100);
  assert.equal(cash.actualNetReceivedCents, 16_000_000);
});
