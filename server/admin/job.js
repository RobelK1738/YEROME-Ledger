import { adminClient, requireAdmin, readJsonBody } from '../_lib/supabaseAdmin.js';

const FREQUENCIES = new Set(['weekly', 'biweekly', 'monthly']);
const STATUSES = new Set(['pending', 'active', 'paused', 'ended', 'archived']);

function money(value) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 0 ? number : null;
}

function terms(body) {
  const mode = body.mode;
  const rate = mode === 'hourly' ? money(body.hourlyRateCents) : null;
  const hours = mode === 'hourly' ? Number(body.expectedWeeklyHours) : null;
  const salary = mode === 'salary' ? money(body.annualSalaryCents) : null;
  const periods = Number(body.periodsPerYear || 26);
  if (!['hourly', 'salary'].includes(mode) || !FREQUENCIES.has(body.payFrequency) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(body.firstPayDate || '') ||
      !Number.isInteger(periods) || periods <= 0 ||
      (mode === 'hourly' && (rate === null || !Number.isFinite(hours) || hours < 0)) ||
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
    if (req.method === 'POST') {
      const input = terms(body);
      if (!input || !body.ownerId || !String(body.employerName || '').trim() || !body.effectiveFrom) {
        return res.status(400).json({ error: 'Complete the US Person, employer and pay terms.' });
      }
      const { data, error } = await db.rpc('v2_create_job', {
        p_owner: body.ownerId,
        p_employer: String(body.employerName).trim(),
        p_role_title: body.roleTitle || null,
        p_status: STATUSES.has(body.status) ? body.status : 'active',
        p_start_date: body.startDate || null,
        p_end_date: body.endDate || null,
        p_effective_from: body.effectiveFrom,
        ...input,
        p_actor: auth.user.id,
      });
      if (error) throw error;
      return res.status(201).json({ jobId: data });
    }
    if (!body.jobId) return res.status(400).json({ error: 'Job ID required.' });
    if (body.action === 'change_terms') {
      const input = terms(body);
      if (!input || !body.effectiveFrom) return res.status(400).json({ error: 'Complete the new pay terms.' });
      const { data, error } = await db.rpc('v2_change_job_terms', {
        p_job: body.jobId, p_effective_from: body.effectiveFrom, ...input, p_actor: auth.user.id,
      });
      if (error) throw error;
      return res.status(200).json({ termId: data });
    }
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
    return res.status(400).json({ error: 'Could not save the job. Review terms and dates.' });
  }
}
