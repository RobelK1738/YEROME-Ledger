import { allPages } from './v2.js';

// Admin editing uses the latest open version, even before it takes effect.
// Keep these inputs separate from the as-of terms used in financial projections.
export async function attachJobEditingTerms(db, people) {
  const jobIds = people.flatMap((person) => person.myJobs.map((job) => job.id));
  if (!jobIds.length) return people;
  const rows = await allPages(() => db.from('job_compensation_terms')
    .select('job_id,effective_from,mode,hourly_rate_cents,expected_weekly_hours,annual_salary_cents,pay_frequency,first_pay_date,periods_per_year')
    .in('job_id', jobIds).is('effective_to', null).order('job_id'));
  const latest = new Map(rows.map((row) => [row.job_id, {
    effectiveFrom: row.effective_from, mode: row.mode,
    hourlyRateCents: row.hourly_rate_cents, expectedWeeklyHours: row.expected_weekly_hours,
    annualSalaryCents: row.annual_salary_cents, payFrequency: row.pay_frequency,
    firstPayDate: row.first_pay_date, periodsPerYear: row.periods_per_year,
  }]));
  return people.map((person) => ({ ...person, myJobs: person.myJobs.map((job) => ({
    ...job, latestTerms: latest.get(job.id) || null,
  })) }));
}
