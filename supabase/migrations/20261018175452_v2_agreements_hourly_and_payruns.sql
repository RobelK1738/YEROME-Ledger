-- v2 records are prospective. Legacy partnership rows are deliberately left
-- unverified; an Admin must match each person to a written agreement.
alter table public.owners add column if not exists v2_partnership text
  check (v2_partnership in ('DIRECT_2_WAY', 'MIKI_REFERRAL_2_WAY'));
alter table public.owners add column if not exists agreement_verified_at timestamptz;
alter table public.owners add column if not exists agreement_reference text;

create table public.person_apartments (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.owners(id) on delete restrict,
  actual_monthly_cents bigint not null default 65000 check (actual_monthly_cents >= 0),
  quoted_monthly_cents bigint not null default 90000 check (quoted_monthly_cents >= 0),
  lease_active boolean not null default true,
  effective_from date not null,
  effective_to date,
  agreement_reference text,
  created_at timestamptz not null default now(),
  check (effective_to is null or effective_to >= effective_from)
);
create unique index person_apartments_one_active_per_owner
  on public.person_apartments(owner_id) where lease_active and effective_to is null;

create table public.v2_agreement_versions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.owners(id) on delete restrict,
  partnership text not null check (partnership in ('DIRECT_2_WAY','MIKI_REFERRAL_2_WAY')),
  actual_apartment_monthly_cents bigint not null check (actual_apartment_monthly_cents >= 0),
  quoted_apartment_monthly_cents bigint not null check (quoted_apartment_monthly_cents >= 0),
  agreement_reference text not null,
  verified_at timestamptz,
  effective_from date not null,
  effective_to date,
  created_at timestamptz not null default now(),
  created_by uuid,
  check (effective_to is null or effective_to >= effective_from)
);
create unique index v2_agreement_one_current on public.v2_agreement_versions(owner_id)
  where effective_to is null;
alter table public.v2_agreement_versions enable row level security;
create policy v2_agreement_admin_all on public.v2_agreement_versions
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
grant select, insert, update on public.v2_agreement_versions to authenticated;
alter table public.person_apartments enable row level security;
create policy person_apartments_admin_all on public.person_apartments
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
-- The agreed apartment charge is sent only through the owner statement DTO;
-- this table also contains private actual rent.
grant select, insert, update on public.person_apartments to authenticated;

create table public.job_compensation_terms (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete restrict,
  effective_from date not null,
  effective_to date,
  mode text not null check (mode in ('hourly', 'salary')),
  hourly_rate_cents bigint check (hourly_rate_cents >= 0),
  expected_weekly_hours numeric(8,3) check (expected_weekly_hours >= 0),
  annual_salary_cents bigint check (annual_salary_cents >= 0),
  pay_frequency text not null check (pay_frequency in ('weekly','biweekly','semimonthly','monthly')),
  first_pay_date date,
  periods_per_year integer check (periods_per_year > 0),
  created_at timestamptz not null default now(),
  created_by uuid,
  check (effective_to is null or effective_to >= effective_from),
  check ((mode = 'hourly' and hourly_rate_cents is not null and expected_weekly_hours is not null and annual_salary_cents is null)
      or (mode = 'salary' and annual_salary_cents is not null and hourly_rate_cents is null and expected_weekly_hours is null))
);
create index job_compensation_terms_job_date on public.job_compensation_terms(job_id, effective_from desc);
create unique index job_compensation_terms_one_current
  on public.job_compensation_terms(job_id) where effective_to is null;
alter table public.job_compensation_terms enable row level security;
create policy job_terms_admin_all on public.job_compensation_terms
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy job_terms_owner_select on public.job_compensation_terms
  for select to authenticated using (job_id in (select public.current_owner_job_ids()));
grant select, insert, update on public.job_compensation_terms to authenticated;

-- Real paystub facts are recorded independently from tax estimates. A paid
-- status on an old row is not automatically promoted into a v2 settlement.
alter table public.job_paychecks
  add column if not exists actual_gross_cents bigint check (actual_gross_cents >= 0),
  add column if not exists actual_hours numeric(9,3) check (actual_hours >= 0),
  add column if not exists federal_withheld_cents bigint check (federal_withheld_cents >= 0),
  add column if not exists social_security_withheld_cents bigint check (social_security_withheld_cents >= 0),
  add column if not exists medicare_withheld_cents bigint check (medicare_withheld_cents >= 0),
  add column if not exists additional_medicare_withheld_cents bigint check (additional_medicare_withheld_cents >= 0),
  add column if not exists state_withheld_cents bigint check (state_withheld_cents >= 0),
  add column if not exists other_deductions_cents bigint check (other_deductions_cents >= 0),
  add column if not exists received_at timestamptz;

create table public.v2_payrun_settlements (
  id uuid primary key default gen_random_uuid(),
  job_paycheck_id uuid not null unique references public.job_paychecks(id) on delete restrict,
  owner_id uuid not null references public.owners(id) on delete restrict,
  calculation_version text not null,
  snapshot_json jsonb not null,
  settled_at timestamptz not null default now(),
  settled_by uuid not null
);
alter table public.v2_payrun_settlements enable row level security;
create policy v2_settlements_admin_select on public.v2_payrun_settlements
  for select to authenticated using (public.is_admin());
create policy v2_settlements_admin_insert on public.v2_payrun_settlements
  for insert to authenticated with check (public.is_admin());
grant select, insert on public.v2_payrun_settlements to authenticated;

create function private.reject_v2_settlement_change() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'A settled pay run is immutable; post an adjustment instead' using errcode = '23514';
end;
$$;
create trigger v2_settlements_immutable before update or delete on public.v2_payrun_settlements
  for each row execute function private.reject_v2_settlement_change();
create function private.reject_settled_paycheck_change() returns trigger
language plpgsql set search_path = '' as $$
begin
  if exists (select 1 from public.v2_payrun_settlements where job_paycheck_id = old.id) then
    raise exception 'A settled paycheck is immutable; post an adjustment instead' using errcode = '23514';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;
create trigger v2_paycheck_settlement_guard before update or delete on public.job_paychecks
  for each row execute function private.reject_settled_paycheck_change();

create table public.v2_settlement_adjustments (
  id uuid primary key default gen_random_uuid(),
  settlement_id uuid not null references public.v2_payrun_settlements(id) on delete restrict,
  reason text not null check (length(trim(reason)) > 0),
  change_json jsonb not null,
  created_at timestamptz not null default now(),
  created_by uuid not null
);
alter table public.v2_settlement_adjustments enable row level security;
create policy v2_adjustments_admin_select on public.v2_settlement_adjustments
  for select to authenticated using (public.is_admin());
create policy v2_adjustments_admin_insert on public.v2_settlement_adjustments
  for insert to authenticated with check (public.is_admin());
grant select, insert on public.v2_settlement_adjustments to authenticated;
create trigger v2_adjustments_immutable before update or delete on public.v2_settlement_adjustments
  for each row execute function private.reject_v2_settlement_change();

-- Archive obsolete historical fields before removing them from all live DTOs.
create table public.legacy_reserve_archive (
  id bigint generated always as identity primary key,
  source_table text not null,
  source_key text not null,
  historical_json jsonb not null,
  archived_at timestamptz not null default now()
);
alter table public.legacy_reserve_archive enable row level security;
create policy legacy_archive_admin_select on public.legacy_reserve_archive
  for select to authenticated using (public.is_admin());
grant select on public.legacy_reserve_archive to authenticated;
insert into public.legacy_reserve_archive(source_table, source_key, historical_json)
  select 'owners', id::text, jsonb_build_object('safety_reserve_rate', safety_reserve_rate)
  from public.owners where safety_reserve_rate is not null;
insert into public.legacy_reserve_archive(source_table, source_key, historical_json)
  select 'jobs', id::text, jsonb_build_object('safety_reserve_rate', safety_reserve_rate)
  from public.jobs where safety_reserve_rate is not null;
insert into public.legacy_reserve_archive(source_table, source_key, historical_json)
  select 'paycheck_entries', id::text, jsonb_build_object('safety_reserve_cents', safety_reserve_cents)
  from public.paycheck_entries where safety_reserve_cents <> 0;
insert into public.legacy_reserve_archive(source_table, source_key, historical_json)
  select 'business_settings', id::text, jsonb_build_object('gang_reserve_rate', gang_reserve_rate)
  from public.business_settings;
insert into public.legacy_reserve_archive(source_table, source_key, historical_json)
  select 'transfer_instructions', id::text, to_jsonb(t)
  from public.transfer_instructions t
  where label ilike '%safety reserve%' or label ilike '%safety deposit%';
update public.transfer_instructions set active = false
  where label ilike '%safety reserve%' or label ilike '%safety deposit%';
alter table public.owners drop column safety_reserve_rate;
alter table public.jobs drop column safety_reserve_rate;
alter table public.paycheck_entries drop column safety_reserve_cents;
alter table public.business_settings drop column gang_reserve_rate;
update public.business_settings set gang_cut_rate = 0.10;
alter table public.business_settings add constraint v2_gang_cut_exact check (gang_cut_rate = 0.10);
drop function if exists public.owner_financials(uuid, integer);

-- Server functions use service_role after fresh Admin authentication. Grant
-- explicitly because new Supabase projects may not auto-expose new tables.
grant select, insert, update, delete on public.person_apartments,
  public.v2_agreement_versions, public.job_compensation_terms,
  public.v2_payrun_settlements, public.v2_settlement_adjustments,
  public.legacy_reserve_archive to service_role;
grant usage, select on sequence public.legacy_reserve_archive_id_seq to service_role;
