-- Fourth review. Preserve historical rows without asserting a recipient or proof.
-- New transfers are single-recipient USD bank transfers. Multi-recipient bank
-- batches require separate per-recipient evidence and are not supported here.
alter table public.v2_external_transfers
  add column recipient_owner_id uuid references public.owners(id) on delete restrict,
  add column source_account_alias text,
  add column destination_account_alias text,
  add column channel text,
  add column currency text;
alter table public.v2_external_transfers add constraint v2_new_transfer_recipient_required
  check (recipient_owner_id is not null and
    length(btrim(coalesce(source_account_alias,''))) > 0 and
    length(btrim(coalesce(destination_account_alias,''))) > 0 and
    channel is not null and channel = 'bank_transfer' and currency is not null and currency = 'USD') not valid;
-- PostgreSQL requires UPDATE privilege for SELECT FOR UPDATE. The existing
-- immutable trigger still rejects every actual UPDATE/DELETE, including service.
grant update on public.v2_external_transfers to service_role;
grant insert on public.audit_log to service_role;
-- Keep reference uniqueness global: a changed namespace cannot evade replay
-- protection. Genuine cross-institution collisions need independent review.

create table public.v2_transfer_verifications (
  transfer_id uuid primary key references public.v2_external_transfers(id) on delete restrict,
  evidence_reference text not null check (length(btrim(evidence_reference)) > 0),
  verified_at timestamptz not null default now(),
  verified_by uuid not null
);
alter table public.v2_transfer_verifications enable row level security;
create policy v2_transfer_verifications_admin_select on public.v2_transfer_verifications
  for select to authenticated using (public.is_admin());
grant select on public.v2_transfer_verifications to authenticated;
grant select,insert on public.v2_transfer_verifications to service_role;
create trigger v2_transfer_verifications_immutable before update or delete on public.v2_transfer_verifications
  for each row execute function private.reject_v2_settlement_change();

-- An accrual's recipient must remain the original referrer. Replacement is a
-- new referral row; changing the identity on an existing row is never a fix.
create function private.v2_guard_referral_identity() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.referrer_owner_id is distinct from old.referrer_owner_id or
     new.referred_owner_id is distinct from old.referred_owner_id then
    raise exception 'Referral identities are immutable; create a replacement'; end if;
  return new;
end;
$$;
create trigger v2_referral_identity_immutable before update on public.referrals
  for each row execute function private.v2_guard_referral_identity();

revoke execute on function private.v2_claim_external_transfer(text,bigint,timestamptz,uuid)
  from service_role,public,anon,authenticated;
revoke execute on function public.v2_record_partner_allocation(uuid,bigint,timestamptz,text,bigint,text,uuid)
  from service_role,public,anon,authenticated;
revoke execute on function public.v2_record_commission_allocation(uuid,bigint,timestamptz,text,bigint,text,uuid)
  from service_role,public,anon,authenticated;

create function public.v2_register_transfer(p_recipient uuid,p_reference text,p_total bigint,
  p_paid_at timestamptz,p_source text,p_destination text,p_actor uuid)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare v_transfer public.v2_external_transfers; v_reference text := btrim(p_reference);
begin
  if p_recipient is null or p_actor is null or p_paid_at is null or p_paid_at > now()
     or p_total is null or p_total <= 0 or length(coalesce(v_reference,'')) = 0
     or length(btrim(coalesce(p_source,''))) = 0 or length(btrim(coalesce(p_destination,''))) = 0 then
    raise exception 'Recipient and complete external transfer record required'; end if;
  if exists (select 1 from public.v2_partner_payments
      where transfer_id is null and lower(btrim(external_reference)) = lower(v_reference))
     or exists (select 1 from public.v2_commission_payments
      where transfer_id is null and lower(btrim(payment_reference)) = lower(v_reference)) then
    raise exception 'External reference matches unreviewed historical payment'; end if;
  insert into public.v2_external_transfers(reference,total_cents,paid_at,recorded_by,
    recipient_owner_id,source_account_alias,destination_account_alias,channel,currency)
    values (v_reference,p_total,p_paid_at,p_actor,p_recipient,btrim(p_source),btrim(p_destination),'bank_transfer','USD')
    on conflict (reference_key) do nothing;
  select * into v_transfer from public.v2_external_transfers
    where reference_key = lower(v_reference) for update;
  if v_transfer.total_cents is distinct from p_total or v_transfer.paid_at is distinct from p_paid_at
     or v_transfer.recipient_owner_id is distinct from p_recipient
     or v_transfer.source_account_alias is distinct from btrim(p_source)
     or v_transfer.destination_account_alias is distinct from btrim(p_destination) then
    raise exception 'External reference collision needs independent evidence review'; end if;
  insert into public.audit_log(actor_user_id,action,entity_type,entity_id,metadata_json)
    values (p_actor,'v2.transfer.registered','external_transfer',v_transfer.id,
      jsonb_build_object('recipient_owner_id',p_recipient));
  return v_transfer.id;
end;
$$;

create function public.v2_verify_transfer(p_transfer uuid,p_recipient uuid,p_total bigint,
  p_paid_at timestamptz,p_reference text,p_source text,p_destination text,p_evidence text,p_actor uuid)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare v_transfer public.v2_external_transfers; v_evidence text;
begin
  select * into v_transfer from public.v2_external_transfers where id = p_transfer for update;
  if not found or v_transfer.recipient_owner_id is null then
    raise exception 'Historical transfer needs independent recipient review'; end if;
  if v_transfer.recipient_owner_id is distinct from p_recipient or v_transfer.total_cents is distinct from p_total
     or v_transfer.paid_at is distinct from p_paid_at or v_transfer.reference_key is distinct from lower(btrim(p_reference))
     or v_transfer.source_account_alias is distinct from btrim(p_source)
     or v_transfer.destination_account_alias is distinct from btrim(p_destination)
     or v_transfer.currency is distinct from 'USD' or v_transfer.channel is distinct from 'bank_transfer'
     or p_actor is null or length(btrim(coalesce(p_evidence,''))) = 0 then
    raise exception 'Evidence must confirm recipient, amount, date, reference and accounts'; end if;
  insert into public.v2_transfer_verifications(transfer_id,evidence_reference,verified_by)
    values (p_transfer,btrim(p_evidence),p_actor) on conflict (transfer_id) do nothing;
  select evidence_reference into v_evidence from public.v2_transfer_verifications where transfer_id = p_transfer;
  if v_evidence <> btrim(p_evidence) then raise exception 'Verification replay mismatch'; end if;
  insert into public.audit_log(actor_user_id,action,entity_type,entity_id,metadata_json)
    values (p_actor,'v2.transfer.evidence_verified','external_transfer',p_transfer,'{}');
  return p_transfer;
end;
$$;

alter table public.v2_partner_payments add column evidence_verified boolean not null default false;
alter table public.v2_commission_payments add column evidence_verified boolean not null default false;

create or replace function private.v2_guard_transfer_allocation() returns trigger
language plpgsql set search_path = '' as $$
declare v_transfer public.v2_external_transfers; v_allocated bigint; v_reference text;
  v_recipient uuid; v_accrual public.v2_commission_accruals;
begin
  -- Use the same obligation-then-transfer lock order as the RPCs.
  if tg_table_name = 'v2_partner_payments' then
    select owner_id into v_recipient from public.v2_payrun_settlements
      where id = new.settlement_id for update;
  else
    select * into v_accrual from public.v2_commission_accruals where id = new.accrual_id for update;
    select referrer_owner_id into v_recipient from public.referrals where id = v_accrual.referral_id;
    if (select coalesce(sum(amount_cents),0) from public.v2_commission_payments
        where accrual_id = new.accrual_id) + new.amount_cents > v_accrual.amount_cents then
      raise exception 'Payment exceeds accrued commission'; end if;
  end if;
  select * into v_transfer from public.v2_external_transfers where id = new.transfer_id for update;
  if not found or not exists (select 1 from public.v2_transfer_verifications where transfer_id = new.transfer_id) then
    raise exception 'Transfer must be verified against external evidence before allocation'; end if;
  if v_recipient is null or v_transfer.recipient_owner_id is distinct from v_recipient then
    raise exception 'Transfer beneficiary does not match obligation'; end if;
  v_reference := case when tg_table_name = 'v2_partner_payments'
    then to_jsonb(new)->>'external_reference' else to_jsonb(new)->>'payment_reference' end;
  if lower(btrim(v_reference)) is distinct from v_transfer.reference_key
     or new.paid_at is distinct from v_transfer.paid_at then
    raise exception 'Allocation must match external transfer evidence'; end if;
  select coalesce((select sum(amount_cents) from public.v2_partner_payments
      where transfer_id = new.transfer_id),0) +
    coalesce((select sum(amount_cents) from public.v2_commission_payments
      where transfer_id = new.transfer_id),0) into v_allocated;
  new.evidence_verified := true;
  if v_allocated + new.amount_cents > v_transfer.total_cents then
    raise exception 'External transfer already fully allocated'; end if;
  return new;
end;
$$;

create function public.v2_record_partner_allocation(p_settlement uuid,p_amount_cents bigint,
  p_transfer uuid,p_key text,p_actor uuid)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare v_settlement public.v2_payrun_settlements; v_existing public.v2_partner_payments;
  v_transfer public.v2_external_transfers; v_id uuid;
begin
  if length(btrim(coalesce(p_key,''))) = 0 or p_amount_cents is null or p_amount_cents <= 0 then
    raise exception 'Payment request key and positive allocation required'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(btrim(p_key),0));
  select * into v_existing from public.v2_partner_payments where idempotency_key = btrim(p_key);
  if found then
    if v_existing.transfer_id is distinct from p_transfer or v_existing.settlement_id is distinct from p_settlement
       or v_existing.amount_cents is distinct from p_amount_cents then
      raise exception 'Payment replay mismatch'; end if;
    return v_existing.id;
  end if;
  select * into v_settlement from public.v2_payrun_settlements
    where id = p_settlement for update;
  if not found or v_settlement.batch_id is null or not exists (
      select 1 from public.v2_settlement_batches b
      join public.v2_settlement_policy_approvals policy on policy.id = b.policy_id
      where b.id = v_settlement.batch_id and policy.enabled) then
    raise exception 'Approved posted settlement required'; end if;
  select * into v_transfer from public.v2_external_transfers where id = p_transfer for update;
  if not found then raise exception 'External transfer identity not found'; end if;
  insert into public.v2_partner_payments(settlement_id,amount_cents,paid_at,
    external_reference,idempotency_key,recorded_by,transfer_id)
    values (p_settlement,p_amount_cents,v_transfer.paid_at,v_transfer.reference,btrim(p_key),
      p_actor,v_transfer.id) returning id into v_id;
  insert into public.audit_log(actor_user_id,action,entity_type,entity_id,metadata_json)
    values (p_actor,'v2.partner.payment_recorded','partner_payment',v_id,
      jsonb_build_object('settlement_id',p_settlement,'transfer_id',v_transfer.id,
        'amount_cents',p_amount_cents));
  return v_id;
end;
$$;

create function public.v2_record_commission_allocation(p_accrual uuid,p_amount_cents bigint,
  p_transfer uuid,p_key text,p_actor uuid)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare v_accrual public.v2_commission_accruals; v_existing public.v2_commission_payments;
  v_paid bigint; v_transfer public.v2_external_transfers; v_id uuid;
begin
  if length(btrim(coalesce(p_key,''))) = 0 or p_amount_cents is null or p_amount_cents <= 0 then
    raise exception 'Commission request key and positive allocation required'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(btrim(p_key),0));
  select * into v_existing from public.v2_commission_payments where idempotency_key = btrim(p_key);
  if found then
    if v_existing.transfer_id is distinct from p_transfer or v_existing.accrual_id is distinct from p_accrual
       or v_existing.amount_cents is distinct from p_amount_cents then
      raise exception 'Payment replay mismatch'; end if;
    return v_existing.id;
  end if;
  select * into v_accrual from public.v2_commission_accruals
    where id = p_accrual for update;
  if not found then raise exception 'Commission accrual not found'; end if;
  select coalesce(sum(amount_cents),0) into v_paid from public.v2_commission_payments
    where accrual_id = p_accrual;
  if v_paid + p_amount_cents > v_accrual.amount_cents then
    raise exception 'Payment exceeds accrued commission'; end if;
  select * into v_transfer from public.v2_external_transfers where id = p_transfer for update;
  if not found then raise exception 'External transfer identity not found'; end if;
  insert into public.v2_commission_payments(accrual_id,amount_cents,paid_at,
    payment_reference,recorded_by,transfer_id,idempotency_key)
    values (p_accrual,p_amount_cents,v_transfer.paid_at,v_transfer.reference,p_actor,
      v_transfer.id,btrim(p_key)) returning id into v_id;
  insert into public.audit_log(actor_user_id,action,entity_type,entity_id,metadata_json)
    values (p_actor,'v2.commission.payment_recorded','commission_payment',v_id,
      jsonb_build_object('accrual_id',p_accrual,'transfer_id',v_transfer.id,
        'amount_cents',p_amount_cents));
  return v_id;
end;
$$;

revoke execute on function public.v2_register_transfer(uuid,text,bigint,timestamptz,text,text,uuid) from public,anon,authenticated;
grant execute on function public.v2_register_transfer(uuid,text,bigint,timestamptz,text,text,uuid) to service_role;

revoke execute on function public.v2_verify_transfer(uuid,uuid,bigint,timestamptz,text,text,text,text,uuid) from public,anon,authenticated;
grant execute on function public.v2_verify_transfer(uuid,uuid,bigint,timestamptz,text,text,text,text,uuid) to service_role;

revoke execute on function public.v2_record_partner_allocation(uuid,bigint,uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.v2_record_partner_allocation(uuid,bigint,uuid,text,uuid) to service_role;

revoke execute on function public.v2_record_commission_allocation(uuid,bigint,uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.v2_record_commission_allocation(uuid,bigint,uuid,text,uuid) to service_role;
