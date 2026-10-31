import { addDays, addMonths, expectedPayDatesForMonth } from '../formatting/dates.js';
import { projectPerson, jobProjection } from './projection.js';
import { roundRatio } from './index.js';

export function termsOn(job, date) {
  const terms = job.termsHistory?.length ? job.termsHistory : job.terms ? [job.terms] : [];
  const covering = terms.filter((term) => (!term.effective_from || term.effective_from <= date) &&
    (!term.effective_to || term.effective_to >= date));
  return covering.length === 1 ? covering[0] : null;
}

export function jobOn(job, date) {
  const event = [...(job.statusHistory || [])].filter((row) => row.effective_from <= date)
    .sort((a, b) => a.effective_from.localeCompare(b.effective_from) ||
      Number(a.event_order || 0) - Number(b.event_order || 0)).at(-1);
  let status = event?.status || job.status;
  if (job.start_date && job.start_date > date) status = 'pending';
  if (job.end_date && job.end_date < date) status = 'ended';
  return { ...job, status, terms: termsOn(job, date) };
}

/** Derived forecasts only: no schedule rows, paystubs or settlement records. */
export function incomeForecast({ owner, jobs, apartment, asOf, horizonDays = 90 }) {
  const end = [addDays(asOf, horizonDays), '2026-12-31'].sort()[0];
  const warnings = [];
  const candidates = new Map();
  for (const job of jobs) {
    const terms = job.termsHistory?.length ? job.termsHistory : job.terms ? [job.terms] : [];
    let hasFutureTerms = false;
    for (const term of terms) {
      if (term.effective_to && term.effective_to < asOf) continue;
      hasFutureTerms = true;
      if (!term.first_pay_date || !['weekly', 'biweekly', 'monthly'].includes(term.pay_frequency)) {
        warnings.push(`${job.employer_name}: add an expected income date and supported frequency.`);
        continue;
      }
      for (let month = `${asOf.slice(0, 7)}-01`; month <= end; month = addMonths(month, 1)) {
        let dates;
        try { dates = expectedPayDatesForMonth(term.first_pay_date, month, term.pay_frequency); }
        catch { warnings.push(`${job.employer_name}: check the expected income date.`); break; }
        for (const date of dates) {
          if (date < asOf || date > end) continue;
          const dated = jobOn(job, date);
          if (dated.status !== 'active' || dated.terms !== term) continue;
          candidates.set(`${job.id}:${date}`, { job: dated, date });
        }
      }
    }
    if (!hasFutureTerms && !['ended', 'archived'].includes(job.status))
      warnings.push(`${job.employer_name}: add compensation terms to forecast income.`);
  }
  const byDate = new Map();
  const upcoming = [...candidates.values()].sort((a, b) => a.date.localeCompare(b.date) || a.job.id.localeCompare(b.job.id))
    .map(({ job, date }) => {
      if (!byDate.has(date)) byDate.set(date, projectPerson({ owner,
        jobs: jobs.map((row) => jobOn(row, date)), apartment, asOf: date, taxYear: 2026 }));
      const projection = byDate.get(date);
      const projectedJob = jobProjection(job);
      const grossCents = projectedJob.typicalEmployerPaycheckGrossCents;
      const complete = !projection.incompleteTerms && projection.stateSupported;
      const taxCents = complete && projection.annualGrossCents > 0
        ? roundRatio(projection.runRateTaxEstimate.totalTaxCents, grossCents, projection.annualGrossCents) : null;
      return { jobId: job.id, employerName: job.employer_name, date, grossCents,
        taxCents, netCents: taxCents == null ? null : grossCents - taxCents };
    });
  const nextDate = upcoming[0]?.date || null;
  const nextRows = upcoming.filter((row) => row.date === nextDate);
  const nextGrossCents = nextRows.reduce((sum, row) => sum + row.grossCents, 0);
  const nextNetCents = nextRows.length && nextRows.every((row) => row.netCents != null)
    ? nextRows.reduce((sum, row) => sum + row.netCents, 0) : null;
  const nextProjection = byDate.get(nextDate);
  const s = nextProjection?.statement;
  const scale = (value) => roundRatio(value, nextNetCents, nextProjection.monthlyAfterTaxCents);
  let allocation = null;
  if (s && nextNetCents > 0 && nextProjection.monthlyAfterTaxCents > 0) {
    const ownerShareCents = scale(s.personShareCents);
    const chargesCents = scale(s.quotedCostCents);
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
    basis: 'Expected dates use submitted job terms. Net income uses the combined annual tax rate for that owner. Allocation scales monthly assumptions to the expected inflow; monthly timing can vary.' };
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
