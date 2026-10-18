import { adminClient, getEnv } from './supabaseAdmin.js';
import { projectPerson } from '../../src/lib/finance-v2/projection.js';

function bearer(req) {
  const value = req.headers.authorization || req.headers.Authorization || '';
  return value.startsWith('Bearer ') ? value.slice(7) : null;
}

export async function verifiedPrincipal(req) {
  const token = bearer(req);
  if (!token) return { ok: false, status: 401 };
  const db = adminClient();
  const { data, error } = await db.auth.getUser(token);
  if (error || !data?.user) return { ok: false, status: 401 };
  const user = data.user;
  const role = user.app_metadata?.role;
  if (role === 'admin') {
    const { adminEmail } = getEnv();
    if (!adminEmail || user.email?.toLowerCase() !== String(adminEmail).toLowerCase()) {
      return { ok: false, status: 403 };
    }
    return { ok: true, role, user, db };
  }
  if (role !== 'owner') return { ok: false, status: 403 };
  // Never trust a supplied owner ID, username, URL segment, or stale JWT claim.
  const { data: owner, error: ownerError } = await db.from('owners')
    .select('id, status').eq('auth_user_id', user.id).maybeSingle();
  if (ownerError || !owner || owner.status !== 'active') return { ok: false, status: 403 };
  return { ok: true, role, user, ownerId: owner.id, db };
}

function unwrap(result) {
  if (result.error) throw result.error;
  return result.data || [];
}

export async function loadPersonProjection(db, ownerId, asOf = new Date().toISOString().slice(0, 10)) {
  const { data: owner, error } = await db.from('owners')
    .select('id,display_name,filing_status,state,status,v2_partnership,agreement_verified_at,other_income_adjustment_cents,deduction_adjustment_cents')
    .eq('id', ownerId).maybeSingle();
  if (error) throw error;
  if (!owner) return null;
  const [jobsResult, apartmentResult, agreementResult, referralResult] = await Promise.all([
    db.from('jobs').select('id,owner_id,employer_name,role_title,status,start_date,end_date,pay_frequency')
      .eq('owner_id', ownerId),
    db.from('person_apartments').select('actual_monthly_cents,quoted_monthly_cents,lease_active,effective_from,effective_to')
      .eq('owner_id', ownerId).eq('lease_active', true).lte('effective_from', asOf)
      .or(`effective_to.is.null,effective_to.gte.${asOf}`).limit(1),
    db.from('v2_agreement_versions').select('partnership,verified_at,effective_from,effective_to')
      .eq('owner_id', ownerId).lte('effective_from', asOf)
      .or(`effective_to.is.null,effective_to.gte.${asOf}`).limit(1),
    db.from('referrals').select('id').eq('referred_owner_id', ownerId)
      .eq('active', true).eq('commission_basis_type', 'flat_per_active_job_month').limit(1),
  ]);
  const jobs = unwrap(jobsResult);
  const apartments = unwrap(apartmentResult);
  const agreements = unwrap(agreementResult);
  const referrals = unwrap(referralResult);
  const ids = jobs.map((job) => job.id);
  let terms = [];
  let paychecks = [];
  if (ids.length) {
    const [termResult, paycheckResult] = await Promise.all([
      db.from('job_compensation_terms')
        .select('job_id,mode,hourly_rate_cents,expected_weekly_hours,annual_salary_cents,pay_frequency,first_pay_date,periods_per_year,effective_from,effective_to')
        .in('job_id', ids).lte('effective_from', asOf).or(`effective_to.is.null,effective_to.gte.${asOf}`)
        .order('effective_from', { ascending: false }),
      db.from('job_paychecks')
        .select('id,job_id,pay_date,period_start,period_end,status,actual_gross_cents,actual_net_received_cents,federal_withheld_cents,social_security_withheld_cents,medicare_withheld_cents,additional_medicare_withheld_cents,state_withheld_cents')
        .in('job_id', ids).order('pay_date', { ascending: false }).limit(500),
    ]);
    terms = unwrap(termResult);
    paychecks = unwrap(paycheckResult);
  }
  const termByJob = new Map();
  for (const term of terms) if (!termByJob.has(term.job_id)) termByJob.set(term.job_id, term);
  return projectPerson({
    owner: { ...owner,
      v2_partnership: agreements[0]?.partnership || null,
      agreement_verified_at: agreements[0]?.verified_at || null },
    jobs: jobs.map((job) => ({ ...job, terms: termByJob.get(job.id) || null })),
    apartment: apartments[0] || null,
    hasVerifiedReferral: referrals.length > 0,
    agreementEffectiveFrom: agreements[0]?.effective_from || null,
    paychecks,
    taxYear: 2026,
    asOf,
  });
}

export function sendApiError(res, error) {
  // No database message, token, or service configuration in a browser response.
  console.error('v2 API request failed', error?.code || error?.name || 'unknown');
  return res.status(500).json({ error: 'Could not load the requested statement.' });
}
