import { adminClient, requireAdmin, readJsonBody } from '../_lib/supabaseAdmin.js';
import { validISODate } from '../../src/lib/finance-v2/allocation-plan.js';

const FREQUENCIES = new Set(['weekly', 'biweekly', 'monthly']);

function money(value) {
  if (value == null || value === '') return null;
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 0 ? number : null;
}

function terms(body) {
  const mode = body.mode;
  const rate = mode === 'hourly' ? money(body.hourlyRateCents) : null;
  const hours = mode === 'hourly' && body.expectedWeeklyHours != null && body.expectedWeeklyHours !== '' ? Number(body.expectedWeeklyHours) : null;
  const salary = mode === 'salary' ? money(body.annualSalaryCents) : null;
  const periods = Number(body.periodsPerYear || 26);
  if (!['hourly', 'salary'].includes(mode) || !FREQUENCIES.has(body.payFrequency) ||
      !validISODate(body.firstPayDate) ||
      !Number.isInteger(periods) || periods <= 0 || periods > 53 ||
      (mode === 'hourly' && (rate === null || hours === null || !Number.isFinite(hours) || hours < 0)) ||
      (mode === 'salary' && salary === null)) return null;
  return {
    p_mode: mode,
    p_hourly_rate_cents: rate,
    p_weekly_hours: hours,
    p_annual_salary_cents: salary,
    p_pay_frequency: body.payFrequency,
    p_first_pay_date: body.firstPayDate,
    p_periods_per_year: periods,
  };
}

export default async function handler(req, res) {
  if (!['POST', 'PATCH'].includes(req.method)) return res.status(405).json({ error: 'Method not allowed.' });
  const auth = await requireAdmin(req);
  if (!auth.ok) return res.status(auth.status).json({ error: auth.error });
  const body = await readJsonBody(req);
  const db = adminClient();
  try {
    if (req.method === 'POST' || ['save', 'change_terms'].includes(body.action)) {
      const input = terms(body);
      if (!input || !body.ownerId || !String(body.employerName || '').trim() ||
        (req.method === 'PATCH' && !body.jobId) || (body.startDate && !validISODate(body.startDate))) {
        return res.status(400).json({ error: 'Enter the owner, employer, pay details and first pay date.' });
      }
      const { data, error } = await db.rpc('v3_save_job', {
        p_job: req.method === 'POST' ? null : body.jobId,
        p_owner: body.ownerId, p_employer: String(body.employerName).trim(),
        p_role_title: body.roleTitle || null, p_start_date: body.startDate || null,
        p_details: { mode: input.p_mode, hourly_rate_cents: input.p_hourly_rate_cents,
          expected_weekly_hours: input.p_weekly_hours, annual_salary_cents: input.p_annual_salary_cents,
          pay_frequency: input.p_pay_frequency, first_pay_date: input.p_first_pay_date,
          periods_per_year: input.p_periods_per_year },
        p_actor: auth.user.id,
      });
      if (error) throw error;
      return res.status(req.method === 'POST' ? 201 : 200).json({ jobId: data });
    }
    if (!body.jobId) return res.status(400).json({ error: 'Job ID required.' });
    if (['end', 'pause', 'resume'].includes(body.action)) {
      const status = { end: 'ended', pause: 'paused', resume: 'active' }[body.action];
      const { data, error } = await db.rpc('v2_change_job_status', {
        p_job: body.jobId, p_status: status,
        p_effective_from: body.effectiveFrom || body.endDate || new Date().toISOString().slice(0, 10),
        p_actor: auth.user.id,
      });
      if (error) throw error;
      return res.status(200).json({ statusEventId: data });
    }
    return res.status(400).json({ error: 'Unsupported job action.' });
  } catch (error) {
    console.error('Admin job operation failed', error?.code || 'unknown');
    return res.status(400).json({ error: 'Could not save the job. Check the pay details and dates.' });
  }
}
