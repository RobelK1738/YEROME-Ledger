-- Third review: independently derive completed-month paycheck obligations.
-- Existing semi-monthly terms and missing anchors remain in review; no dates
-- or policy approvals are invented during migration.
create function private.v2_block_new_semimonthly_term() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.pay_frequency = 'semimonthly' then
    raise exception 'Semi-monthly payroll needs two verified payday anchors';
  end if;
  return new;
end;
$$;
create trigger v2_block_new_semimonthly_term before insert on public.job_compensation_terms
  for each row execute function private.v2_block_new_semimonthly_term();

create function private.v2_expected_dates_for_job(p_job uuid,p_month date)
returns setof date language plpgsql stable set search_path = '' as $$
declare v_end date; v_term public.job_compensation_terms; v_count integer;
  v_step integer; v_date date; v_day integer;
begin
  if p_month is null or extract(day from p_month) <> 1 then
    raise exception 'Expected payroll month must begin on day one'; end if;
  v_end := (p_month + interval '1 month' - interval '1 day')::date;
  select count(*) into v_count from public.job_compensation_terms
    where job_id = p_job and effective_from <= p_month
      and (effective_to is null or effective_to >= v_end);
  if v_count <> 1 then raise exception 'One full-month pay term is required for each job'; end if;
  select * into v_term from public.job_compensation_terms
    where job_id = p_job and effective_from <= p_month
      and (effective_to is null or effective_to >= v_end);
  if v_term.first_pay_date is null then raise exception 'Verified first payday is required for each job'; end if;
  if v_term.pay_frequency = 'semimonthly' then
    raise exception 'Semi-monthly payroll needs two verified payday anchors'; end if;
  if v_term.pay_frequency = 'monthly' then
    if v_term.first_pay_date > v_end then return; end if;
    v_day := least(extract(day from v_term.first_pay_date)::integer,
      extract(day from v_end)::integer);
    v_date := make_date(extract(year from p_month)::integer,
      extract(month from p_month)::integer,v_day);
    if v_date >= v_term.first_pay_date then return next v_date; end if;
    return;
  end if;
  v_step := case v_term.pay_frequency when 'weekly' then 7 when 'biweekly' then 14 else 0 end;
  if v_step = 0 then raise exception 'Unsupported employer pay cadence'; end if;
  for v_date in select gs::date from pg_catalog.generate_series(
      v_term.first_pay_date::timestamp,v_end::timestamp,
      pg_catalog.make_interval(days => v_step)) gs
    where gs::date >= p_month loop
    return next v_date;
  end loop;
end;
$$;
revoke execute on function private.v2_expected_dates_for_job(uuid,date)
  from public,anon,authenticated;
grant execute on function private.v2_expected_dates_for_job(uuid,date) to service_role;

create function private.v2_verify_expected_paychecks() returns trigger
language plpgsql set search_path = '' as $$
declare v_month date; v_end date; v_owner uuid; v_job record; v_date date;
  v_check public.job_paychecks; v_expected integer := 0; v_job_expected integer;
  v_actual integer;
begin
  v_month := (new.snapshot_json->>'calendarMonth')::date;
  v_owner := (new.snapshot_json->>'ownerId')::uuid;
  v_end := (v_month + interval '1 month' - interval '1 day')::date;
  for v_job in select id from public.jobs where owner_id = v_owner
      and start_date <= v_month and (end_date is null or end_date >= v_end)
      order by id loop
    v_job_expected := 0;
    for v_date in select * from private.v2_expected_dates_for_job(v_job.id,v_month) loop
      v_job_expected := v_job_expected + 1;
      v_expected := v_expected + 1;
      select * into v_check from public.job_paychecks
        where job_id = v_job.id and pay_date = v_date for share;
      if not found or v_check.status <> 'paid' or not exists (
          select 1 from pg_catalog.jsonb_array_elements(new.snapshot_json->'lines') line
          where line->>'paycheckId' = v_check.id::text) then
        raise exception 'Missing expected paid paycheck for job % on %',v_job.id,v_date;
      end if;
    end loop;
    if v_job_expected = 0 then
      raise exception 'Job % has no expected payday in month; review employer calendar',v_job.id;
    end if;
  end loop;
  select count(*) into v_actual from public.job_paychecks c
    join public.jobs j on j.id = c.job_id
    where j.owner_id = v_owner and c.pay_date between v_month and v_end;
  if v_actual <> v_expected or
     pg_catalog.jsonb_array_length(new.snapshot_json->'lines') <> v_expected then
    raise exception 'Paycheck rows do not match the complete employer schedule';
  end if;
  return new;
end;
$$;
create trigger v2_verify_expected_paychecks before insert on public.v2_settlement_batches
  for each row execute function private.v2_verify_expected_paychecks();

-- One external transfer identity can fund several distinct obligations, but
-- one obligation can receive that transfer only once. Historical payments are
-- retained unlinked and their references are held for manual review.
create table public.v2_external_transfers (
  id uuid primary key default gen_random_uuid(),
  reference text not null check (length(btrim(reference)) > 0),
  reference_key text generated always as (lower(btrim(reference))) stored unique,
  total_cents bigint not null check (total_cents > 0),
  paid_at timestamptz not null,
  recorded_at timestamptz not null default now(),
  recorded_by uuid not null
);
alter table public.v2_external_transfers enable row level security;
create policy v2_external_transfers_admin_select on public.v2_external_transfers
  for select to authenticated using (public.is_admin());
grant select on public.v2_external_transfers to authenticated;
grant select,insert on public.v2_external_transfers to service_role;
create trigger v2_external_transfers_immutable before update or delete on public.v2_external_transfers
  for each row execute function private.reject_v2_settlement_change();

alter table public.v2_partner_payments add column transfer_id uuid
  references public.v2_external_transfers(id) on delete restrict;
alter table public.v2_commission_payments add column transfer_id uuid
  references public.v2_external_transfers(id) on delete restrict;
alter table public.v2_commission_payments add column idempotency_key text;
create unique index v2_partner_transfer_obligation_unique
  on public.v2_partner_payments(transfer_id,settlement_id) where transfer_id is not null;
create unique index v2_commission_transfer_obligation_unique
  on public.v2_commission_payments(transfer_id,accrual_id) where transfer_id is not null;
create unique index v2_commission_payment_idempotency_unique
  on public.v2_commission_payments(idempotency_key) where idempotency_key is not null;
alter table public.v2_partner_payments add constraint v2_new_partner_transfer_required
  check (transfer_id is not null) not valid;
alter table public.v2_commission_payments add constraint v2_new_commission_transfer_required
  check (transfer_id is not null and idempotency_key is not null
    and length(btrim(idempotency_key)) > 0) not valid;
revoke execute on function public.v2_record_partner_payment(uuid,bigint,timestamptz,text,text,uuid)
  from service_role,public,anon,authenticated;
revoke execute on function public.v2_record_commission_payment(uuid,bigint,timestamptz,text,uuid)
  from service_role,public,anon,authenticated;

create function private.v2_claim_external_transfer(p_reference text,p_total bigint,
  p_paid_at timestamptz,p_actor uuid)
returns uuid language plpgsql set search_path = '' as $$
declare v_transfer public.v2_external_transfers; v_reference text := btrim(p_reference);
begin
  if length(coalesce(v_reference,'')) = 0 or p_total is null or p_total <= 0
     or p_paid_at is null or p_actor is null then
    raise exception 'Complete external transfer evidence required'; end if;
  if exists (select 1 from public.v2_partner_payments
      where transfer_id is null and lower(btrim(external_reference)) = lower(v_reference))
     or exists (select 1 from public.v2_commission_payments
      where transfer_id is null and lower(btrim(payment_reference)) = lower(v_reference)) then
    raise exception 'External reference matches unreviewed historical payment'; end if;
  insert into public.v2_external_transfers(reference,total_cents,paid_at,recorded_by)
    values (v_reference,p_total,p_paid_at,p_actor)
    on conflict (reference_key) do nothing;
  select * into v_transfer from public.v2_external_transfers
    where reference_key = lower(v_reference) for update;
  if not found or v_transfer.total_cents <> p_total or v_transfer.paid_at <> p_paid_at then
    raise exception 'External reference collision needs independent evidence review'; end if;
  return v_transfer.id;
end;
$$;
revoke execute on function private.v2_claim_external_transfer(text,bigint,timestamptz,uuid)
  from public,anon,authenticated;
grant execute on function private.v2_claim_external_transfer(text,bigint,timestamptz,uuid)
  to service_role;

create function private.v2_guard_transfer_allocation() returns trigger
language plpgsql set search_path = '' as $$
declare v_transfer public.v2_external_transfers; v_allocated bigint; v_reference text;
begin
  if new.transfer_id is null then raise exception 'External transfer identity required'; end if;
  select * into v_transfer from public.v2_external_transfers
    where id = new.transfer_id for update;
  if not found then raise exception 'External transfer identity not found'; end if;
  v_reference := case when tg_table_name = 'v2_partner_payments'
    then to_jsonb(new)->>'external_reference' else to_jsonb(new)->>'payment_reference' end;
  if lower(btrim(v_reference)) <> v_transfer.reference_key
     or new.paid_at <> v_transfer.paid_at then
    raise exception 'Allocation must match external transfer evidence'; end if;
  select coalesce((select sum(amount_cents) from public.v2_partner_payments
      where transfer_id = new.transfer_id),0) +
    coalesce((select sum(amount_cents) from public.v2_commission_payments
      where transfer_id = new.transfer_id),0) into v_allocated;
  if v_allocated + new.amount_cents > v_transfer.total_cents then
    raise exception 'External transfer already fully allocated'; end if;
  return new;
end;
$$;
create trigger v2_partner_transfer_guard before insert on public.v2_partner_payments
  for each row execute function private.v2_guard_transfer_allocation();
create trigger v2_commission_transfer_guard before insert on public.v2_commission_payments
  for each row execute function private.v2_guard_transfer_allocation();

create function public.v2_record_partner_allocation(p_settlement uuid,p_amount_cents bigint,
  p_paid_at timestamptz,p_reference text,p_transfer_total bigint,p_key text,p_actor uuid)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare v_settlement public.v2_payrun_settlements; v_existing public.v2_partner_payments;
  v_transfer uuid; v_id uuid;
begin
  if length(btrim(coalesce(p_key,''))) = 0 or p_amount_cents is null or p_amount_cents <= 0 then
    raise exception 'Payment request key and positive allocation required'; end if;
  select * into v_existing from public.v2_partner_payments where idempotency_key = p_key;
  if found then
    if v_existing.transfer_id is null or v_existing.settlement_id <> p_settlement
       or v_existing.amount_cents <> p_amount_cents or v_existing.paid_at <> p_paid_at
       or lower(btrim(v_existing.external_reference)) <> lower(btrim(p_reference)) then
      raise exception 'Payment replay mismatch'; end if;
    select id into v_transfer from public.v2_external_transfers where id = v_existing.transfer_id
      and total_cents = p_transfer_total;
    if not found then raise exception 'Payment replay transfer mismatch'; end if;
    return v_existing.id;
  end if;
  select * into v_settlement from public.v2_payrun_settlements
    where id = p_settlement for update;
  if not found or v_settlement.batch_id is null or not exists (
      select 1 from public.v2_settlement_batches b
      join public.v2_settlement_policy_approvals policy on policy.id = b.policy_id
      where b.id = v_settlement.batch_id and policy.enabled) then
    raise exception 'Approved posted settlement required'; end if;
  v_transfer := private.v2_claim_external_transfer(p_reference,p_transfer_total,p_paid_at,p_actor);
  insert into public.v2_partner_payments(settlement_id,amount_cents,paid_at,
    external_reference,idempotency_key,recorded_by,transfer_id)
    values (p_settlement,p_amount_cents,p_paid_at,btrim(p_reference),btrim(p_key),
      p_actor,v_transfer) returning id into v_id;
  insert into public.audit_log(actor_user_id,action,entity_type,entity_id,metadata_json)
    values (p_actor,'v2.partner.payment_recorded','partner_payment',v_id,
      jsonb_build_object('settlement_id',p_settlement,'transfer_id',v_transfer,
        'amount_cents',p_amount_cents));
  return v_id;
end;
$$;
revoke execute on function public.v2_record_partner_allocation(uuid,bigint,timestamptz,text,bigint,text,uuid)
  from public,anon,authenticated;
grant execute on function public.v2_record_partner_allocation(uuid,bigint,timestamptz,text,bigint,text,uuid)
  to service_role;

create function public.v2_record_commission_allocation(p_accrual uuid,p_amount_cents bigint,
  p_paid_at timestamptz,p_reference text,p_transfer_total bigint,p_key text,p_actor uuid)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare v_accrual public.v2_commission_accruals; v_existing public.v2_commission_payments;
  v_paid bigint; v_transfer uuid; v_id uuid;
begin
  if length(btrim(coalesce(p_key,''))) = 0 or p_amount_cents is null or p_amount_cents <= 0 then
    raise exception 'Commission request key and positive allocation required'; end if;
  select * into v_existing from public.v2_commission_payments where idempotency_key = p_key;
  if found then
    if v_existing.transfer_id is null or v_existing.accrual_id <> p_accrual
       or v_existing.amount_cents <> p_amount_cents or v_existing.paid_at <> p_paid_at
       or lower(btrim(v_existing.payment_reference)) <> lower(btrim(p_reference)) then
      raise exception 'Commission payment replay mismatch'; end if;
    select id into v_transfer from public.v2_external_transfers where id = v_existing.transfer_id
      and total_cents = p_transfer_total;
    if not found then raise exception 'Commission replay transfer mismatch'; end if;
    return v_existing.id;
  end if;
  select * into v_accrual from public.v2_commission_accruals
    where id = p_accrual for update;
  if not found then raise exception 'Commission accrual not found'; end if;
  select coalesce(sum(amount_cents),0) into v_paid from public.v2_commission_payments
    where accrual_id = p_accrual;
  if v_paid + p_amount_cents > v_accrual.amount_cents then
    raise exception 'Payment exceeds accrued commission'; end if;
  v_transfer := private.v2_claim_external_transfer(p_reference,p_transfer_total,p_paid_at,p_actor);
  insert into public.v2_commission_payments(accrual_id,amount_cents,paid_at,
    payment_reference,recorded_by,transfer_id,idempotency_key)
    values (p_accrual,p_amount_cents,p_paid_at,btrim(p_reference),p_actor,
      v_transfer,btrim(p_key)) returning id into v_id;
  insert into public.audit_log(actor_user_id,action,entity_type,entity_id,metadata_json)
    values (p_actor,'v2.commission.payment_recorded','commission_payment',v_id,
      jsonb_build_object('accrual_id',p_accrual,'transfer_id',v_transfer,
        'amount_cents',p_amount_cents));
  return v_id;
end;
$$;
revoke execute on function public.v2_record_commission_allocation(uuid,bigint,timestamptz,text,bigint,text,uuid)
  from public,anon,authenticated;
grant execute on function public.v2_record_commission_allocation(uuid,bigint,timestamptz,text,bigint,text,uuid)
  to service_role;
