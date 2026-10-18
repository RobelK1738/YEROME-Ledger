alter table public.referrals add constraint v2_fixed_commission_rate
  check (commission_basis_type <> 'flat_per_active_job_month'
    or (flat_amount_cents = 20000 and commission_rate = 0));

create table public.v2_commission_accruals (
  id uuid primary key default gen_random_uuid(),
  referral_id uuid not null references public.referrals(id) on delete restrict,
  calendar_month date not null,
  eligible_job_count integer not null check (eligible_job_count >= 0),
  amount_cents bigint not null check (amount_cents = eligible_job_count * 20000),
  calculation_version text not null,
  posted_at timestamptz not null default now(),
  posted_by uuid not null,
  unique(referral_id,calendar_month),
  check (extract(day from calendar_month) = 1)
);
alter table public.v2_commission_accruals enable row level security;
create policy v2_commission_accruals_admin_select on public.v2_commission_accruals
  for select to authenticated using (public.is_admin());
grant select on public.v2_commission_accruals to authenticated;
create trigger v2_commission_accrual_immutable before update or delete on public.v2_commission_accruals
  for each row execute function private.reject_v2_settlement_change();

create table public.v2_commission_payments (
  id uuid primary key default gen_random_uuid(),
  accrual_id uuid not null references public.v2_commission_accruals(id) on delete restrict,
  amount_cents bigint not null check (amount_cents > 0),
  paid_at timestamptz not null,
  payment_reference text not null check (length(trim(payment_reference)) > 0),
  recorded_at timestamptz not null default now(),
  recorded_by uuid not null
);
alter table public.v2_commission_payments enable row level security;
create policy v2_commission_payments_admin_select on public.v2_commission_payments
  for select to authenticated using (public.is_admin());
grant select on public.v2_commission_payments to authenticated;
create trigger v2_commission_payment_immutable before update or delete on public.v2_commission_payments
  for each row execute function private.reject_v2_settlement_change();
grant select, insert, update, delete on public.v2_commission_accruals,
  public.v2_commission_payments to service_role;

-- Only the server service role may post. A full month must be complete; jobs
-- with partial dates or uncertain status need manual review outside this flow.
create function public.v2_post_full_month_commission(p_referral uuid, p_month date, p_actor uuid)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare r public.referrals; v_count integer; v_id uuid; v_month_end date;
begin
  select * into r from public.referrals where id = p_referral for update;
  if not found or not r.active or r.commission_basis_type <> 'flat_per_active_job_month' then
    raise exception 'Verified active flat referral required';
  end if;
  if p_month is null or extract(day from p_month) <> 1
     or p_month >= date_trunc('month', current_date)::date then
    raise exception 'Choose a completed calendar month beginning on day one';
  end if;
  v_month_end := (p_month + interval '1 month' - interval '1 day')::date;
  if r.start_date is null or r.start_date > p_month
     or (r.end_date is not null and r.end_date < v_month_end)
     or not exists (select 1 from public.owners o
                    where o.id = r.referred_owner_id and o.status = 'active')
     or not exists (
       select 1 from public.v2_agreement_versions a
       where a.owner_id = r.referred_owner_id
         and a.partnership = 'MIKI_REFERRAL_2_WAY'
         and a.verified_at is not null
         and a.effective_from <= p_month
         and (a.effective_to is null or a.effective_to >= v_month_end)
     ) then
    raise exception 'A verified referral agreement must cover the full month';
  end if;
  select count(*) into v_count from public.jobs j
    where j.owner_id = r.referred_owner_id and j.status = 'active'
      and j.start_date is not null and j.start_date <= p_month
      and (j.end_date is null or j.end_date >= v_month_end);
  if v_count = 0 then raise exception 'No unambiguously full-month active jobs'; end if;
  insert into public.v2_commission_accruals(referral_id,calendar_month,eligible_job_count,
    amount_cents,calculation_version,posted_by)
    values (p_referral,p_month,v_count,v_count * 20000,'commission-full-month-v1',p_actor)
    returning id into v_id;
  insert into public.audit_log(actor_user_id,action,entity_type,entity_id,metadata_json)
    values (p_actor,'v2.commission.accrued','commission_accrual',v_id,
      jsonb_build_object('referral_id',p_referral,'calendar_month',p_month,'eligible_job_count',v_count));
  return v_id;
end;
$$;
revoke execute on function public.v2_post_full_month_commission(uuid,date,uuid)
  from public, anon, authenticated;
grant execute on function public.v2_post_full_month_commission(uuid,date,uuid) to service_role;

create function public.v2_record_commission_payment(
  p_accrual uuid, p_amount_cents bigint, p_paid_at timestamptz,
  p_reference text, p_actor uuid
)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare a public.v2_commission_accruals; v_paid bigint; v_id uuid;
begin
  select * into a from public.v2_commission_accruals where id = p_accrual for update;
  if not found then raise exception 'Commission accrual not found'; end if;
  if p_amount_cents is null or p_amount_cents <= 0 or p_paid_at is null
     or length(trim(coalesce(p_reference,''))) = 0 then raise exception 'Invalid payment record'; end if;
  select coalesce(sum(amount_cents),0) into v_paid from public.v2_commission_payments
    where accrual_id = p_accrual;
  if v_paid + p_amount_cents > a.amount_cents then raise exception 'Payment exceeds accrued commission'; end if;
  insert into public.v2_commission_payments(accrual_id,amount_cents,paid_at,payment_reference,recorded_by)
    values (p_accrual,p_amount_cents,p_paid_at,trim(p_reference),p_actor) returning id into v_id;
  insert into public.audit_log(actor_user_id,action,entity_type,entity_id,metadata_json)
    values (p_actor,'v2.commission.payment_recorded','commission_payment',v_id,
      jsonb_build_object('accrual_id',p_accrual,'amount_cents',p_amount_cents));
  return v_id;
end;
$$;
revoke execute on function public.v2_record_commission_payment(uuid,bigint,timestamptz,text,uuid)
  from public, anon, authenticated;
grant execute on function public.v2_record_commission_payment(uuid,bigint,timestamptz,text,uuid)
  to service_role;
