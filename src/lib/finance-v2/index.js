// Pure planning arithmetic. Every returned money amount is an integer number of cents.
// These projections must never be treated as an instruction to settle a payment.
export const CALCULATION_VERSION = 'partnership-2026-10-18-v1';
export const DIRECT_2_WAY = 'DIRECT_2_WAY';
export const MIKI_REFERRAL_2_WAY = 'MIKI_REFERRAL_2_WAY';

export const PACKAGE_V1 = Object.freeze({
  version: CALCULATION_VERSION,
  fixedActualCents: 65_000,
  variableActualCents: 40_000,
  fixedQuotedCents: 90_000,
  directVariableQuotedCents: 95_000,
  referredVariableQuotedCents: 115_000,
  referredCommissionPerJobCents: 20_000,
});

function integer(value, label) {
  if (!Number.isSafeInteger(value)) throw new TypeError(`${label} must be a safe integer`);
  return value;
}

/** Round a decimal dollar input once, half away from zero at the cent boundary. */
export function dollarsToCents(value) {
  const match = String(value).trim().match(/^(-?)(\d+)(?:\.(\d+))?$/);
  if (!match) throw new TypeError('Dollar input must be a decimal string or number');
  const fraction = (match[3] || '').padEnd(3, '0');
  let cents = BigInt(match[2]) * 100n + BigInt(fraction.slice(0, 2));
  if (Number(fraction[2] || 0) >= 5) cents += 1n;
  if (match[1]) cents = -cents;
  const result = Number(cents);
  return integer(result, 'Cents');
}

/** Round a signed ratio half away from zero without floating point arithmetic. */
export function roundRatio(cents, numerator, denominator) {
  integer(cents, 'Amount');
  integer(numerator, 'Numerator');
  integer(denominator, 'Denominator');
  if (denominator <= 0 || numerator < 0) throw new RangeError('Invalid ratio');
  const signed = BigInt(cents) * BigInt(numerator);
  const abs = signed < 0n ? -signed : signed;
  const rounded = (abs * 2n + BigInt(denominator)) / (2n * BigInt(denominator));
  return integer(Number(signed < 0n ? -rounded : rounded), 'Rounded amount');
}

/** Deterministically allocate an amount across actual dated periods. */
export function allocateCents(totalCents, periods) {
  integer(totalCents, 'Total');
  integer(periods, 'Periods');
  if (periods <= 0) throw new RangeError('Periods must be positive');
  const quotient = Math.trunc(totalCents / periods);
  const remainder = totalCents - quotient * periods;
  return Array.from({ length: periods }, (_, index) =>
    quotient + (index < Math.abs(remainder) ? Math.sign(remainder) : 0));
}

/** Hourly wages remain a forecast until actual period hours are recorded. */
export function hourlyBiweeklyGrossCents(hourlyRateCents, weeklyHours) {
  integer(hourlyRateCents, 'Hourly rate');
  if (hourlyRateCents < 0 || !Number.isFinite(weeklyHours) || weeklyHours < 0) {
    throw new RangeError('Invalid hourly terms');
  }
  const hourParts = String(weeklyHours).split('.');
  const scale = 10 ** (hourParts[1]?.length || 0);
  const hoursScaled = Math.round(weeklyHours * scale);
  return roundRatio(hourlyRateCents, hoursScaled * 2, scale);
}

export function hourlyAnnualGrossCents(hourlyRateCents, weeklyHours) {
  integer(hourlyRateCents, 'Hourly rate');
  if (hourlyRateCents < 0 || !Number.isFinite(weeklyHours) || weeklyHours < 0) {
    throw new RangeError('Invalid hourly terms');
  }
  const fractionDigits = String(weeklyHours).split('.')[1]?.length || 0;
  const scale = 10 ** fractionDigits;
  return roundRatio(hourlyRateCents, Math.round(weeklyHours * scale) * 52, scale);
}

/** One person's one-month run rate; caller supplies combined after-tax wages. */
export function monthlyStatement({ afterTaxCents, activeJobCount, partnership, packageVersion = PACKAGE_V1 }) {
  integer(afterTaxCents, 'After-tax income');
  integer(activeJobCount, 'Active job count');
  if (activeJobCount < 0) throw new RangeError('Active job count must be nonnegative');
  if (![DIRECT_2_WAY, MIKI_REFERRAL_2_WAY].includes(partnership)) {
    throw new RangeError('Unsupported partnership');
  }
  const p = packageVersion;
  for (const key of ['fixedActualCents', 'variableActualCents', 'fixedQuotedCents',
    'directVariableQuotedCents', 'referredVariableQuotedCents', 'referredCommissionPerJobCents']) {
    integer(p[key], key);
    if (p[key] < 0) throw new RangeError(`${key} must be nonnegative`);
  }
  const referred = partnership === MIKI_REFERRAL_2_WAY;
  const quotedCostCents = p.fixedQuotedCents + activeJobCount *
    (referred ? p.referredVariableQuotedCents : p.directVariableQuotedCents);
  const actualCostCents = p.fixedActualCents + activeJobCount * p.variableActualCents;
  const quotedNetCents = afterTaxCents - quotedCostCents;
  const personShareCents = roundRatio(quotedNetCents, 1, 2);
  const commissionCents = referred ? activeJobCount * p.referredCommissionPerJobCents : 0;
  const gangCutCents = roundRatio(afterTaxCents, 1, 10);
  const yeromeTakeHomeCents = afterTaxCents - actualCostCents - personShareCents - commissionCents - gangCutCents;
  return {
    calculationVersion: p.version,
    basis: 'estimated monthly run rate',
    partnership,
    activeJobCount,
    afterTaxCents,
    quotedCostCents,
    actualCostCents,
    quotedNetCents,
    personShareCents,
    commissionCents,
    gangCutCents,
    yeromeTakeHomeCents,
    needsPayoutPolicy: quotedNetCents < 0 || personShareCents < 0,
  };
}
