export const RECEIPT_FIELDS = Object.freeze([
  'actualGrossCents', 'actualNetReceivedCents', 'federalWithheldCents',
  'socialSecurityWithheldCents', 'medicareWithheldCents',
  'additionalMedicareWithheldCents', 'stateWithheldCents', 'otherDeductionsCents',
]);

export function validatedReceipt(body) {
  const receipt = {};
  for (const field of RECEIPT_FIELDS) {
    const value = Number(body[field]);
    if (body[field] === '' || body[field] == null || !Number.isSafeInteger(value) || value < 0) {
      throw new RangeError(`${field} must be a nonnegative integer number of cents, including zero`);
    }
    receipt[field] = value;
  }
  if (receipt.actualGrossCents !== receipt.actualNetReceivedCents +
      receipt.federalWithheldCents + receipt.socialSecurityWithheldCents +
      receipt.medicareWithheldCents + receipt.additionalMedicareWithheldCents +
      receipt.stateWithheldCents + receipt.otherDeductionsCents) {
    throw new RangeError('Gross must equal net deposit plus all withholding and deductions');
  }
  if (body.actualHours != null && body.actualHours !== '') {
    const hours = Number(body.actualHours);
    if (!Number.isFinite(hours) || hours < 0) throw new RangeError('Invalid actual hours');
    receipt.actualHours = hours;
  }
  return receipt;
}
