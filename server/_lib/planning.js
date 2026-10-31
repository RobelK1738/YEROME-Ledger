import { allPages } from './v2.js';
import { projectPerson, ownerStatementDto, adminStatementDto, jobProjection } from '../../src/lib/finance-v2/projection.js';
import { incomeForecast, jobOn, ownerForecastDto } from '../../src/lib/finance-v2/forecast.js';
import { allocationPlanDto } from '../../src/lib/finance-v2/allocation-plan.js';
import { PACKAGE_V1 } from '../../src/lib/finance-v2/index.js';

function rows(result) { if (result.error) throw result.error; return result.data || []; }

export async function loadPlanningPerson(db, ownerId, asOf) {
  const result = await db.from('owners')
    .select('id,display_name,filing_status,state,status,v2_partnership,other_income_adjustment_cents,deduction_adjustment_cents')
    .eq('id', ownerId).maybeSingle();
  if (result.error) throw result.error;
  if (!result.data) return null;
  const [jobs, agreements, apartments, planRows] = await Promise.all([
    allPages(() => db.from('jobs').select('id,owner_id,employer_name,role_title,status,start_date,end_date')
      .eq('owner_id', ownerId).order('id')),
    db.from('v2_agreement_versions').select('partnership,effective_from,effective_to')
      .eq('owner_id', ownerId).lte('effective_from', asOf)
      .or(`effective_to.is.null,effective_to.gte.${asOf}`).order('effective_from', { ascending: false }).limit(1).then(rows),
    db.from('person_apartments').select('actual_monthly_cents,quoted_monthly_cents,effective_from,effective_to')
      .eq('owner_id', ownerId).lte('effective_from', asOf)
      .or(`effective_to.is.null,effective_to.gte.${asOf}`).order('effective_from', { ascending: false }).limit(1).then(rows),
    db.from('v3_projection_plans').select('partnership,apartment_actual_cents,apartment_charge_cents,next_fund_date,instructions,updated_at')
      .eq('owner_id', ownerId).limit(1).then(rows),
  ]);
  const ids = jobs.map((job) => job.id);
  const [terms, events] = ids.length ? await Promise.all([
    allPages(() => db.from('job_compensation_terms')
      .select('job_id,mode,hourly_rate_cents,expected_weekly_hours,annual_salary_cents,pay_frequency,first_pay_date,periods_per_year,effective_from,effective_to')
      .in('job_id', ids).order('effective_from', { ascending: false }).order('id')),
    allPages(() => db.from('v2_job_status_events').select('job_id,status,effective_from,event_order')
      .in('job_id', ids).order('effective_from').order('event_order')),
  ]) : [[], []];
  const plan = planRows[0];
  const owner = { ...result.data, v2_partnership: plan?.partnership || agreements[0]?.partnership || result.data.v2_partnership };
  const apartment = {
    actual_monthly_cents: plan?.apartment_actual_cents ?? apartments[0]?.actual_monthly_cents ?? PACKAGE_V1.fixedActualCents,
    quoted_monthly_cents: plan?.apartment_charge_cents ?? apartments[0]?.quoted_monthly_cents ?? PACKAGE_V1.fixedQuotedCents,
  };
  const rawJobs = jobs.map((job) => ({ ...job,
    termsHistory: terms.filter((row) => row.job_id === job.id),
    statusHistory: events.filter((row) => row.job_id === job.id) }));
  const projected = projectPerson({ owner, jobs: rawJobs.map((job) => jobOn(job, asOf)), apartment, asOf, taxYear: 2026 });
  // A planned job shows its submitted future terms without contributing to today's income.
  projected.myJobs = projected.myJobs.map((job) => {
    const raw = rawJobs.find((row) => row.id === job.id);
    const next = raw.termsHistory.filter((row) => row.effective_from > asOf)
      .sort((a, b) => a.effective_from.localeCompare(b.effective_from))[0];
    return { ...job, plannedTerms: next ? jobProjection({ ...raw, terms: next }) : null };
  });
  return { projected, forecast: incomeForecast({ owner, jobs: rawJobs, apartment, asOf }),
    allocationPlan: allocationPlanDto(plan), rawJobs };
}

export function planningDto(data, admin = false) {
  return { ...(admin ? adminStatementDto(data.projected) : ownerStatementDto(data.projected)),
    nextPayDate: data.forecast.nextDate,
    forecast: admin ? data.forecast : ownerForecastDto(data.forecast),
    allocationPlan: data.allocationPlan };
}

export async function loadCommissionProjections(db, asOf, referrerId = null) {
  const referrals = await allPages(() => {
    let query = db.from('referrals')
      .select('id,referrer_owner_id,referred_owner_id,active,start_date,end_date,commission_basis_type,name_visible_to_referrer')
      .eq('commission_basis_type', 'flat_per_active_job_month').order('id');
    if (referrerId) query = query.eq('referrer_owner_id', referrerId);
    return query;
  });
  const ids = referrals.map((row) => row.id);
  const status = ids.length ? await allPages(() => db.from('v2_referral_status_events')
    .select('referral_id,active,effective_from,event_order').in('referral_id', ids)
    .lte('effective_from', asOf).order('effective_from').order('event_order')) : [];
  const cache = new Map();
  async function person(id) {
    if (!cache.has(id)) cache.set(id, loadPlanningPerson(db, id, asOf));
    return cache.get(id);
  }
  const sources = [];
  for (const referral of referrals) {
    const [referred, referrer] = await Promise.all([person(referral.referred_owner_id), person(referral.referrer_owner_id)]);
    if (!referred || !referrer || referrer.projected.owner.status === 'archived') continue;
    const latest = status.filter((row) => row.referral_id === referral.id).at(-1);
    const eligible = Boolean((latest ? latest.active : referral.active) && referral.start_date <= asOf &&
      (!referral.end_date || referral.end_date >= asOf) &&
      referred.projected.owner.status !== 'archived' &&
      referred.projected.owner.v2_partnership === 'MIKI_REFERRAL_2_WAY');
    const jobs = referred.projected.myJobs.filter((job) => job.status === 'active');
    sources.push({ referralId: referral.id, referrerOwnerId: referral.referrer_owner_id,
      referredOwnerId: referral.referred_owner_id, referrerName: referrer.projected.owner.display_name,
      referredName: referred.projected.owner.display_name, nameVisible: referral.name_visible_to_referrer,
      eligible, activeJobCount: eligible ? jobs.length : 0,
      ratePerJobCents: PACKAGE_V1.referredCommissionPerJobCents,
      monthlyCents: eligible ? jobs.length * PACKAGE_V1.referredCommissionPerJobCents : 0,
      jobs: eligible ? jobs.map((job) => ({ employerName: job.employerName })) : [] });
  }
  return sources;
}

export function ownerCommissionSources(sources) {
  return sources.map((row) => ({ referralId: row.referralId,
    referredDisplayName: row.nameVisible ? row.referredName : 'Referred owner',
    currentlyEarning: row.eligible, eligibleJobCount: row.activeJobCount,
    ratePerJobCents: row.ratePerJobCents, monthlyEquivalentCents: row.monthlyCents }));
}
