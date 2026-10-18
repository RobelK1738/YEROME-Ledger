-- Owner portals consume allowlisted server DTOs. The legacy table policies
-- expose full rows (including private notes and old financial fields) to a
-- caller who bypasses the UI, so retire those direct reads in v2.
drop policy if exists owners_select_self on public.owners;
drop policy if exists jobs_owner_select on public.jobs;
drop policy if exists costs_owner_select on public.costs;
drop policy if exists cost_allocations_owner_select on public.cost_allocations;
drop policy if exists transfer_instructions_owner_select on public.transfer_instructions;
drop policy if exists job_paychecks_owner_select on public.job_paychecks;
drop policy if exists job_terms_owner_select on public.job_compensation_terms;
drop policy if exists pay_cycles_select_own_jobs on public.pay_cycles;

-- Existing Admin policies remain in effect. Owner statement and commission
-- endpoints fetch through the service role only after fresh identity checks.
