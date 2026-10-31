import { allPages } from './v2.js';
import { projectPerson, ownerStatementDto, adminStatementDto } from '../../src/lib/finance-v2/projection.js';
import { incomeForecast, planningJob, ownerForecastDto } from '../../src/lib/finance-v2/forecast.js';
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
    allPages(() => db.from('jobs').select('id,owner_id,employer_name,role_title,status,start_date,end_date,planning_pay_details')
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
  const terms = ids.length ? await allPages(() => db.from('job_compensation_terms')
    .select('job_id,mode,hourly_rate_cents,expected_weekly_hours,annual_salary_cents,pay_frequency,first_pay_date,periods_per_year,effective_from,effective_to')
    .in('job_id', ids).order('effective_from', { ascending: false }).order('id')) : [];
  const plan = planRows[0];
  const owner = { ...result.data, v2_partnership: plan?.partnership || agreements[0]?.partnership || result.data.v2_partnership };
  const apartment = {
    actual_monthly_cents: plan?.apartment_actual_cents ?? apartments[0]?.actual_monthly_cents ?? PACKAGE_V1.fixedActualCents,
    quoted_monthly_cents: plan?.apartment_charge_cents ?? apartments[0]?.quoted_monthly_cents ?? PACKAGE_V1.fixedQuotedCents,
  };
  const rawJobs = jobs.map((job) => {
    const legacy = terms.filter((row) => row.job_id === job.id);
    const saved = job.planning_pay_details || legacy.find((row) => !row.effective_to) || legacy[0];
    return planningJob({ ...job, terms: saved });
  });
  const projected = projectPerson({ owner, jobs: rawJobs, apartment, asOf, taxYear: 2026 });
  projected.myJobs = projected.myJobs.map((job) => ({ ...job,
    savedPayDetails: job.compensationMode ? { ...job } : null }));
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
  const cache = new Map();
  async function person(id) {
    if (!cache.has(id)) cache.set(id, loadPlanningPerson(db, id, asOf));
    return cache.get(id);
  }
  const sources = [];
  for (const referral of referrals) {
    const [referred, referrer] = await Promise.all([person(referral.referred_owner_id), person(referral.referrer_owner_id)]);
    if (!referred || !referrer || referrer.projected.owner.status === 'archived') continue;
    const eligible = Boolean(referral.active &&
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
