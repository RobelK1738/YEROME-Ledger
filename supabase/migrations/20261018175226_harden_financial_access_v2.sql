-- First v2 security gate. Existing commercial/financial rows remain untouched.
-- The three caller-supplied owner RPCs are withdrawn pending replacement by
-- allowlisted statements. Direct table RLS continues to apply.
revoke execute on all functions in schema public from public, anon, authenticated;
-- Global default ACL must be changed too: a per-schema REVOKE alone does not
-- cancel PostgreSQL's built-in PUBLIC EXECUTE default for future functions.
alter default privileges revoke execute on functions from public;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;

-- RLS predicates need these helpers; each derives its answer from auth.uid().
grant execute on function public.is_admin() to authenticated;
grant execute on function public.current_owner_id() to authenticated;
grant execute on function public.current_owner_job_ids() to authenticated;
grant execute on function public.current_owner_allocated_cost_ids() to authenticated;
grant execute on function public.current_owner_referral_ids() to authenticated;
grant execute on function public.cost_is_owner_visible(uuid) to authenticated;
grant execute on function public.federal_tax_cents(bigint, jsonb) to authenticated;
grant execute on function public.cost_annual_cents(bigint, text) to authenticated;

-- Old public SECURITY DEFINER functions with arbitrary owner IDs remain in the
-- schema for historical dependencies, but cannot be called by browser roles.
-- Revoke from PUBLIC as well as authenticated: the latter inherits PUBLIC.

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;
create function private.current_owner_pay_cycle_ids()
returns setof uuid language sql stable security definer set search_path = ''
as $$
  select distinct pe.pay_cycle_id
  from public.paycheck_entries pe
  join public.jobs j on j.id = pe.job_id
  where j.owner_id = public.current_owner_id();
$$;
revoke execute on function private.current_owner_pay_cycle_ids() from public, anon;
grant execute on function private.current_owner_pay_cycle_ids() to authenticated;

drop policy if exists pay_cycles_select_auth on public.pay_cycles;
create policy pay_cycles_select_own_jobs on public.pay_cycles
  for select to authenticated
  using (id in (select private.current_owner_pay_cycle_ids()));

-- Legacy entry snapshots include internal instructions and obsolete calculation
-- fields. Owners use job_paychecks until a narrow v2 statement endpoint exists.
drop policy if exists paycheck_entries_owner_select on public.paycheck_entries;

-- Referral rows carry internal notes and legacy percentage bases. Read-only
-- referrers receive only an allowlisted aggregate from the RPC below.
drop policy if exists referrals_owner_select on public.referrals;
drop policy if exists referral_jobs_owner_select on public.referral_jobs;

alter table public.referrals
  add column if not exists name_visible_to_referrer boolean not null default false;
alter table public.referrals
  alter column commission_rate set default 0,
  alter column flat_amount_cents set default 20000,
  alter column commission_basis_type set default 'flat_per_active_job_month';
alter table public.referrals drop constraint if exists referrals_commission_basis_type_check;
alter table public.referrals add constraint referrals_commission_basis_type_check
  check (commission_basis_type in (
    'flat_per_active_job_month', 'referred_gross_wages',
    'referred_distributable', 'selected_jobs', 'flat_per_paycheck', 'custom_manual'
  ));
create unique index referrals_one_active_v2_referrer_per_person
  on public.referrals(referred_owner_id)
  where active and commission_basis_type = 'flat_per_active_job_month';

-- No legacy percentage referral is silently remapped to the new contract.
-- Private implementation performs an identity check before reading other
-- accounts' job counts. It returns no wages, quoted cost, or internal spend.
drop function if exists public.owner_earned_commissions(uuid, integer);
create function private.owner_earned_commissions_v2(p_owner uuid, p_year integer)
returns table (
  referral_id uuid,
  referred_owner_id uuid,
  referred_display_name text,
  commission_basis_type text,
  eligible_job_count bigint,
  monthly_rate_per_job_cents bigint,
  monthly_commission_cents bigint,
  annual_commission_cents bigint,
  active boolean,
  requires_review boolean
)
language plpgsql stable security definer set search_path = ''
as $$
declare v_owner uuid;
begin
  v_owner := coalesce(p_owner, public.current_owner_id());
  if auth.uid() is null or v_owner is null then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if not public.is_admin() and v_owner is distinct from public.current_owner_id() then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  return query
    select r.id,
           case when public.is_admin() or r.name_visible_to_referrer then r.referred_owner_id else null::uuid end,
           case when public.is_admin() or r.name_visible_to_referrer then o.display_name else 'Referred US Person' end,
           r.commission_basis_type,
           count(j.id)::bigint,
           case when r.commission_basis_type = 'flat_per_active_job_month' then coalesce(r.flat_amount_cents, 20000) else 0 end,
           case when r.active and r.commission_basis_type = 'flat_per_active_job_month'
             then count(j.id)::bigint * coalesce(r.flat_amount_cents, 20000) else 0 end,
           case when r.active and r.commission_basis_type = 'flat_per_active_job_month'
             then count(j.id)::bigint * coalesce(r.flat_amount_cents, 20000) * 12 else 0 end,
           r.active,
           r.commission_basis_type <> 'flat_per_active_job_month'
    from public.referrals r
    join public.owners o on o.id = r.referred_owner_id
    left join public.jobs j on j.owner_id = r.referred_owner_id and j.status = 'active'
      and j.start_date <= current_date and (j.end_date is null or j.end_date >= current_date)
    where r.referrer_owner_id = v_owner
      and r.commission_basis_type = 'flat_per_active_job_month'
      and r.active
    group by r.id, o.display_name;
end;
$$;
revoke execute on function private.owner_earned_commissions_v2(uuid, integer) from public, anon;
grant execute on function private.owner_earned_commissions_v2(uuid, integer) to authenticated;

create function public.owner_earned_commissions(p_owner uuid default null, p_year integer default 2026)
returns table (
  referral_id uuid,
  referred_owner_id uuid,
  referred_display_name text,
  commission_basis_type text,
  eligible_job_count bigint,
  monthly_rate_per_job_cents bigint,
  monthly_commission_cents bigint,
  annual_commission_cents bigint,
  active boolean,
  requires_review boolean
)
language sql stable security invoker set search_path = ''
as $$
  select * from private.owner_earned_commissions_v2(p_owner, p_year);
$$;
revoke execute on function public.owner_earned_commissions(uuid, integer) from public, anon;
grant execute on function public.owner_earned_commissions(uuid, integer) to authenticated;
