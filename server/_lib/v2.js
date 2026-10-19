import { authorizeRequest } from './supabaseAdmin.js';
import { projectPerson } from '../../src/lib/finance-v2/projection.js';
import { postedSettlementView } from '../../src/lib/finance-v2/posted-settlement.js';

export async function verifiedPrincipal(req) {
  const auth = await authorizeRequest(req);
  if (!auth.ok) return auth;
  if (auth.role === 'admin') return auth;
  if (auth.role !== 'owner') return { ok: false, status: 403 };
  const { db, user } = auth;
  const { data: owner, error } = await db.from('owners')
    .select('id,status').eq('auth_user_id', user.id).maybeSingle();
  if (error || owner?.status !== 'active') return { ok: false, status: 403 };
  return { ...auth, ownerId: owner.id };
}

function unwrap(result) {
  if (result.error) throw result.error;
  return result.data || [];
}

// PostgREST has a server row cap. Never treat one page as a complete ledger.
export async function allPages(makeQuery, pageSize = 500) {
  const rows = [];
  for (let from = 0; ; from += pageSize) {
    const batch = unwrap(await makeQuery().range(from, from + pageSize - 1));
    rows.push(...batch);
    if (batch.length < pageSize) return rows;
  }
}

export async function eligibleJobCountAsOf(db, ownerId, asOf) {
  const jobs = await allPages(() => db.from('jobs')
    .select('id,start_date,end_date').eq('owner_id', ownerId).order('id'));
  if (!jobs.length) return 0;
  const events = await allPages(() => db.from('v2_job_status_events')
    .select('job_id,status,effective_from,event_order')
    .in('job_id', jobs.map((job) => job.id)).lte('effective_from', asOf)
    .order('effective_from', { ascending: false })
    .order('event_order', { ascending: false }));
  const latest = new Map();
  for (const event of events) if (!latest.has(event.job_id)) latest.set(event.job_id, event.status);
  return jobs.filter((job) => job.start_date && job.start_date <= asOf &&
    (!job.end_date || job.end_date >= asOf) && latest.get(job.id) === 'active').length;
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
      .eq('active', true).eq('commission_basis_type', 'flat_per_active_job_month')
      .lte('start_date', asOf).or(`end_date.is.null,end_date.gte.${asOf}`).limit(1),
  ]);
  const jobs = unwrap(jobsResult);
  const apartments = unwrap(apartmentResult);
  const agreements = unwrap(agreementResult);
  const referrals = unwrap(referralResult);
  const ids = jobs.map((job) => job.id);
  let terms = [];
  let paychecks = [];
  let statusEvents = [];
  if (ids.length) {
    [terms, paychecks, statusEvents] = await Promise.all([
      allPages(() => db.from('job_compensation_terms')
        .select('job_id,mode,hourly_rate_cents,expected_weekly_hours,annual_salary_cents,pay_frequency,first_pay_date,periods_per_year,effective_from,effective_to')
        .in('job_id', ids).lte('effective_from', asOf)
        .order('effective_from', { ascending: false })),
      allPages(() => db.from('job_paychecks')
        .select('id,job_id,pay_date,period_start,period_end,status,actual_gross_cents,actual_net_received_cents,federal_withheld_cents,social_security_withheld_cents,medicare_withheld_cents,additional_medicare_withheld_cents,state_withheld_cents,other_deductions_cents')
        .in('job_id', ids).order('pay_date', { ascending: false }).order('id')),
      allPages(() => db.from('v2_job_status_events')
        .select('job_id,status,effective_from,event_order').in('job_id', ids)
        .lte('effective_from', asOf).order('effective_from', { ascending: false })
        .order('event_order', { ascending: false })),
    ]);
    const paidIds = paychecks.filter((check) => check.status === 'paid').map((check) => check.id);
    if (paidIds.length) {
      const corrections = [];
      for (let offset = 0; offset < paidIds.length; offset += 100) {
        corrections.push(...await allPages(() => db.from('v2_paycheck_corrections')
          .select('job_paycheck_id,sequence,snapshot_json').in('job_paycheck_id', paidIds.slice(offset, offset + 100))
          .order('sequence', { ascending: false }).order('id')));
      }
      const latest = new Map();
      for (const correction of corrections) if (!latest.has(correction.job_paycheck_id))
        latest.set(correction.job_paycheck_id, correction);
      paychecks = paychecks.map((check) => latest.has(check.id)
        ? { ...check, ...latest.get(check.id).snapshot_json,
          receipt_correction_sequence: latest.get(check.id).sequence, corrected: true } : check);
    }
  }
  const termByJob = new Map();
  for (const term of terms) if (!termByJob.has(term.job_id) && term.effective_from <= asOf &&
    (!term.effective_to || term.effective_to >= asOf)) termByJob.set(term.job_id, term);
  const statusByJob = new Map();
  for (const event of statusEvents) if (!statusByJob.has(event.job_id))
    statusByJob.set(event.job_id, event.status);
  const settlementRows = await allPages(() => db.from('v2_payrun_settlements')
    .select('id,job_paycheck_id,pay_date,source_net_cents,quoted_cost_cents,actual_cost_cents,partner_due_cents,commission_cents,gang_cut_cents,yerome_residual_cents,receipt_correction_sequence')
    .eq('owner_id', ownerId).not('batch_id', 'is', null)
    .order('pay_date', { ascending: false }).order('id'));
  const payments = [];
  const adjustments = [];
  const reconciliations = [];
  for (let offset = 0; offset < settlementRows.length; offset += 100) {
    const settlementIds = settlementRows.slice(offset, offset + 100).map((row) => row.id);
    const [pagePayments, pageAdjustments, pageReconciliations] = await Promise.all([
      allPages(() => db.from('v2_partner_payments')
        .select('settlement_id,amount_cents,paid_at,evidence_verified').in('settlement_id', settlementIds)
        .order('paid_at')),
      allPages(() => db.from('v2_settlement_adjustments')
        .select('settlement_id,after_tax_delta_cents,quoted_cost_delta_cents,actual_cost_delta_cents,partner_due_delta_cents,commission_delta_cents,gang_delta_cents,yerome_delta_cents,receipt_correction_id')
        .in('settlement_id', settlementIds).order('created_at')),
      allPages(() => db.from('v2_settlement_reconciliations')
        .select('corrected_settlement_id,correction_id').in('corrected_settlement_id', settlementIds)
        .order('created_at')),
    ]);
    payments.push(...pagePayments);
    adjustments.push(...pageAdjustments);
    reconciliations.push(...pageReconciliations);
  }
  const partnerSettlements = settlementRows.map((row) => {
    const rowPayments = payments.filter((payment) => payment.settlement_id === row.id);
    const rowAdjustments = adjustments.filter((adjustment) => adjustment.settlement_id === row.id);
    const ledger = postedSettlementView(row, rowAdjustments, rowPayments);
    const coveredCorrections = reconciliations.filter((item) =>
      item.corrected_settlement_id === row.id).length;
    const check = paychecks.find((item) => item.id === row.job_paycheck_id);
    return { paycheckId: row.job_paycheck_id, payDate: row.pay_date,
      partnerDueOriginalCents: ledger.original.partnerDueCents,
      partnerDueChangesCents: ledger.changes.partnerDueCents,
      partnerDueCents: ledger.current.partnerDueCents,
      paidCents: ledger.paidCents, unverifiedPaidCents: ledger.unverifiedPaidCents, owedCents: ledger.owedCents,
      overpaidCents: ledger.overpaidCents, lastPaidAt: ledger.lastPaidAt,
      needsAdjustment: Boolean(check?.corrected &&
        (Number(row.receipt_correction_sequence) + coveredCorrections) <
        (check.receipt_correction_sequence || 0)) };
  });
  return projectPerson({
    owner: { ...owner,
      v2_partnership: agreements[0]?.partnership || null,
      agreement_verified_at: agreements[0]?.verified_at || null },
    jobs: jobs.map((job) => ({ ...job, status: statusByJob.get(job.id) || job.status,
      terms: termByJob.get(job.id) || null,
      termsHistory: terms.filter((term) => term.job_id === job.id),
      statusHistory: statusEvents.filter((event) => event.job_id === job.id) })),
    apartment: apartments[0] || null,
    hasVerifiedReferral: referrals.length > 0,
    agreementEffectiveFrom: agreements[0]?.effective_from || null,
    paychecks,
    partnerSettlements,
    taxYear: 2026,
    asOf,
  });
}

export function sendApiError(res, error) {
  // No database message, token, or service configuration in a browser response.
  console.error('v2 API request failed', error?.code || error?.name || 'unknown');
  return res.status(500).json({ error: 'Could not load the requested statement.' });
}
