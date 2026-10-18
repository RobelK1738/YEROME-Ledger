import { adminClient, requireAdmin, readJsonBody, serverAudit } from '../_lib/supabaseAdmin.js';
import { generatePayDates } from '../../src/lib/formatting/dates.js';

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
        .select('id,pay_frequency').eq('id', body.jobId).single();
      if (jobError) throw jobError;
      const dates = generatePayDates(body.firstPayDate, count, job.pay_frequency);
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
    const patch = {};
    for (const [input, column] of Object.entries(INPUT_FIELDS)) {
      if (body[input] == null || body[input] === '') continue;
      const number = Number(body[input]);
      const valid = input === 'actualHours'
        ? Number.isFinite(number) && number >= 0
        : Number.isSafeInteger(number) && number >= 0;
      if (!valid) return res.status(400).json({ error: `Invalid ${input}.` });
      patch[column] = number;
    }
    if (patch.actual_gross_cents == null || patch.actual_net_received_cents == null) {
      return res.status(400).json({ error: 'Record actual gross and net deposit.' });
    }
    patch.status = 'paid';
    patch.received_at = new Date().toISOString();
    const { data, error } = await db.from('job_paychecks').update(patch)
      .eq('id', body.paycheckId).select('id,job_id,pay_date,status,received_at').single();
    if (error) throw error;
    await serverAudit(db, { actorUserId: auth.user.id, action: 'v2.paycheck.received',
      entityType: 'job_paycheck', entityId: data.id,
      metadata: { job_id: data.job_id, pay_date: data.pay_date } });
    return res.status(200).json({ paycheck: data });
  } catch (error) {
    console.error('Admin paycheck operation failed', error?.code || 'unknown');
    return res.status(400).json({ error: 'Could not save the pay run.' });
  }
}
