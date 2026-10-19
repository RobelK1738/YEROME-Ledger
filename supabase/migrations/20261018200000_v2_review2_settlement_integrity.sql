-- Second review: verify the posted check allocation in the database and
-- permit only typed, formula-derived receipt-correction reconciliations.
-- Existing migration files remain immutable; no policy approval is inserted.

grant usage on schema private to service_role;

create function private.v2_weighted_cents(p_total bigint,p_weights bigint[])
returns bigint[] language plpgsql immutable set search_path = '' as $$
declare v_weights bigint[] := p_weights; v_den numeric; v_magnitude numeric;
  v_result bigint[]; v_remaining bigint; v_rank record; v_index integer;
  v_sign integer := case when p_total < 0 then -1 else 1 end;
begin
  if p_total is null or p_weights is null or coalesce(array_length(p_weights,1),0) = 0
     or abs(p_total::numeric) > 9007199254740991
     or exists (select 1 from unnest(p_weights) w where w is null or w < 0) then
    raise exception 'Invalid weighted-cent allocation'; end if;
  select sum(w::numeric) into v_den from unnest(v_weights) w;
  if v_den = 0 then
    v_weights := array_fill(1::bigint,array[array_length(p_weights,1)]);
    v_den := array_length(p_weights,1);
  end if;
  v_magnitude := abs(p_total::numeric);
  select array_agg(floor(v_magnitude * w::numeric / v_den)::bigint order by idx)
    into v_result from unnest(v_weights) with ordinality as t(w,idx);
  select v_magnitude::bigint - sum(part) into v_remaining from unnest(v_result) part;
  for v_rank in select idx, mod(v_magnitude * w::numeric,v_den) as remainder
      from unnest(v_weights) with ordinality as t(w,idx)
      order by remainder desc,idx loop
    exit when v_remaining = 0;
    v_result[v_rank.idx] := v_result[v_rank.idx] + 1;
    v_remaining := v_remaining - 1;
  end loop;
  for v_index in 1..array_length(v_result,1) loop
    v_result[v_index] := v_result[v_index] * v_sign;
  end loop;
  return v_result;
end;
$$;
revoke execute on function private.v2_weighted_cents(bigint,bigint[])
  from public,anon,authenticated;
grant execute on function private.v2_weighted_cents(bigint,bigint[]) to service_role;

create function private.v2_verify_batch_allocations() returns trigger
language plpgsql set search_path = '' as $$
declare v_weights bigint[]; v_quoted bigint[]; v_actual bigint[];
  v_partner bigint[]; v_commission bigint[]; v_gang bigint[];
  v_line jsonb; v_index integer := 0; v_net bigint;
begin
  if jsonb_typeof(new.snapshot_json->'lines') <> 'array' then
    raise exception 'Settlement lines are required'; end if;
  select array_agg((line->>'sourceNetCents')::bigint
      order by line->>'payDate',(line->>'paycheckId') collate "C")
    into v_weights from jsonb_array_elements(new.snapshot_json->'lines') line;
  v_quoted := private.v2_weighted_cents((new.snapshot_json->>'quotedCostCents')::bigint,v_weights);
  v_actual := private.v2_weighted_cents((new.snapshot_json->>'actualCostCents')::bigint,v_weights);
  v_partner := private.v2_weighted_cents((new.snapshot_json->>'partnerDueCents')::bigint,v_weights);
  v_commission := private.v2_weighted_cents((new.snapshot_json->>'commissionCents')::bigint,v_weights);
  v_gang := private.v2_weighted_cents((new.snapshot_json->>'gangCutCents')::bigint,v_weights);
  for v_line in select line from jsonb_array_elements(new.snapshot_json->'lines') line
      order by line->>'payDate',(line->>'paycheckId') collate "C" loop
    v_index := v_index + 1;
    v_net := (v_line->>'sourceNetCents')::bigint;
    if (v_line->>'quotedCostCents')::bigint is distinct from v_quoted[v_index]
       or (v_line->>'actualCostCents')::bigint is distinct from v_actual[v_index]
       or (v_line->>'partnerDueCents')::bigint is distinct from v_partner[v_index]
       or (v_line->>'commissionCents')::bigint is distinct from v_commission[v_index]
       or (v_line->>'gangCutCents')::bigint is distinct from v_gang[v_index]
       or (v_line->>'yeromeResidualCents')::bigint is distinct from
         v_net - v_actual[v_index] - v_partner[v_index]
           - v_commission[v_index] - v_gang[v_index] then
      raise exception 'Per-check settlement allocation does not match weighted cents';
    end if;
  end loop;
  return new;
end;
$$;
create trigger v2_verify_batch_allocations before insert on public.v2_settlement_batches
  for each row execute function private.v2_verify_batch_allocations();

create table public.v2_settlement_reconciliations (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.v2_settlement_batches(id) on delete restrict,
  corrected_settlement_id uuid not null references public.v2_payrun_settlements(id) on delete restrict,
  correction_id uuid not null unique references public.v2_paycheck_corrections(id) on delete restrict,
  idempotency_key text not null unique check (length(trim(idempotency_key)) > 0),
  created_at timestamptz not null default now(),
  created_by uuid not null
);
alter table public.v2_settlement_reconciliations enable row level security;
create policy v2_reconciliations_admin_select on public.v2_settlement_reconciliations
  for select to authenticated using (public.is_admin());
grant select on public.v2_settlement_reconciliations to authenticated;
grant select,insert on public.v2_settlement_reconciliations to service_role;
create trigger v2_reconciliations_immutable before update or delete on public.v2_settlement_reconciliations
  for each row execute function private.reject_v2_settlement_change();

alter table public.v2_settlement_adjustments add column reconciliation_id uuid
  references public.v2_settlement_reconciliations(id) on delete restrict;
alter table public.v2_settlement_adjustments add column quoted_cost_delta_cents bigint
  not null default 0;
-- Historical rows are retained, but every new adjustment needs a typed source.
alter table public.v2_settlement_adjustments add constraint v2_new_adjustments_typed
  check (reconciliation_id is not null) not valid;
revoke execute on function public.v2_record_settlement_adjustment(
  uuid,bigint,bigint,bigint,bigint,bigint,bigint,uuid,text,text,uuid)
  from service_role,public,anon,authenticated;

-- A correction to any check can reweight every line in the month. Stop all
-- further partner payments in that batch until the correction is reconciled.
create function private.v2_guard_partner_payment_batch() returns trigger
language plpgsql set search_path = '' as $$
declare v_settlement public.v2_payrun_settlements; v_due bigint; v_paid bigint;
begin
  select * into v_settlement from public.v2_payrun_settlements
    where id = new.settlement_id for update;
  if not found or v_settlement.batch_id is null then
    raise exception 'Posted settlement required for partner payment'; end if;
  if exists (select 1 from public.v2_payrun_settlements s
      join public.v2_paycheck_corrections c on c.job_paycheck_id = s.job_paycheck_id
        and c.sequence > s.receipt_correction_sequence
      where s.batch_id = v_settlement.batch_id
        and not exists (select 1 from public.v2_settlement_reconciliations r
          where r.batch_id = s.batch_id and r.correction_id = c.id)) then
    raise exception 'Month has an unreconciled receipt correction'; end if;
  select v_settlement.partner_due_cents + coalesce(sum(partner_due_delta_cents),0)
    into v_due from public.v2_settlement_adjustments
    where settlement_id = new.settlement_id;
  select coalesce(sum(amount_cents),0) into v_paid from public.v2_partner_payments
    where settlement_id = new.settlement_id;
  if new.amount_cents is null or new.amount_cents <= 0 or v_paid + new.amount_cents > v_due then
    raise exception 'Partner payment exceeds revised amount owed'; end if;
  return new;
end;
$$;
create trigger v2_guard_partner_payment_batch before insert on public.v2_partner_payments
  for each row execute function private.v2_guard_partner_payment_batch();

create function public.v2_reconcile_settlement_correction(
  p_settlement uuid,p_correction uuid,p_key text,p_actor uuid)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare v_line public.v2_payrun_settlements; v_batch public.v2_settlement_batches;
  v_correction public.v2_paycheck_corrections;
  v_existing public.v2_settlement_reconciliations; v_group uuid;
  v_ids uuid[]; v_weights bigint[]; v_index integer; v_corrected_net bigint;
  v_expected_sequence integer; v_net bigint; v_quoted bigint; v_actual bigint;
  v_partner bigint; v_commission bigint; v_gang bigint;
  v_quoted_alloc bigint[]; v_actual_alloc bigint[]; v_partner_alloc bigint[];
  v_commission_alloc bigint[]; v_gang_alloc bigint[];
  v_current_net bigint; v_current_quoted bigint; v_current_actual bigint; v_current_partner bigint;
  v_current_commission bigint; v_current_gang bigint; v_current_yerome bigint;
  v_target_yerome bigint; v_paid bigint;
  v_delta_net bigint; v_delta_quoted bigint; v_delta_actual bigint; v_delta_partner bigint;
  v_delta_commission bigint; v_delta_gang bigint; v_delta_yerome bigint;
begin
  if length(trim(coalesce(p_key,''))) = 0 or p_actor is null then
    raise exception 'Correction idempotency key and actor required'; end if;
  select * into v_existing from public.v2_settlement_reconciliations
    where idempotency_key = p_key;
  if found then
    if v_existing.corrected_settlement_id is distinct from p_settlement
       or v_existing.correction_id is distinct from p_correction then
      raise exception 'Correction replay mismatch'; end if;
    return v_existing.id;
  end if;
  select * into v_line from public.v2_payrun_settlements where id = p_settlement;
  if not found or v_line.batch_id is null then raise exception 'Posted settlement required'; end if;
  select * into v_batch from public.v2_settlement_batches where id = v_line.batch_id for update;
  if not found or not exists (select 1 from public.v2_settlement_policy_approvals policy
      where policy.id = v_batch.policy_id and policy.enabled) then
    raise exception 'Approved settlement required'; end if;
  perform 1 from public.v2_payrun_settlements where batch_id = v_batch.id
    order by id for update;
  if exists (select 1 from public.v2_settlement_adjustments a
      join public.v2_payrun_settlements s on s.id = a.settlement_id
      where s.batch_id = v_batch.id and a.reconciliation_id is null) then
    raise exception 'Untyped historical adjustment requires manual review'; end if;
  select * into v_correction from public.v2_paycheck_corrections
    where id = p_correction and job_paycheck_id = v_line.job_paycheck_id;
  if not found then raise exception 'Correction does not match settlement receipt'; end if;
  if exists (select 1 from public.v2_settlement_reconciliations
      where correction_id = p_correction) then
    raise exception 'Correction already reconciled under another key'; end if;
  select v_line.receipt_correction_sequence + count(*) into v_expected_sequence
    from public.v2_settlement_reconciliations
    where corrected_settlement_id = p_settlement;
  if v_correction.sequence <> v_expected_sequence + 1 then
    raise exception 'Reconcile receipt corrections in sequence'; end if;
  select array_agg(s.id order by s.pay_date,s.job_paycheck_id),
      array_agg(s.source_net_cents + coalesce(a.net_delta,0)
        order by s.pay_date,s.job_paycheck_id)
    into v_ids,v_weights
    from public.v2_payrun_settlements s
    left join lateral (select sum(after_tax_delta_cents) as net_delta
      from public.v2_settlement_adjustments where settlement_id = s.id) a on true
    where s.batch_id = v_batch.id;
  v_index := array_position(v_ids,p_settlement);
  if v_index is null then raise exception 'Settlement line not in batch'; end if;
  v_corrected_net := (v_correction.snapshot_json->>'actual_net_received_cents')::bigint;
  if v_corrected_net is null or v_corrected_net < 0 then
    raise exception 'Corrected receipt net required'; end if;
  v_weights[v_index] := v_corrected_net;
  select sum(weight) into v_net from unnest(v_weights) weight;
  v_quoted := (v_batch.snapshot_json->>'quotedCostCents')::bigint;
  v_actual := (v_batch.snapshot_json->>'actualCostCents')::bigint;
  v_commission := (v_batch.snapshot_json->>'commissionCents')::bigint;
  if v_net < v_quoted then raise exception 'Loss policy requires signed review'; end if;
  v_partner := round((v_net - v_quoted)::numeric / 2)::bigint;
  v_gang := round(v_net::numeric / 10)::bigint;
  v_quoted_alloc := private.v2_weighted_cents(v_quoted,v_weights);
  v_actual_alloc := private.v2_weighted_cents(v_actual,v_weights);
  v_partner_alloc := private.v2_weighted_cents(v_partner,v_weights);
  v_commission_alloc := private.v2_weighted_cents(v_commission,v_weights);
  v_gang_alloc := private.v2_weighted_cents(v_gang,v_weights);
  insert into public.v2_settlement_reconciliations(batch_id,corrected_settlement_id,
    correction_id,idempotency_key,created_by)
    values (v_batch.id,p_settlement,p_correction,trim(p_key),p_actor)
    returning id into v_group;
  for v_index in 1..array_length(v_ids,1) loop
    select * into v_line from public.v2_payrun_settlements where id = v_ids[v_index];
    select coalesce(sum(after_tax_delta_cents),0),coalesce(sum(quoted_cost_delta_cents),0),
        coalesce(sum(actual_cost_delta_cents),0),
        coalesce(sum(partner_due_delta_cents),0),coalesce(sum(commission_delta_cents),0),
        coalesce(sum(gang_delta_cents),0),coalesce(sum(yerome_delta_cents),0)
      into v_delta_net,v_delta_quoted,v_delta_actual,v_delta_partner,v_delta_commission,
        v_delta_gang,v_delta_yerome
      from public.v2_settlement_adjustments where settlement_id = v_line.id;
    v_current_net := v_line.source_net_cents + v_delta_net;
    v_current_quoted := v_line.quoted_cost_cents + v_delta_quoted;
    v_current_actual := v_line.actual_cost_cents + v_delta_actual;
    v_current_partner := v_line.partner_due_cents + v_delta_partner;
    v_current_commission := v_line.commission_cents + v_delta_commission;
    v_current_gang := v_line.gang_cut_cents + v_delta_gang;
    v_current_yerome := v_line.yerome_residual_cents + v_delta_yerome;
    v_target_yerome := v_weights[v_index] - v_actual_alloc[v_index]
      - v_partner_alloc[v_index] - v_commission_alloc[v_index] - v_gang_alloc[v_index];
    select coalesce(sum(amount_cents),0) into v_paid from public.v2_partner_payments
      where settlement_id = v_line.id;
    if v_paid > v_partner_alloc[v_index] then
      raise exception 'Corrected due is below recorded payment; approved credit or recovery needed';
    end if;
    v_delta_net := v_weights[v_index] - v_current_net;
    v_delta_quoted := v_quoted_alloc[v_index] - v_current_quoted;
    v_delta_actual := v_actual_alloc[v_index] - v_current_actual;
    v_delta_partner := v_partner_alloc[v_index] - v_current_partner;
    v_delta_commission := v_commission_alloc[v_index] - v_current_commission;
    v_delta_gang := v_gang_alloc[v_index] - v_current_gang;
    v_delta_yerome := v_target_yerome - v_current_yerome;
    if v_delta_net <> v_delta_actual + v_delta_partner + v_delta_commission
        + v_delta_gang + v_delta_yerome then
      raise exception 'Correction allocation failed cent conservation'; end if;
    if v_delta_net <> 0 or v_delta_quoted <> 0 or v_delta_actual <> 0 or v_delta_partner <> 0
       or v_delta_commission <> 0 or v_delta_gang <> 0 or v_delta_yerome <> 0
       or v_line.id = p_settlement then
      insert into public.v2_settlement_adjustments(settlement_id,reason,change_json,
        created_by,after_tax_delta_cents,quoted_cost_delta_cents,
        actual_cost_delta_cents,partner_due_delta_cents,
        commission_delta_cents,gang_delta_cents,yerome_delta_cents,
        receipt_correction_id,reconciliation_id,idempotency_key)
        values (v_line.id,'Formula reconciliation of receipt correction',
          jsonb_build_object('correction_id',p_correction,'reconciliation_id',v_group),
          p_actor,v_delta_net,v_delta_quoted,v_delta_actual,v_delta_partner,v_delta_commission,
          v_delta_gang,v_delta_yerome,p_correction,v_group,
          trim(p_key) || ':' || v_line.id);
    end if;
  end loop;
  insert into public.audit_log(actor_user_id,action,entity_type,entity_id,metadata_json)
    values (p_actor,'v2.settlement.receipt_reconciled','settlement_reconciliation',v_group,
      jsonb_build_object('batch_id',v_batch.id,'correction_id',p_correction));
  return v_group;
end;
$$;
revoke execute on function public.v2_reconcile_settlement_correction(uuid,uuid,text,uuid)
  from public,anon,authenticated;
grant execute on function public.v2_reconcile_settlement_correction(uuid,uuid,text,uuid)
  to service_role;
