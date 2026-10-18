import { adminClient, requireAdmin, readJsonBody } from '../_lib/supabaseAdmin.js';
import { allPages } from '../_lib/v2.js';
import { PACKAGE_V1 } from '../../src/lib/finance-v2/index.js';
import { settlementProposal } from '../../src/lib/finance-v2/settlement.js';

const monthValid = (value) => /^\d{4}-(0[1-9]|1[0-2])-01$/.test(value || '');
const monthEnd = (month) => new Date(Date.UTC(Number(month.slice(0, 4)),
  Number(month.slice(5, 7)), 0)).toISOString().slice(0, 10);
const currentMonth = () => `${new Date().toISOString().slice(0, 7)}-01`;

async function unwrap(query) {
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

async function readMonth(db, ownerId, month) {
  const end = monthEnd(month);
  const [agreementRows, policies, jobs] = await Promise.all([
    unwrap(db.from('v2_agreement_versions').select('*').eq('owner_id', ownerId)
      .not('verified_at', 'is', null).lte('effective_from', month)
      .or(`effective_to.is.null,effective_to.gte.${end}`).limit(1)),
    unwrap(db.from('v2_settlement_policy_approvals').select('id,policy_version')
      .eq('owner_id', ownerId).eq('enabled', true).lte('effective_from', month)
      .or(`effective_to.is.null,effective_to.gte.${end}`).limit(1)),
    allPages(() => db.from('jobs').select('id,owner_id,start_date,end_date,status')
      .eq('owner_id', ownerId).order('id')),
  ]);
  const agreement = agreementRows[0];
  const policy = policies[0] || null;
  if (!agreement || !policy) return { policyApproved: Boolean(policy), proposal: null,
    reviewReason: !policy ? 'Founder-approved settlement and legal policy is not enabled.' :
      'A verified agreement must cover the full calendar month.' };
  const ids = jobs.map((job) => job.id);
  if (!ids.length) return { policyApproved: true, proposal: null, reviewReason: 'No jobs for this US Person.' };
  const [events, checks] = await Promise.all([
    allPages(() => db.from('v2_job_status_events').select('job_id,status,effective_from,event_order')
      .in('job_id', ids).lte('effective_from', end)
      .order('effective_from').order('event_order')),
    allPages(() => db.from('job_paychecks').select('id,job_id,pay_date,status,actual_gross_cents,actual_net_received_cents,federal_withheld_cents,social_security_withheld_cents,medicare_withheld_cents,additional_medicare_withheld_cents,state_withheld_cents,other_deductions_cents')
      .in('job_id', ids).gte('pay_date', month).lte('pay_date', end)
      .order('pay_date').order('id')),
  ]);
  const eligible = jobs.filter((job) => {
    if (!job.start_date || job.start_date > month || (job.end_date && job.end_date < end)) return false;
    const history = events.filter((event) => event.job_id === job.id);
    const atStart = history.filter((event) => event.effective_from <= month).at(-1);
    return atStart?.status === 'active' &&
      !history.some((event) => event.effective_from >= month &&
        event.effective_from <= end && event.status !== 'active');
  });
  const partialJob = jobs.some((job) => job.start_date && job.start_date <= end &&
    (!job.end_date || job.end_date >= month) && !eligible.includes(job));
  if (partialJob || !eligible.length) return { policyApproved: true, proposal: null,
    reviewReason: 'Partial, paused, or unverified job status needs a signed payout policy.' };
  if (agreement.partnership === 'MIKI_REFERRAL_2_WAY') {
    const referrals = await unwrap(db.from('referrals').select('id,start_date,end_date')
      .eq('referred_owner_id', ownerId).eq('commission_basis_type', 'flat_per_active_job_month')
      .lte('start_date', month).or(`end_date.is.null,end_date.gte.${end}`));
    let verified = false;
    for (const referral of referrals) {
      const history = await unwrap(db.from('v2_referral_status_events')
        .select('active,effective_from,event_order').eq('referral_id', referral.id)
        .lte('effective_from', end).order('effective_from').order('event_order'));
      verified ||= history.filter((event) => event.effective_from <= month).at(-1)?.active === true &&
        !history.some((event) => event.effective_from >= month &&
          event.effective_from <= end && !event.active);
    }
    if (!verified) return { policyApproved: true, proposal: null,
      reviewReason: 'Verified referral did not cover the full calendar month.' };
  }
  if (!checks.length || checks.some((check) => check.status !== 'paid')) {
    return { policyApproved: true, proposal: null,
      reviewReason: 'Every expected paycheck in the month needs a reconciled receipt.' };
  }
  if (checks.some((check) => !eligible.some((job) => job.id === check.job_id))) {
    return { policyApproved: true, proposal: null,
      reviewReason: 'A received check belongs to a job without verified full-month status.' };
  }
  const corrections = [];
  for (let offset = 0; offset < checks.length; offset += 100) {
    corrections.push(...await allPages(() => db.from('v2_paycheck_corrections')
      .select('job_paycheck_id,sequence,snapshot_json')
      .in('job_paycheck_id', checks.slice(offset, offset + 100).map((check) => check.id))
      .order('sequence', { ascending: false })));
  }
  const latest = new Map();
  for (const correction of corrections) if (!latest.has(correction.job_paycheck_id))
    latest.set(correction.job_paycheck_id, correction);
  try {
    const proposal = settlementProposal({ ownerId, calendarMonth: month,
      agreementVersionId: agreement.id, partnership: agreement.partnership,
      activeJobCount: eligible.length,
      packageVersion: { ...PACKAGE_V1,
        fixedActualCents: Number(agreement.actual_apartment_monthly_cents),
        fixedQuotedCents: Number(agreement.quoted_apartment_monthly_cents) },
      paychecks: checks.map((check) => {
        const correction = latest.get(check.id);
        const fact = { ...check, ...correction?.snapshot_json };
        const cents = (key) => fact[key] == null ? null : Number(fact[key]);
        return { id: check.id, payDate: check.pay_date, status: check.status,
          receiptCorrectionSequence: correction?.sequence || 0,
          receipt: {
            actualGrossCents: cents('actual_gross_cents'),
            actualNetReceivedCents: cents('actual_net_received_cents'),
            federalWithheldCents: cents('federal_withheld_cents'),
            socialSecurityWithheldCents: cents('social_security_withheld_cents'),
            medicareWithheldCents: cents('medicare_withheld_cents'),
            additionalMedicareWithheldCents: cents('additional_medicare_withheld_cents'),
            stateWithheldCents: cents('state_withheld_cents'),
            otherDeductionsCents: cents('other_deductions_cents'),
          },
        };
      }),
    });
    if (proposal.needsLossDecision) return { policyApproved: true, proposal: null,
      reviewReason: 'Negative quoted net requires a signed loss or offset rule.' };
    return { policyApproved: true, policyId: policy.id, proposal };
  } catch (error) {
    return { policyApproved: true, proposal: null,
      reviewReason: 'Receipts or dated terms need review before settlement.' };
  }
}

async function postedRows(db, ownerId, month) {
  const settlements = await allPages(() => db.from('v2_payrun_settlements')
    .select('id,job_paycheck_id,batch_id,pay_date,source_net_cents,partner_due_cents,actual_cost_cents,commission_cents,gang_cut_cents,yerome_residual_cents,receipt_correction_sequence')
    .eq('owner_id', ownerId).gte('pay_date', month).lte('pay_date', monthEnd(month))
    .order('pay_date').order('id'));
  if (!settlements.length) return [];
  const ids = settlements.map((row) => row.id);
  const [payments, adjustments] = await Promise.all([
    allPages(() => db.from('v2_partner_payments').select('settlement_id,amount_cents,paid_at')
      .in('settlement_id', ids).order('paid_at')),
    allPages(() => db.from('v2_settlement_adjustments')
      .select('settlement_id,partner_due_delta_cents,after_tax_delta_cents,created_at,receipt_correction_id')
      .in('settlement_id', ids).order('created_at')),
  ]);
  return settlements.map((row) => {
    const paidCents = payments.filter((item) => item.settlement_id === row.id)
      .reduce((sum, item) => sum + Number(item.amount_cents), 0);
    const dueCents = Number(row.partner_due_cents) + adjustments
      .filter((item) => item.settlement_id === row.id)
      .reduce((sum, item) => sum + Number(item.partner_due_delta_cents), 0);
    return { settlementId: row.id, paycheckId: row.job_paycheck_id, payDate: row.pay_date,
      sourceNetCents: Number(row.source_net_cents), partnerDueCents: dueCents,
      paidCents, owedCents: dueCents - paidCents,
      actualCostCents: Number(row.actual_cost_cents), commissionCents: Number(row.commission_cents),
      gangCutCents: Number(row.gang_cut_cents), yeromeResidualCents: Number(row.yerome_residual_cents),
      receiptCorrectionSequence: row.receipt_correction_sequence };
  });
}

export default async function handler(req, res) {
  if (!['GET', 'POST'].includes(req.method)) return res.status(405).json({ error: 'Method not allowed.' });
  const auth = await requireAdmin(req);
  if (!auth.ok) return res.status(auth.status).json({ error: auth.error });
  const body = req.method === 'POST' ? await readJsonBody(req) : req.query || {};
  const ownerId = body.ownerId;
  const month = body.calendarMonth;
  if (!ownerId || !monthValid(month)) return res.status(400).json({ error: 'US Person and calendar month required.' });
  const db = adminClient();
  try {
    if (req.method === 'GET') {
      const [state, settlements] = await Promise.all([
        readMonth(db, ownerId, month), postedRows(db, ownerId, month),
      ]);
      res.setHeader('Cache-Control', 'private, no-store');
      return res.status(200).json({ ...state, settlements });
    }
    if (body.action === 'post') {
      if (!body.idempotencyKey || month >= currentMonth()) {
        return res.status(400).json({ error: 'Completed month and idempotency key required.' });
      }
      const state = await readMonth(db, ownerId, month);
      if (!state.proposal) return res.status(409).json({ error: state.reviewReason });
      const { data, error } = await db.rpc('v2_post_settlement_batch', {
        p_policy: state.policyId, p_snapshot: state.proposal,
        p_idempotency_key: body.idempotencyKey, p_actor: auth.user.id,
      });
      if (error) throw error;
      return res.status(201).json({ batchId: data });
    }
    if (body.action === 'payment') {
      const { data, error } = await db.rpc('v2_record_partner_payment', {
        p_settlement: body.settlementId, p_amount_cents: body.amountCents,
        p_paid_at: body.paidAt, p_reference: body.externalReference,
        p_key: body.idempotencyKey, p_actor: auth.user.id,
      });
      if (error) throw error;
      return res.status(201).json({ paymentId: data });
    }
    if (body.action === 'adjust') {
      const { data, error } = await db.rpc('v2_record_settlement_adjustment', {
        p_settlement: body.settlementId, p_after_tax_delta: body.afterTaxDeltaCents,
        p_actual_delta: body.actualCostDeltaCents, p_partner_delta: body.partnerDueDeltaCents,
        p_commission_delta: body.commissionDeltaCents, p_gang_delta: body.gangDeltaCents,
        p_yerome_delta: body.yeromeDeltaCents, p_correction: body.receiptCorrectionId || null,
        p_reason: body.reason, p_key: body.idempotencyKey, p_actor: auth.user.id,
      });
      if (error) throw error;
      return res.status(201).json({ adjustmentId: data });
    }
    return res.status(400).json({ error: 'Unsupported settlement action.' });
  } catch (error) {
    console.error('Settlement request failed', error?.code || 'unknown');
    return res.status(409).json({ error: 'Settlement needs receipt, agreement, policy, or history review.' });
  }
}
