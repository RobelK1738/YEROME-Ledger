import { addDays, addMonths, expectedPayDatesForMonth } from '../formatting/dates.js';
import { projectPerson, jobProjection } from './projection.js';
import { roundRatio } from './index.js';

/** Saved jobs contribute immediately; dates only place income on the calendar. */
export function planningJob(job) {
  const history = job.termsHistory || [];
  return { ...job, status: job.status === 'pending' ? 'active' : job.status,
    terms: job.terms || job.planning_pay_details || history.find((row) => !row.effective_to) || history[0] || null };
}

/** Derived forecasts only: no activation dates, version calendars or receipt rows. */
export function incomeForecast({ owner, jobs, apartment, asOf, horizonDays = 90 }) {
  const end = addDays(asOf, horizonDays);
  const savedJobs = jobs.map(planningJob);
  const projection = projectPerson({ owner, jobs: savedJobs, apartment, asOf, taxYear: 2026 });
  const warnings = [];
  const upcoming = [];
  for (const job of savedJobs.filter((row) => row.status === 'active')) {
    const term = job.terms;
    if (!term) { warnings.push(`${job.employer_name}: add pay details to forecast income.`); continue; }
    if (!term.first_pay_date || !['weekly', 'biweekly', 'monthly'].includes(term.pay_frequency)) {
      warnings.push(`${job.employer_name}: add a first pay date and supported frequency.`);
      continue;
    }
    const grossCents = jobProjection(job).typicalEmployerPaycheckGrossCents;
    const taxCents = !projection.incompleteTerms && projection.stateSupported && projection.annualGrossCents > 0
      ? roundRatio(projection.runRateTaxEstimate.totalTaxCents, grossCents, projection.annualGrossCents) : null;
    for (let month = `${asOf.slice(0, 7)}-01`; month <= end; month = addMonths(month, 1)) {
      let dates;
      try { dates = expectedPayDatesForMonth(term.first_pay_date, month, term.pay_frequency); }
      catch { warnings.push(`${job.employer_name}: check the first pay date.`); break; }
      for (const date of dates) {
        if (date < asOf || date > end) continue;
        upcoming.push({ jobId: job.id, employerName: job.employer_name, date, grossCents,
          taxCents, netCents: taxCents == null ? null : grossCents - taxCents });
      }
    }
  }
  upcoming.sort((a, b) => a.date.localeCompare(b.date) || a.jobId.localeCompare(b.jobId));
  const nextDate = upcoming[0]?.date || null;
  const nextRows = upcoming.filter((row) => row.date === nextDate);
  const nextGrossCents = nextRows.reduce((sum, row) => sum + row.grossCents, 0);
  const nextNetCents = nextRows.length && nextRows.every((row) => row.netCents != null)
    ? nextRows.reduce((sum, row) => sum + row.netCents, 0) : null;
  const s = projection.statement;
  const scale = (value) => roundRatio(value, nextNetCents, projection.monthlyAfterTaxCents);
  let allocation = null;
  if (s && nextNetCents > 0 && projection.monthlyAfterTaxCents > 0) {
    const chargesCents = scale(s.quotedCostCents);
    const ownerShareCents = roundRatio(nextNetCents - chargesCents, 1, 2);
    const actualCostCents = scale(s.actualCostCents);
    const commissionCents = scale(s.commissionCents);
    const gangCutCents = scale(s.gangCutCents);
    allocation = { ownerShareCents, chargesCents, actualCostCents, commissionCents, gangCutCents,
      serviceShareCents: nextNetCents - chargesCents - ownerShareCents,
      yeromeCents: nextNetCents - ownerShareCents - actualCostCents - commissionCents - gangCutCents };
  }
  return { asOf, end, upcoming, nextDate, nextGrossCents: nextRows.length ? nextGrossCents : null,
    nextNetCents, nextTaxCents: nextNetCents == null ? null : nextGrossCents - nextNetCents,
    allocation, warnings: [...new Set(warnings)],
    basis: 'Every saved, unpaused job contributes to the full projection immediately. Expected income dates use the first pay date and frequency. Net income uses the combined annual tax rate for that owner. Allocation scales monthly assumptions to the expected inflow; monthly timing can vary.' };
}

/** Keep internal spending and margins out of the owner API. */
export function ownerForecastDto(forecast) {
  const a = forecast.allocation;
  return { asOf: forecast.asOf, end: forecast.end, upcoming: forecast.upcoming,
    nextDate: forecast.nextDate, nextGrossCents: forecast.nextGrossCents,
    nextNetCents: forecast.nextNetCents, nextTaxCents: forecast.nextTaxCents,
    allocation: a ? { ownerShareCents: a.ownerShareCents, chargesCents: a.chargesCents,
      serviceShareCents: a.serviceShareCents } : null,
    warnings: forecast.warnings, basis: forecast.basis };
}
