// Cash actually received and employer withholding are independent of a
// taxpayer-level annual liability estimate. Missing values remain missing.
export function taxReconciliation({ projectedLiabilityCents, estimatedTaxPaymentsCents = 0,
  socialSecurityAnnualCapCents = null, paychecks = [] }) {
  if ((projectedLiabilityCents !== null && !Number.isSafeInteger(projectedLiabilityCents)) || !Number.isSafeInteger(estimatedTaxPaymentsCents)) {
    throw new TypeError('Tax amounts must be integer cents');
  }
  const withholdingFields = [
    'federalWithheldCents', 'socialSecurityWithheldCents', 'medicareWithheldCents',
    'additionalMedicareWithheldCents', 'stateWithheldCents',
  ];
  let actualWithholdingCents = 0;
  let actualSocialSecurityWithheldCents = 0;
  let missingWithholdingCount = 0;
  let actualNetReceivedCents = 0;
  let missingNetCount = 0;
  for (const paycheck of paychecks) {
    if (withholdingFields.some((field) => paycheck[field] == null)) missingWithholdingCount++;
    for (const field of withholdingFields) {
      const amount = paycheck[field] ?? 0;
      if (!Number.isSafeInteger(amount) || amount < 0) throw new TypeError(`${field} must be nonnegative integer cents`);
      actualWithholdingCents += amount;
      if (field === 'socialSecurityWithheldCents') actualSocialSecurityWithheldCents += amount;
    }
    if (paycheck.actualNetReceivedCents == null) missingNetCount++;
    else {
      if (!Number.isSafeInteger(paycheck.actualNetReceivedCents) || paycheck.actualNetReceivedCents < 0) {
        throw new TypeError('Actual net deposit must be nonnegative integer cents');
      }
      actualNetReceivedCents += paycheck.actualNetReceivedCents;
    }
  }
  return {
    projectedLiabilityCents,
    actualWithholdingCents: missingWithholdingCount ? null : actualWithholdingCents,
    actualSocialSecurityWithheldCents: missingWithholdingCount ? null : actualSocialSecurityWithheldCents,
    missingWithholdingCount,
    potentialExcessSocialSecurityCents: socialSecurityAnnualCapCents == null || missingWithholdingCount ? null :
      Math.max(0, actualSocialSecurityWithheldCents - socialSecurityAnnualCapCents),
    estimatedTaxPaymentsCents,
    projectedGapCents: missingWithholdingCount || projectedLiabilityCents === null ? null :
      projectedLiabilityCents - actualWithholdingCents - estimatedTaxPaymentsCents,
    actualNetReceivedCents,
    missingNetCount,
    actualNetComplete: missingNetCount === 0,
  };
}
