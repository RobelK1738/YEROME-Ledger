import { adminClient, requireAdmin, readJsonBody, serverAudit } from '../_lib/supabaseAdmin.js';
import { generateScheduledPayDates } from '../../src/lib/formatting/dates.js';
import { validatedReceipt } from '../../src/lib/finance-v2/receipt.js';

const INPUT_FIELDS = {
  actualGrossCents: 'actual_gross_cents',
  actualNetReceivedCents: 'actual_net_received_cents',
  actualHours: 'actual_hours',
  federalWithheldCents: 'federal_withheld_cents',
  socialSecurityWithheldCents: 'social_security_withheld_cents',
  medicareWithheldCents: 'medicare_withheld_cents',
  additionalMedicareWithheldCents: 'additional_medicare_withheld_cents',
  stateWithheldCents: 'state_withheld_cents',
  otherDeductionsCents: 'other_deductions_cents',
};

export default async function handler(req, res) {
  if (!['POST', 'PATCH'].includes(req.method)) return res.status(405).json({ error: 'Method not allowed.' });
  const auth = await requireAdmin(req);
  if (!auth.ok) return res.status(auth.status).json({ error: auth.error });
  const body = await readJsonBody(req);
  const db = adminClient();
  try {
    if (req.method === 'POST') {
      const count = Number(body.count);
      if (!body.jobId || !body.firstPayDate || !Number.isInteger(count) || count < 1 || count > 52) {
        return res.status(400).json({ error: 'Choose a job, first pay date and 1–52 dates.' });
      }
      const { data: job, error: jobError } = await db.from('jobs')
        .select('id').eq('id', body.jobId).single();
      if (jobError) throw jobError;
      const { data: term, error: termError } = await db.from('job_compensation_terms')
        .select('first_pay_date,pay_frequency').eq('job_id', job.id)
        .is('effective_to', null).single();
      if (termError) throw termError;
      let dates;
      try { dates = generateScheduledPayDates(term.first_pay_date, body.firstPayDate,
        count, term.pay_frequency); }
      catch (invalid) { return res.status(400).json({ error: invalid.message }); }
      const rows = dates.map((date) => ({ job_id: job.id, pay_date: date, status: 'scheduled' }));
      const { error } = await db.from('job_paychecks').upsert(rows,
        { onConflict: 'job_id,pay_date', ignoreDuplicates: true });
      if (error) throw error;
      await serverAudit(db, { actorUserId: auth.user.id, action: 'v2.pay_schedule.generated',
        entityType: 'job', entityId: job.id, metadata: { count: dates.length,
          first_pay_date: dates[0], last_pay_date: dates.at(-1) } });
      return res.status(200).json({ scheduledDates: dates.length });
    }
    if (!body.paycheckId) return res.status(400).json({ error: 'Paycheck ID required.' });
    let receipt;
    try { receipt = validatedReceipt(body); }
    catch (invalid) { return res.status(400).json({ error: invalid.message }); }
    const snapshot = {};
    for (const [input, column] of Object.entries(INPUT_FIELDS)) {
      if (receipt[input] != null) snapshot[column] = receipt[input];
    }
    const correctionReason = body.action === 'correct' ? String(body.reason || '').trim() : null;
    if (body.action === 'correct' && !correctionReason) {
      return res.status(400).json({ error: 'A correction reason is required.' });
    }
    const { data, error } = await db.rpc('v2_record_receipt', {
      p_paycheck: body.paycheckId, p_snapshot: snapshot,
      p_actor: auth.user.id, p_reason: correctionReason,
    });
    if (error) throw error;
    return res.status(200).json({ paycheckId: body.paycheckId, correctionSequence: data });
  } catch (error) {
    console.error('Admin paycheck operation failed', error?.code || 'unknown');
    return res.status(400).json({ error: 'Could not save the pay run.' });
  }
}
