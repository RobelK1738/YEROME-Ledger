import { adminClient, requireAdmin, readJsonBody } from '../_lib/supabaseAdmin.js';
import { allPages } from '../_lib/v2.js';
import { PACKAGE_V1 } from '../../src/lib/finance-v2/index.js';
import { settlementProposal } from '../../src/lib/finance-v2/settlement.js';
import { adminPostedSettlementDto } from '../../src/lib/finance-v2/posted-settlement.js';
import { expectedPayDatesForMonth } from '../../src/lib/formatting/dates.js';

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
  const [events, checks, terms] = await Promise.all([
    allPages(() => db.from('v2_job_status_events').select('job_id,status,effective_from,event_order')
      .in('job_id', ids).lte('effective_from', end)
      .order('effective_from').order('event_order')),
    allPages(() => db.from('job_paychecks').select('id,job_id,pay_date,status,actual_gross_cents,actual_net_received_cents,federal_withheld_cents,social_security_withheld_cents,medicare_withheld_cents,additional_medicare_withheld_cents,state_withheld_cents,other_deductions_cents')
      .in('job_id', ids).gte('pay_date', month).lte('pay_date', end)
      .order('pay_date').order('id')),
    allPages(() => db.from('job_compensation_terms')
      .select('job_id,first_pay_date,pay_frequency,effective_from,effective_to')
      .in('job_id', ids).lte('effective_from', month)
      .or(`effective_to.is.null,effective_to.gte.${end}`).order('job_id')),
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
  const expected = new Set();
  for (const job of eligible) {
    const coveringTerms = terms.filter((term) => term.job_id === job.id);
    if (coveringTerms.length !== 1) return { policyApproved: true, proposal: null,
      reviewReason: `Job ${job.id} needs one verified pay calendar covering the full month.` };
    let dates;
    try { dates = expectedPayDatesForMonth(coveringTerms[0].first_pay_date, month,
      coveringTerms[0].pay_frequency); }
    catch (invalid) { return { policyApproved: true, proposal: null,
      reviewReason: `Job ${job.id}: ${invalid.message}` }; }
    if (!dates.length) return { policyApproved: true, proposal: null,
      reviewReason: `Job ${job.id} has no expected payday in this month; review the employer calendar.` };
    for (const date of dates) expected.add(`${job.id}:${date}`);
  }
  const received = new Set(checks.map((check) => `${check.job_id}:${check.pay_date}`));
  const missing = [...expected].filter((key) => !received.has(key));
  const unexpected = [...received].filter((key) => !expected.has(key));
  if (missing.length || unexpected.length) return { policyApproved: true, proposal: null,
    reviewReason: missing.length ? `Missing expected paycheck for ${missing[0].replace(':', ' on ')} (${missing.length} missing).` :
      `Paycheck ${unexpected[0].replace(':', ' on ')} is outside the recorded employer cadence.` };
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
    .select('id,job_paycheck_id,batch_id,pay_date,source_net_cents,quoted_cost_cents,partner_due_cents,actual_cost_cents,commission_cents,gang_cut_cents,yerome_residual_cents,receipt_correction_sequence')
    .eq('owner_id', ownerId).gte('pay_date', month).lte('pay_date', monthEnd(month))
    .order('pay_date').order('id'));
  if (!settlements.length) return [];
  const ids = settlements.map((row) => row.id);
  const [payments, adjustments] = await Promise.all([
    allPages(() => db.from('v2_partner_payments').select('settlement_id,amount_cents,paid_at,evidence_verified')
      .in('settlement_id', ids).order('paid_at')),
    allPages(() => db.from('v2_settlement_adjustments')
      .select('settlement_id,partner_due_delta_cents,after_tax_delta_cents,quoted_cost_delta_cents,actual_cost_delta_cents,commission_delta_cents,gang_delta_cents,yerome_delta_cents,created_at,receipt_correction_id')
      .in('settlement_id', ids).order('created_at')),
  ]);
  const paycheckIds = settlements.map((row) => row.job_paycheck_id);
  const corrections = [];
  const reconciled = [];
  for (let offset = 0; offset < paycheckIds.length; offset += 100) {
    corrections.push(...await allPages(() => db.from('v2_paycheck_corrections')
      .select('id,job_paycheck_id,sequence,reason,recorded_at')
      .in('job_paycheck_id', paycheckIds.slice(offset, offset + 100))
      .order('sequence')));
  }
  for (let offset = 0; offset < ids.length; offset += 100) {
    reconciled.push(...await allPages(() => db.from('v2_settlement_reconciliations')
      .select('correction_id').in('corrected_settlement_id', ids.slice(offset, offset + 100))
      .order('created_at')));
  }
  const reconciledIds = new Set(reconciled.map((item) => item.correction_id));
  return settlements.map((row) => {
    const posted = adminPostedSettlementDto(row,
      adjustments.filter((item) => item.settlement_id === row.id),
      payments.filter((item) => item.settlement_id === row.id));
    return { ...posted,
      pendingCorrections: corrections.filter((item) => item.job_paycheck_id === row.job_paycheck_id &&
        item.sequence > row.receipt_correction_sequence && !reconciledIds.has(item.id))
        .map((item) => ({ id: item.id, sequence: item.sequence, reason: item.reason,
          recordedAt: item.recorded_at })) };
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
      const amount = Number(body.amountCents);
      if (!body.transferId || !body.settlementId || !Number.isSafeInteger(amount) || amount <= 0 ||
          !String(body.idempotencyKey || '').trim()) {
        return res.status(400).json({ error: 'Verified transfer, obligation, positive amount and request key required.' });
      }
      const { data, error } = await db.rpc('v2_record_partner_allocation', {
        p_settlement: body.settlementId, p_amount_cents: amount,
        p_transfer: body.transferId, p_key: body.idempotencyKey, p_actor: auth.user.id,
      });
      if (error) throw error;
      return res.status(201).json({ paymentId: data });
    }
    if (body.action === 'reconcile') {
      if (!body.settlementId || !body.receiptCorrectionId || !body.idempotencyKey) {
        return res.status(400).json({ error: 'Posted settlement, correction and idempotency key required.' });
      }
      const { data, error } = await db.rpc('v2_reconcile_settlement_correction', {
        p_settlement: body.settlementId, p_correction: body.receiptCorrectionId,
        p_key: body.idempotencyKey, p_actor: auth.user.id,
      });
      if (error) throw error;
      return res.status(201).json({ reconciliationId: data });
    }
    return res.status(400).json({ error: 'Unsupported settlement action.' });
  } catch (error) {
    console.error('Settlement request failed', error?.code || 'unknown');
    if (error?.message === 'Transfer beneficiary does not match obligation')
      return res.status(409).json({ error: 'This transfer was sent to another recipient. Choose a verified transfer to the person owed.' });
    if (error?.message === 'Transfer must be verified against external evidence before allocation')
      return res.status(409).json({ error: 'Verify the transfer against external evidence before allocating it.' });
    if (body.action === 'payment') {
      if (error?.message?.includes('External reference collision'))
        return res.status(409).json({ error: 'Bank reference conflicts with recorded transfer evidence. Independent review is required.' });
      if (error?.message?.includes('External transfer already fully allocated') || error?.code === '23505')
        return res.status(409).json({ error: 'This bank transfer is already allocated to this obligation or has no remaining amount.' });
    }
    return res.status(409).json({ error: 'Settlement needs receipt, agreement, policy, or history review.' });
  }
}
