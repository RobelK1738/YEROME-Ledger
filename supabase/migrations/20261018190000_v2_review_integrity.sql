-- Review follow-up: immutable receipt corrections and dated job/referral status.
-- Existing records are not promoted into verified history or settlements.
create table public.v2_paycheck_corrections (
  id uuid primary key default gen_random_uuid(),
  job_paycheck_id uuid not null references public.job_paychecks(id) on delete restrict,
  sequence integer not null check (sequence > 0),
  snapshot_json jsonb not null,
  reason text not null check (length(trim(reason)) > 0),
  recorded_at timestamptz not null default now(),
  recorded_by uuid not null,
  unique(job_paycheck_id, sequence)
);
alter table public.v2_paycheck_corrections enable row level security;
create policy v2_receipt_corrections_admin_select on public.v2_paycheck_corrections
  for select to authenticated using (public.is_admin());
grant select on public.v2_paycheck_corrections to authenticated;
grant select, insert on public.v2_paycheck_corrections to service_role;
create trigger v2_receipt_corrections_immutable before update or delete on public.v2_paycheck_corrections
  for each row execute function private.reject_v2_settlement_change();

-- NOT VALID leaves legacy paid rows untouched; every new/updated row is checked.
alter table public.job_paychecks add constraint v2_paid_receipt_balanced check (
  status <> 'paid' or (
    actual_gross_cents is not null and actual_net_received_cents is not null
    and federal_withheld_cents is not null and social_security_withheld_cents is not null
    and medicare_withheld_cents is not null and additional_medicare_withheld_cents is not null
    and state_withheld_cents is not null and other_deductions_cents is not null
    and actual_gross_cents = actual_net_received_cents + federal_withheld_cents
      + social_security_withheld_cents + medicare_withheld_cents
      + additional_medicare_withheld_cents + state_withheld_cents + other_deductions_cents
  )
) not valid;

create function public.v2_record_receipt(p_paycheck uuid, p_snapshot jsonb,
  p_actor uuid, p_reason text default null)
returns integer language plpgsql security invoker set search_path = '' as $$
declare v_check public.job_paychecks; v_gross bigint; v_net bigint;
  v_federal bigint; v_ss bigint; v_medicare bigint; v_additional bigint;
  v_state bigint; v_other bigint; v_sequence integer;
begin
  if p_snapshot is null or not (p_snapshot ?& array[
    'actual_gross_cents','actual_net_received_cents','federal_withheld_cents',
    'social_security_withheld_cents','medicare_withheld_cents',
    'additional_medicare_withheld_cents','state_withheld_cents','other_deductions_cents']) then
    raise exception 'Complete paystub amounts required';
  end if;
  v_gross := (p_snapshot->>'actual_gross_cents')::bigint;
  v_net := (p_snapshot->>'actual_net_received_cents')::bigint;
  v_federal := (p_snapshot->>'federal_withheld_cents')::bigint;
  v_ss := (p_snapshot->>'social_security_withheld_cents')::bigint;
  v_medicare := (p_snapshot->>'medicare_withheld_cents')::bigint;
  v_additional := (p_snapshot->>'additional_medicare_withheld_cents')::bigint;
  v_state := (p_snapshot->>'state_withheld_cents')::bigint;
  v_other := (p_snapshot->>'other_deductions_cents')::bigint;
  if v_gross is null or v_net is null or v_federal is null or v_ss is null
     or v_medicare is null or v_additional is null or v_state is null or v_other is null
     or least(v_gross,v_net,v_federal,v_ss,v_medicare,v_additional,v_state,v_other) < 0
     or v_gross <> v_net + v_federal + v_ss + v_medicare + v_additional + v_state + v_other
     or (p_snapshot ? 'actual_hours' and
       (p_snapshot->>'actual_hours')::numeric < 0) then
    raise exception 'Paystub does not reconcile';
  end if;
  select * into v_check from public.job_paychecks where id = p_paycheck for update;
  if not found then raise exception 'Paycheck not found'; end if;
  if p_reason is null then
    if v_check.status <> 'scheduled' then raise exception 'Receipt already posted'; end if;
    update public.job_paychecks set status = 'paid', received_at = now(),
      actual_gross_cents = v_gross, actual_net_received_cents = v_net,
      federal_withheld_cents = v_federal, social_security_withheld_cents = v_ss,
      medicare_withheld_cents = v_medicare, additional_medicare_withheld_cents = v_additional,
      state_withheld_cents = v_state, other_deductions_cents = v_other,
      actual_hours = nullif(p_snapshot->>'actual_hours','')::numeric
      where id = p_paycheck;
    v_sequence := 0;
  else
    if v_check.status <> 'paid' or length(trim(p_reason)) = 0 then
      raise exception 'Correction requires a received paycheck and reason';
    end if;
    select coalesce(max(sequence),0) + 1 into v_sequence
      from public.v2_paycheck_corrections where job_paycheck_id = p_paycheck;
    if p_snapshot = coalesce((select snapshot_json from public.v2_paycheck_corrections
        where job_paycheck_id = p_paycheck order by sequence desc limit 1),
        jsonb_build_object('actual_gross_cents',v_check.actual_gross_cents,
          'actual_net_received_cents',v_check.actual_net_received_cents,
          'federal_withheld_cents',v_check.federal_withheld_cents,
          'social_security_withheld_cents',v_check.social_security_withheld_cents,
          'medicare_withheld_cents',v_check.medicare_withheld_cents,
          'additional_medicare_withheld_cents',v_check.additional_medicare_withheld_cents,
          'state_withheld_cents',v_check.state_withheld_cents,
          'other_deductions_cents',v_check.other_deductions_cents)) then
      raise exception 'Correction repeats current receipt';
    end if;
    insert into public.v2_paycheck_corrections(job_paycheck_id,sequence,snapshot_json,reason,recorded_by)
      values (p_paycheck,v_sequence,p_snapshot,trim(p_reason),p_actor);
  end if;
  insert into public.audit_log(actor_user_id,action,entity_type,entity_id,metadata_json)
    values (p_actor,case when v_sequence = 0 then 'v2.paycheck.received' else 'v2.paycheck.corrected' end,
      'job_paycheck',p_paycheck,jsonb_build_object('sequence',v_sequence,'pay_date',v_check.pay_date,
        'reason',p_reason));
  return v_sequence;
end;
$$;
revoke execute on function public.v2_record_receipt(uuid,jsonb,uuid,text)
  from public, anon, authenticated;
grant execute on function public.v2_record_receipt(uuid,jsonb,uuid,text) to service_role;

create table public.v2_job_status_events (
  id uuid primary key default gen_random_uuid(),
  event_order bigint generated always as identity unique,
  job_id uuid not null references public.jobs(id) on delete restrict,
  status text not null check (status in ('pending','active','paused','ended','archived')),
  effective_from date not null,
  recorded_at timestamptz not null default now(),
  recorded_by uuid
);
alter table public.v2_job_status_events enable row level security;
create policy v2_job_status_admin_select on public.v2_job_status_events
  for select to authenticated using (public.is_admin());
grant select on public.v2_job_status_events to authenticated;
grant select, insert on public.v2_job_status_events to service_role;
create trigger v2_job_status_immutable before update or delete on public.v2_job_status_events
  for each row execute function private.reject_v2_settlement_change();

-- A v2-created job obtains its first event with its pay terms in one transaction.
create function private.v2_seed_job_status() returns trigger language plpgsql set search_path = '' as $$
begin
  if not exists (select 1 from public.v2_job_status_events where job_id = new.job_id) then
    insert into public.v2_job_status_events(job_id,status,effective_from,recorded_by)
      select j.id,j.status,new.effective_from,new.created_by from public.jobs j where j.id = new.job_id;
  end if;
  return new;
end;
$$;
create trigger v2_seed_job_status after insert on public.job_compensation_terms
  for each row execute function private.v2_seed_job_status();
-- For preexisting terms, only today's forward state is known. Earlier status
-- history is deliberately left unverified and cannot earn automatic accrual.
insert into public.v2_job_status_events(job_id,status,effective_from)
  select j.id,j.status,greatest(current_date,min(t.effective_from))
    from public.jobs j join public.job_compensation_terms t on t.job_id = j.id
    where j.status in ('active','pending','paused') group by j.id,j.status;

create function public.v2_change_job_status(p_job uuid,p_status text,p_effective_from date,p_actor uuid)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare v_job public.jobs; v_last public.v2_job_status_events; v_id uuid;
begin
  select * into v_job from public.jobs where id = p_job for update;
  if not found or p_status not in ('active','paused','ended') or p_effective_from < current_date
     or p_effective_from is null then raise exception 'Invalid prospective job transition'; end if;
  select * into v_last from public.v2_job_status_events where job_id = p_job
    order by effective_from desc,event_order desc limit 1;
  if not found or p_effective_from < v_last.effective_from or v_last.status = 'ended'
     or v_last.status = p_status then raise exception 'Invalid job status history'; end if;
  insert into public.v2_job_status_events(job_id,status,effective_from,recorded_by)
    values (p_job,p_status,p_effective_from,p_actor) returning id into v_id;
  if p_effective_from = current_date then
    update public.jobs set status = p_status,
      end_date = case when p_status = 'ended' then p_effective_from else end_date end
      where id = p_job;
  elsif p_status = 'ended' then
    update public.jobs set end_date = p_effective_from where id = p_job;
  end if;
  insert into public.audit_log(actor_user_id,action,entity_type,entity_id,metadata_json)
    values (p_actor,'v2.job.status_changed','job',p_job,
      jsonb_build_object('status',p_status,'effective_from',p_effective_from));
  return v_id;
end;
$$;
revoke execute on function public.v2_change_job_status(uuid,text,date,uuid)
  from public, anon, authenticated;
grant execute on function public.v2_change_job_status(uuid,text,date,uuid) to service_role;

create table public.v2_referral_status_events (
  id uuid primary key default gen_random_uuid(),
  event_order bigint generated always as identity unique,
  referral_id uuid not null references public.referrals(id) on delete restrict,
  active boolean not null,
  effective_from date not null,
  recorded_at timestamptz not null default now(),
  recorded_by uuid
);
alter table public.v2_referral_status_events enable row level security;
create policy v2_referral_status_admin_select on public.v2_referral_status_events
  for select to authenticated using (public.is_admin());
grant select on public.v2_referral_status_events to authenticated;
grant select, insert on public.v2_referral_status_events to service_role;
create trigger v2_referral_status_immutable before update or delete on public.v2_referral_status_events
  for each row execute function private.reject_v2_settlement_change();
create function private.v2_seed_referral_status() returns trigger language plpgsql set search_path = '' as $$
begin
  if new.commission_basis_type = 'flat_per_active_job_month' then
    insert into public.v2_referral_status_events(referral_id,active,effective_from)
      values (new.id,new.active,coalesce(new.start_date,current_date));
  end if;
  return new;
end;
$$;
create trigger v2_seed_referral_status after insert on public.referrals
  for each row execute function private.v2_seed_referral_status();
insert into public.v2_referral_status_events(referral_id,active,effective_from)
  select id,active,greatest(current_date,coalesce(start_date,current_date))
  from public.referrals where commission_basis_type = 'flat_per_active_job_month';

create function public.v2_end_referral(p_referral uuid,p_effective_from date,p_actor uuid)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare v_ref public.referrals; v_last public.v2_referral_status_events; v_id uuid;
begin
  select * into v_ref from public.referrals where id = p_referral for update;
  select * into v_last from public.v2_referral_status_events where referral_id = p_referral
    order by effective_from desc,event_order desc limit 1;
  if not found or v_ref.commission_basis_type <> 'flat_per_active_job_month'
     or not v_last.active or p_effective_from is distinct from current_date
     or p_effective_from < v_last.effective_from or p_effective_from <= v_ref.start_date then
    raise exception 'Invalid prospective referral end';
  end if;
  insert into public.v2_referral_status_events(referral_id,active,effective_from,recorded_by)
    values (p_referral,false,p_effective_from,p_actor) returning id into v_id;
  update public.referrals set end_date = p_effective_from - 1,
    active = false where id = p_referral;
  insert into public.audit_log(actor_user_id,action,entity_type,entity_id,metadata_json)
    values (p_actor,'v2.referral.ended','referral',p_referral,
      jsonb_build_object('effective_from',p_effective_from));
  return v_id;
end;
$$;
revoke execute on function public.v2_end_referral(uuid,date,uuid)
  from public, anon, authenticated;
grant execute on function public.v2_end_referral(uuid,date,uuid) to service_role;

create function public.v2_replace_referral(p_existing uuid,p_referrer uuid,p_referred uuid,
  p_start date,p_name_visible boolean,p_actor uuid)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare v_previous public.referrals; v_new uuid;
begin
  if p_referrer is null or p_referred is null or p_referrer = p_referred
     or p_start is null or p_start < current_date then
    raise exception 'Invalid prospective referral'; end if;
  if not exists (select 1 from public.v2_agreement_versions a
    where a.owner_id = p_referred and a.partnership = 'MIKI_REFERRAL_2_WAY'
      and a.verified_at is not null and a.effective_from <= p_start
      and (a.effective_to is null or a.effective_to >= p_start)) then
    raise exception 'Verified referred-person agreement required'; end if;
  if p_existing is not null then
    if p_start <> current_date then raise exception 'Replacement must start today'; end if;
    select * into v_previous from public.referrals where id = p_existing for update;
    if not found or not v_previous.active or v_previous.referred_owner_id <> p_referred
       or v_previous.commission_basis_type <> 'flat_per_active_job_month' then
      raise exception 'Current referral does not match replacement'; end if;
    perform public.v2_end_referral(p_existing,p_start,p_actor);
  end if;
  insert into public.referrals(referrer_owner_id,referred_owner_id,
    commission_basis_type,commission_rate,flat_amount_cents,
    name_visible_to_referrer,active,start_date)
    values (p_referrer,p_referred,'flat_per_active_job_month',0,20000,
      coalesce(p_name_visible,false),true,p_start) returning id into v_new;
  insert into public.audit_log(actor_user_id,action,entity_type,entity_id,metadata_json)
    values (p_actor,'v2.referral.replaced','referral',v_new,
      jsonb_build_object('previous_referral_id',p_existing,
        'referrer_owner_id',p_referrer,'referred_owner_id',p_referred,'effective_from',p_start));
  return v_new;
end;
$$;
revoke execute on function public.v2_replace_referral(uuid,uuid,uuid,date,boolean,uuid)
  from public, anon, authenticated;
grant execute on function public.v2_replace_referral(uuid,uuid,uuid,date,boolean,uuid)
  to service_role;

-- This strict full-month method excludes unknown historical status, pauses, and
-- future/expired referral windows. Partial-month policy remains a founder decision.
create or replace function public.v2_post_full_month_commission(p_referral uuid,p_month date,p_actor uuid)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare r public.referrals; v_count integer; v_id uuid; v_month_end date;
begin
  select * into r from public.referrals where id = p_referral for update;
  if not found or r.commission_basis_type <> 'flat_per_active_job_month' then
    raise exception 'Verified flat referral required'; end if;
  if p_month is null or extract(day from p_month) <> 1
     or p_month >= date_trunc('month',current_date)::date then
    raise exception 'Choose a completed calendar month'; end if;
  v_month_end := (p_month + interval '1 month' - interval '1 day')::date;
  if r.start_date is null or r.start_date > p_month
     or (r.end_date is not null and r.end_date < v_month_end)
     or not exists (select 1 from public.v2_referral_status_events e
       where e.referral_id = p_referral and e.active and e.effective_from <= p_month
       and not exists (select 1 from public.v2_referral_status_events next
         where next.referral_id = e.referral_id and next.effective_from <= p_month
           and (next.effective_from > e.effective_from or
             (next.effective_from = e.effective_from and next.event_order > e.event_order)))
       and not exists (select 1 from public.v2_referral_status_events pause
         where pause.referral_id = e.referral_id and not pause.active
           and pause.effective_from between p_month and v_month_end))
     or not exists (select 1 from public.v2_agreement_versions a
       where a.owner_id = r.referred_owner_id and a.partnership = 'MIKI_REFERRAL_2_WAY'
         and a.verified_at is not null and a.effective_from <= p_month
         and (a.effective_to is null or a.effective_to >= v_month_end)) then
    raise exception 'Verified referral and agreement must cover the full month'; end if;
  select count(*) into v_count from public.jobs j
    where j.owner_id = r.referred_owner_id and j.start_date <= p_month
      and (j.end_date is null or j.end_date >= v_month_end)
      and exists (select 1 from public.v2_job_status_events e
        where e.job_id = j.id and e.status = 'active' and e.effective_from <= p_month
        and not exists (select 1 from public.v2_job_status_events next
          where next.job_id = e.job_id and next.effective_from <= p_month
            and (next.effective_from > e.effective_from or
              (next.effective_from = e.effective_from and next.event_order > e.event_order)))
        and not exists (select 1 from public.v2_job_status_events pause
          where pause.job_id = e.job_id and pause.status <> 'active'
            and pause.effective_from between p_month and v_month_end));
  if v_count = 0 then raise exception 'No verified full-month active jobs'; end if;
  insert into public.v2_commission_accruals(referral_id,calendar_month,eligible_job_count,
    amount_cents,calculation_version,posted_by)
    values (p_referral,p_month,v_count,v_count * 20000,'commission-full-month-v2',p_actor)
    returning id into v_id;
  insert into public.audit_log(actor_user_id,action,entity_type,entity_id,metadata_json)
    values (p_actor,'v2.commission.accrued','commission_accrual',v_id,
      jsonb_build_object('referral_id',p_referral,'calendar_month',p_month,
        'eligible_job_count',v_count));
  return v_id;
end;
$$;

-- The legacy-compatible referrer RPC is still callable through PostgREST.
-- Apply today's effective dates and verified agreement there as well.
create or replace function private.owner_earned_commissions_v2(p_owner uuid,p_year integer)
returns table (
  referral_id uuid,referred_owner_id uuid,referred_display_name text,
  commission_basis_type text,eligible_job_count bigint,monthly_rate_per_job_cents bigint,
  monthly_commission_cents bigint,annual_commission_cents bigint,
  active boolean,requires_review boolean
)
language plpgsql stable security definer set search_path = '' as $$
declare v_owner uuid;
begin
  v_owner := coalesce(p_owner,public.current_owner_id());
  if auth.uid() is null or v_owner is null
     or (not public.is_admin() and v_owner is distinct from public.current_owner_id()) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  return query
    select r.id,
      case when public.is_admin() or r.name_visible_to_referrer then r.referred_owner_id else null::uuid end,
      case when public.is_admin() or r.name_visible_to_referrer then o.display_name else 'Referred US Person' end,
      r.commission_basis_type,count(j.id)::bigint,
      r.flat_amount_cents,
      count(j.id)::bigint * r.flat_amount_cents,
      count(j.id)::bigint * r.flat_amount_cents * 12,
      r.active,false
    from public.referrals r
    join public.owners o on o.id = r.referred_owner_id
    join public.v2_agreement_versions a on a.owner_id = r.referred_owner_id
      and a.partnership = 'MIKI_REFERRAL_2_WAY' and a.verified_at is not null
      and a.effective_from <= current_date
      and (a.effective_to is null or a.effective_to >= current_date)
    left join public.jobs j on j.owner_id = r.referred_owner_id
      and j.start_date <= current_date
      and (j.end_date is null or j.end_date >= current_date)
      and exists (select 1 from public.v2_job_status_events e
        where e.job_id = j.id and e.status = 'active' and e.effective_from <= current_date
          and not exists (select 1 from public.v2_job_status_events later
            where later.job_id = e.job_id and later.effective_from <= current_date
              and (later.effective_from > e.effective_from
                or (later.effective_from = e.effective_from and later.event_order > e.event_order))))
    where r.referrer_owner_id = v_owner and r.active
      and r.commission_basis_type = 'flat_per_active_job_month'
      and r.start_date <= current_date
      and (r.end_date is null or r.end_date >= current_date)
    group by r.id,o.display_name;
end;
$$;
