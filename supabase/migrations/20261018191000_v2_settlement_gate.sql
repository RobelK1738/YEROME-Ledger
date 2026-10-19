-- No approval rows are seeded. Real posting is disabled until the founder,
-- accountant, and counsel approve the receipt basis and allocation policy.
revoke insert on public.v2_payrun_settlements,public.v2_settlement_adjustments from authenticated;
drop policy if exists v2_settlements_admin_insert on public.v2_payrun_settlements;
drop policy if exists v2_adjustments_admin_insert on public.v2_settlement_adjustments;
create table public.v2_settlement_policy_approvals (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.owners(id) on delete restrict,
  policy_version text not null check (policy_version = 'receipt-net-closed-month-proposal-v1'),
  agreement_reference text not null check (length(trim(agreement_reference)) > 0),
  legal_review_reference text not null check (length(trim(legal_review_reference)) > 0),
  effective_from date not null,
  effective_to date,
  enabled boolean not null default false,
  approved_at timestamptz not null,
  approved_by uuid not null,
  check (effective_to is null or effective_to >= effective_from)
);
alter table public.v2_settlement_policy_approvals enable row level security;
create policy v2_settlement_policy_admin_select on public.v2_settlement_policy_approvals
  for select to authenticated using (public.is_admin());
grant select on public.v2_settlement_policy_approvals to authenticated;
grant select, insert on public.v2_settlement_policy_approvals to service_role;
create trigger v2_settlement_policy_immutable before update or delete on public.v2_settlement_policy_approvals
  for each row execute function private.reject_v2_settlement_change();

create table public.v2_settlement_batches (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.owners(id) on delete restrict,
  calendar_month date not null check (extract(day from calendar_month) = 1),
  policy_id uuid not null references public.v2_settlement_policy_approvals(id) on delete restrict,
  agreement_version_id uuid not null references public.v2_agreement_versions(id) on delete restrict,
  calculation_version text not null,
  snapshot_json jsonb not null,
  idempotency_key text not null unique,
  posted_at timestamptz not null default now(),
  posted_by uuid not null,
  unique(owner_id,calendar_month)
);
alter table public.v2_settlement_batches enable row level security;
create policy v2_settlement_batches_admin_select on public.v2_settlement_batches
  for select to authenticated using (public.is_admin());
grant select on public.v2_settlement_batches to authenticated;
grant select, insert on public.v2_settlement_batches to service_role;
create trigger v2_settlement_batches_immutable before update or delete on public.v2_settlement_batches
  for each row execute function private.reject_v2_settlement_change();

alter table public.v2_payrun_settlements
  add column batch_id uuid references public.v2_settlement_batches(id) on delete restrict,
  add column pay_date date,
  add column receipt_correction_sequence integer,
  add column source_gross_cents bigint,
  add column source_net_cents bigint,
  add column quoted_cost_cents bigint,
  add column actual_cost_cents bigint,
  add column partner_due_cents bigint,
  add column commission_cents bigint,
  add column gang_cut_cents bigint,
  add column yerome_residual_cents bigint;
alter table public.v2_payrun_settlements add constraint v2_settlement_line_balanced check (
  batch_id is null or (
    pay_date is not null and receipt_correction_sequence is not null
    and source_gross_cents is not null and source_net_cents is not null
    and quoted_cost_cents is not null and actual_cost_cents is not null
    and partner_due_cents is not null and commission_cents is not null
    and gang_cut_cents is not null and yerome_residual_cents is not null
    and source_net_cents = actual_cost_cents + partner_due_cents
      + commission_cents + gang_cut_cents + yerome_residual_cents
  )
);

alter table public.v2_settlement_adjustments
  add column after_tax_delta_cents bigint not null default 0,
  add column actual_cost_delta_cents bigint not null default 0,
  add column partner_due_delta_cents bigint not null default 0,
  add column commission_delta_cents bigint not null default 0,
  add column gang_delta_cents bigint not null default 0,
  add column yerome_delta_cents bigint not null default 0,
  add column receipt_correction_id uuid references public.v2_paycheck_corrections(id) on delete restrict,
  add column idempotency_key text unique;
alter table public.v2_settlement_adjustments add constraint v2_adjustment_balanced check (
  after_tax_delta_cents = actual_cost_delta_cents + partner_due_delta_cents
    + commission_delta_cents + gang_delta_cents + yerome_delta_cents
);

create table public.v2_partner_payments (
  id uuid primary key default gen_random_uuid(),
  settlement_id uuid not null references public.v2_payrun_settlements(id) on delete restrict,
  amount_cents bigint not null check (amount_cents > 0),
  paid_at timestamptz not null,
  external_reference text not null check (length(trim(external_reference)) > 0),
  idempotency_key text not null unique,
  recorded_at timestamptz not null default now(),
  recorded_by uuid not null
);
alter table public.v2_partner_payments enable row level security;
create policy v2_partner_payments_admin_select on public.v2_partner_payments
  for select to authenticated using (public.is_admin());
grant select on public.v2_partner_payments to authenticated;
grant select, insert on public.v2_partner_payments to service_role;
create trigger v2_partner_payments_immutable before update or delete on public.v2_partner_payments
  for each row execute function private.reject_v2_settlement_change();

create function public.v2_post_settlement_batch(p_policy uuid,p_snapshot jsonb,
  p_idempotency_key text,p_actor uuid)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare v_policy public.v2_settlement_policy_approvals;
  v_agreement public.v2_agreement_versions; v_batch uuid; v_existing public.v2_settlement_batches;
  v_month date; v_end date; v_count integer; v_check_count integer; v_line_count integer;
  v_net bigint; v_quoted bigint; v_actual bigint; v_partner bigint; v_commission bigint;
  v_gang bigint; v_profit bigint; v_line jsonb; v_check public.job_paychecks;
  v_correction public.v2_paycheck_corrections; v_line_id uuid;
  v_sum_net bigint := 0; v_sum_quoted bigint := 0; v_sum_actual bigint := 0;
  v_sum_partner bigint := 0; v_sum_commission bigint := 0; v_sum_gang bigint := 0;
  v_sum_profit bigint := 0;
begin
  if length(trim(coalesce(p_idempotency_key,''))) = 0 or p_snapshot is null then
    raise exception 'Settlement snapshot and idempotency key required'; end if;
  select * into v_policy from public.v2_settlement_policy_approvals
    where id = p_policy and enabled for update;
  if not found then raise exception 'Founder-approved settlement policy is not enabled'; end if;
  select * into v_existing from public.v2_settlement_batches where idempotency_key = p_idempotency_key;
  if found then
    if v_existing.policy_id <> p_policy or v_existing.snapshot_json <> p_snapshot then
      raise exception 'Idempotency key reused for different settlement'; end if;
    return v_existing.id;
  end if;
  v_month := (p_snapshot->>'calendarMonth')::date;
  if v_month is null or extract(day from v_month) <> 1
     or v_month >= date_trunc('month',current_date)::date
     or (p_snapshot->>'ownerId')::uuid <> v_policy.owner_id
     or p_snapshot->>'calculationVersion' <> v_policy.policy_version then
    raise exception 'Invalid completed owner month'; end if;
  v_end := (v_month + interval '1 month' - interval '1 day')::date;
  if v_policy.effective_from > v_month or
     (v_policy.effective_to is not null and v_policy.effective_to < v_end) then
    raise exception 'Policy does not cover full month'; end if;
  perform 1 from public.owners where id = v_policy.owner_id for update;
  select * into v_agreement from public.v2_agreement_versions
    where id = (p_snapshot->>'agreementVersionId')::uuid
      and owner_id = v_policy.owner_id and verified_at is not null
      and effective_from <= v_month and (effective_to is null or effective_to >= v_end);
  if not found or v_agreement.partnership <> p_snapshot->>'partnership' then
    raise exception 'Verified agreement does not cover full month'; end if;
  select count(*) into v_count from public.jobs j
    where j.owner_id = v_policy.owner_id and j.start_date <= v_month
      and (j.end_date is null or j.end_date >= v_end)
      and exists (select 1 from public.v2_job_status_events e where e.job_id = j.id
        and e.status = 'active' and e.effective_from <= v_month
        and not exists (select 1 from public.v2_job_status_events later
          where later.job_id = e.job_id and later.effective_from <= v_month
            and (later.effective_from > e.effective_from or
              (later.effective_from = e.effective_from and later.event_order > e.event_order)))
        and not exists (select 1 from public.v2_job_status_events pause
          where pause.job_id = e.job_id and pause.status <> 'active'
            and pause.effective_from between v_month and v_end));
  if v_count = 0 or v_count <> (p_snapshot->>'activeJobCount')::integer
     or v_count <> (select count(*) from public.jobs j
       where j.owner_id = v_policy.owner_id and j.start_date <= v_end
         and (j.end_date is null or j.end_date >= v_month)) then
    raise exception 'Full-month job status needs review'; end if;
  if v_agreement.partnership = 'MIKI_REFERRAL_2_WAY' and not exists (
    select 1 from public.referrals r where r.referred_owner_id = v_policy.owner_id
      and r.commission_basis_type = 'flat_per_active_job_month'
      and r.start_date <= v_month and (r.end_date is null or r.end_date >= v_end)
      and exists (select 1 from public.v2_referral_status_events e
        where e.referral_id = r.id and e.active and e.effective_from <= v_month
        and not exists (select 1 from public.v2_referral_status_events stop
          where stop.referral_id = e.referral_id and not stop.active
            and stop.effective_from between v_month and v_end))) then
    raise exception 'Referral status needs review'; end if;
  select count(*) into v_check_count from public.job_paychecks c
    join public.jobs j on j.id = c.job_id
    where j.owner_id = v_policy.owner_id and c.pay_date between v_month and v_end;
  select count(*) into v_line_count from jsonb_array_elements(p_snapshot->'lines');
  if v_check_count = 0 or v_check_count <> v_line_count or exists (
    select 1 from public.job_paychecks c join public.jobs j on j.id = c.job_id
      where j.owner_id = v_policy.owner_id and c.pay_date between v_month and v_end
        and c.status <> 'paid') then
    raise exception 'Missing, skipped, or late paystub in month'; end if;
  v_net := (p_snapshot->>'afterTaxCents')::bigint;
  v_quoted := (p_snapshot->>'quotedCostCents')::bigint;
  v_actual := (p_snapshot->>'actualCostCents')::bigint;
  v_partner := (p_snapshot->>'partnerDueCents')::bigint;
  v_commission := (p_snapshot->>'commissionCents')::bigint;
  v_gang := (p_snapshot->>'gangCutCents')::bigint;
  v_profit := (p_snapshot->>'yeromeResidualCents')::bigint;
  if v_net is null or v_quoted is null or v_actual is null or v_partner is null
     or v_commission is null or v_gang is null or v_profit is null
     or v_quoted <> v_agreement.quoted_apartment_monthly_cents + v_count *
       (case when v_agreement.partnership = 'DIRECT_2_WAY' then 95000 else 115000 end)
     or v_actual <> v_agreement.actual_apartment_monthly_cents + v_count * 40000
     or v_commission <> (case when v_agreement.partnership = 'DIRECT_2_WAY' then 0 else v_count * 20000 end)
     or v_partner <> round((v_net - v_quoted)::numeric / 2)::bigint
     or v_partner < 0 or v_net - v_quoted < 0
     or v_gang <> round(v_net::numeric / 10)::bigint
     or v_profit <> v_net - v_actual - v_partner - v_commission - v_gang then
    raise exception 'Settlement formula or loss policy unresolved'; end if;
  for v_line in select * from jsonb_array_elements(p_snapshot->'lines') loop
    select c.* into v_check from public.job_paychecks c
      join public.jobs j on j.id = c.job_id
      where c.id = (v_line->>'paycheckId')::uuid and j.owner_id = v_policy.owner_id
        and c.pay_date between v_month and v_end and c.status = 'paid' for update of c;
    if not found then raise exception 'Receipt is not part of owner month'; end if;
    select * into v_correction from public.v2_paycheck_corrections
      where job_paycheck_id = v_check.id order by sequence desc limit 1;
    if (v_line->>'receiptCorrectionSequence') is null
       or (v_line->>'sourceGrossCents') is null or (v_line->>'sourceNetCents') is null
       or (v_line->>'quotedCostCents') is null or (v_line->>'actualCostCents') is null
       or (v_line->>'partnerDueCents') is null or (v_line->>'commissionCents') is null
       or (v_line->>'gangCutCents') is null or (v_line->>'yeromeResidualCents') is null
       or (v_line->>'receiptCorrectionSequence')::integer <> coalesce(v_correction.sequence,0)
       or (v_line->>'sourceGrossCents')::bigint <> coalesce(
         (v_correction.snapshot_json->>'actual_gross_cents')::bigint,v_check.actual_gross_cents)
       or (v_line->>'sourceNetCents')::bigint <> coalesce(
         (v_correction.snapshot_json->>'actual_net_received_cents')::bigint,v_check.actual_net_received_cents)
       or v_line->>'payDate' <> v_check.pay_date::text then
      raise exception 'Receipt snapshot is stale or incomplete'; end if;
    if (v_line->>'sourceNetCents')::bigint < 0 or
       (v_line->>'sourceNetCents')::bigint <>
         (v_line->>'actualCostCents')::bigint + (v_line->>'partnerDueCents')::bigint
         + (v_line->>'commissionCents')::bigint + (v_line->>'gangCutCents')::bigint
         + (v_line->>'yeromeResidualCents')::bigint then
      raise exception 'Settlement line does not balance'; end if;
    v_sum_net := v_sum_net + (v_line->>'sourceNetCents')::bigint;
    v_sum_quoted := v_sum_quoted + (v_line->>'quotedCostCents')::bigint;
    v_sum_actual := v_sum_actual + (v_line->>'actualCostCents')::bigint;
    v_sum_partner := v_sum_partner + (v_line->>'partnerDueCents')::bigint;
    v_sum_commission := v_sum_commission + (v_line->>'commissionCents')::bigint;
    v_sum_gang := v_sum_gang + (v_line->>'gangCutCents')::bigint;
    v_sum_profit := v_sum_profit + (v_line->>'yeromeResidualCents')::bigint;
  end loop;
  if v_sum_net <> v_net or v_sum_quoted <> v_quoted or v_sum_actual <> v_actual
     or v_sum_partner <> v_partner or v_sum_commission <> v_commission
     or v_sum_gang <> v_gang or v_sum_profit <> v_profit then
    raise exception 'Settlement monthly totals do not balance'; end if;
  insert into public.v2_settlement_batches(owner_id,calendar_month,policy_id,
    agreement_version_id,calculation_version,snapshot_json,idempotency_key,posted_by)
    values (v_policy.owner_id,v_month,p_policy,v_agreement.id,
      v_policy.policy_version,p_snapshot,p_idempotency_key,p_actor) returning id into v_batch;
  for v_line in select * from jsonb_array_elements(p_snapshot->'lines') loop
    insert into public.v2_payrun_settlements(job_paycheck_id,owner_id,calculation_version,
      snapshot_json,settled_by,batch_id,pay_date,receipt_correction_sequence,
      source_gross_cents,source_net_cents,quoted_cost_cents,actual_cost_cents,
      partner_due_cents,commission_cents,gang_cut_cents,yerome_residual_cents)
      values ((v_line->>'paycheckId')::uuid,v_policy.owner_id,v_policy.policy_version,
        v_line,p_actor,v_batch,(v_line->>'payDate')::date,
        (v_line->>'receiptCorrectionSequence')::integer,
        (v_line->>'sourceGrossCents')::bigint,(v_line->>'sourceNetCents')::bigint,
        (v_line->>'quotedCostCents')::bigint,(v_line->>'actualCostCents')::bigint,
        (v_line->>'partnerDueCents')::bigint,(v_line->>'commissionCents')::bigint,
        (v_line->>'gangCutCents')::bigint,(v_line->>'yeromeResidualCents')::bigint)
      returning id into v_line_id;
  end loop;
  insert into public.audit_log(actor_user_id,action,entity_type,entity_id,metadata_json)
    values (p_actor,'v2.settlement.posted','settlement_batch',v_batch,
      jsonb_build_object('owner_id',v_policy.owner_id,'month',v_month,
        'policy_id',p_policy,'checks',v_check_count));
  return v_batch;
end;
$$;
revoke execute on function public.v2_post_settlement_batch(uuid,jsonb,text,uuid)
  from public, anon, authenticated;
grant execute on function public.v2_post_settlement_batch(uuid,jsonb,text,uuid) to service_role;

create function public.v2_record_partner_payment(p_settlement uuid,p_amount_cents bigint,
  p_paid_at timestamptz,p_reference text,p_key text,p_actor uuid)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare v_settlement public.v2_payrun_settlements; v_existing public.v2_partner_payments;
  v_due bigint; v_paid bigint; v_id uuid;
begin
  select * into v_existing from public.v2_partner_payments where idempotency_key = p_key;
  if found then
    if v_existing.settlement_id <> p_settlement or v_existing.amount_cents <> p_amount_cents
       or v_existing.paid_at <> p_paid_at or v_existing.external_reference <> p_reference then
      raise exception 'Payment replay mismatch'; end if;
    return v_existing.id;
  end if;
  select * into v_settlement from public.v2_payrun_settlements where id = p_settlement for update;
  if not found or v_settlement.batch_id is null or p_amount_cents <= 0 or p_paid_at is null
     or length(trim(coalesce(p_reference,''))) = 0 or length(trim(coalesce(p_key,''))) = 0
     or not exists (select 1 from public.v2_settlement_batches b
       join public.v2_settlement_policy_approvals policy on policy.id = b.policy_id
       where b.id = v_settlement.batch_id and policy.enabled) then
    raise exception 'Approved settlement and external payment evidence required'; end if;
  if exists (select 1 from public.v2_paycheck_corrections c
    where c.job_paycheck_id = v_settlement.job_paycheck_id
      and c.sequence > v_settlement.receipt_correction_sequence
      and not exists (select 1 from public.v2_settlement_adjustments a
        where a.settlement_id = v_settlement.id and a.receipt_correction_id = c.id)) then
    raise exception 'Receipt correction requires settlement adjustment'; end if;
  select v_settlement.partner_due_cents + coalesce(sum(partner_due_delta_cents),0)
    into v_due from public.v2_settlement_adjustments where settlement_id = p_settlement;
  select coalesce(sum(amount_cents),0) into v_paid from public.v2_partner_payments
    where settlement_id = p_settlement;
  if v_due < 0 or v_paid + p_amount_cents > v_due then
    raise exception 'Payment exceeds signed partner amount owed'; end if;
  insert into public.v2_partner_payments(settlement_id,amount_cents,paid_at,
    external_reference,idempotency_key,recorded_by)
    values (p_settlement,p_amount_cents,p_paid_at,trim(p_reference),p_key,p_actor)
    returning id into v_id;
  insert into public.audit_log(actor_user_id,action,entity_type,entity_id,metadata_json)
    values (p_actor,'v2.partner.payment_recorded','partner_payment',v_id,
      jsonb_build_object('settlement_id',p_settlement,'amount_cents',p_amount_cents));
  return v_id;
end;
$$;
revoke execute on function public.v2_record_partner_payment(uuid,bigint,timestamptz,text,text,uuid)
  from public, anon, authenticated;
grant execute on function public.v2_record_partner_payment(uuid,bigint,timestamptz,text,text,uuid)
  to service_role;

create function public.v2_record_settlement_adjustment(p_settlement uuid,
  p_after_tax_delta bigint,p_actual_delta bigint,p_partner_delta bigint,
  p_commission_delta bigint,p_gang_delta bigint,p_yerome_delta bigint,
  p_correction uuid,p_reason text,p_key text,p_actor uuid)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare v_settlement public.v2_payrun_settlements; v_correction public.v2_paycheck_corrections;
  v_existing public.v2_settlement_adjustments; v_id uuid; v_previous_net bigint;
begin
  select * into v_existing from public.v2_settlement_adjustments where idempotency_key = p_key;
  if found then
    if v_existing.settlement_id is distinct from p_settlement
       or v_existing.after_tax_delta_cents is distinct from p_after_tax_delta
       or v_existing.actual_cost_delta_cents is distinct from p_actual_delta
       or v_existing.partner_due_delta_cents is distinct from p_partner_delta
       or v_existing.commission_delta_cents is distinct from p_commission_delta
       or v_existing.gang_delta_cents is distinct from p_gang_delta
       or v_existing.yerome_delta_cents is distinct from p_yerome_delta
       or v_existing.receipt_correction_id is distinct from p_correction
       or v_existing.reason is distinct from trim(p_reason) then
      raise exception 'Adjustment replay mismatch'; end if;
    return v_existing.id;
  end if;
  select * into v_settlement from public.v2_payrun_settlements where id = p_settlement for update;
  if not found or v_settlement.batch_id is null or length(trim(coalesce(p_reason,''))) = 0
     or length(trim(coalesce(p_key,''))) = 0
     or p_after_tax_delta <> p_actual_delta + p_partner_delta + p_commission_delta
       + p_gang_delta + p_yerome_delta
     or not exists (select 1 from public.v2_settlement_batches b
       join public.v2_settlement_policy_approvals policy on policy.id = b.policy_id
       where b.id = v_settlement.batch_id and policy.enabled) then
    raise exception 'Approved balanced adjustment required'; end if;
  if p_correction is not null then
    select * into v_correction from public.v2_paycheck_corrections
      where id = p_correction and job_paycheck_id = v_settlement.job_paycheck_id;
    if not found or exists (select 1 from public.v2_settlement_adjustments
      where receipt_correction_id = p_correction) then
      raise exception 'New matching receipt correction required'; end if;
    select coalesce((snapshot_json->>'actual_net_received_cents')::bigint,
      v_settlement.source_net_cents) into v_previous_net
      from public.v2_paycheck_corrections
      where job_paycheck_id = v_settlement.job_paycheck_id and sequence < v_correction.sequence
      order by sequence desc limit 1;
    v_previous_net := coalesce(v_previous_net,v_settlement.source_net_cents);
    if p_after_tax_delta <> (v_correction.snapshot_json->>'actual_net_received_cents')::bigint - v_previous_net then
      raise exception 'Correction delta does not match recorded receipt'; end if;
  elsif p_after_tax_delta <> 0 then
    raise exception 'Cash-basis delta requires an audited receipt correction';
  end if;
  insert into public.v2_settlement_adjustments(settlement_id,reason,change_json,
    created_by,after_tax_delta_cents,actual_cost_delta_cents,partner_due_delta_cents,
    commission_delta_cents,gang_delta_cents,yerome_delta_cents,
    receipt_correction_id,idempotency_key)
    values (p_settlement,trim(p_reason),jsonb_build_object('receipt_correction_id',p_correction),
      p_actor,p_after_tax_delta,p_actual_delta,p_partner_delta,p_commission_delta,
      p_gang_delta,p_yerome_delta,p_correction,p_key) returning id into v_id;
  insert into public.audit_log(actor_user_id,action,entity_type,entity_id,metadata_json)
    values (p_actor,'v2.settlement.adjusted','settlement_adjustment',v_id,
      jsonb_build_object('settlement_id',p_settlement,'reason',p_reason));
  return v_id;
end;
$$;
revoke execute on function public.v2_record_settlement_adjustment(uuid,bigint,bigint,bigint,bigint,bigint,bigint,uuid,text,text,uuid)
  from public, anon, authenticated;
grant execute on function public.v2_record_settlement_adjustment(uuid,bigint,bigint,bigint,bigint,bigint,bigint,uuid,text,text,uuid)
  to service_role;

-- All operational writes pass through fresh Admin authentication and the
-- service-only, audited RPCs. Direct browser writes could skip status history.
revoke insert,update,delete on public.jobs,public.referrals,
  public.job_paychecks,public.job_compensation_terms,
  public.v2_agreement_versions,public.person_apartments
  from authenticated;
grant select,insert,update,delete on public.jobs,public.referrals,
  public.job_paychecks,public.job_compensation_terms,
  public.v2_agreement_versions,public.person_apartments
  to service_role;
