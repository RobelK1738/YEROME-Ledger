-- Shared planning inputs; historical finance records are unchanged.
create table public.v3_projection_plans (
  owner_id uuid primary key references public.owners(id) on delete cascade,
  partnership text check (partnership in ('DIRECT_2_WAY','MIKI_REFERRAL_2_WAY')),
  apartment_actual_cents bigint check (apartment_actual_cents >= 0),
  apartment_charge_cents bigint check (apartment_charge_cents >= 0),
  next_fund_date date,
  instructions text not null default '' check (length(instructions) <= 5000),
  updated_at timestamptz not null default now(), updated_by uuid not null
);
alter table public.v3_projection_plans enable row level security;
revoke all on public.v3_projection_plans from public, anon, authenticated;
grant select, insert, update on public.v3_projection_plans to service_role;
-- Explicit privileges needed by the invoker routine below.
grant select, update on public.owners to service_role;
grant insert on public.audit_log to service_role;

create function public.v3_save_projection_plan(p_owner uuid, p_patch jsonb, p_actor uuid)
returns void language plpgsql security invoker set search_path = '' as $$
declare v_plan public.v3_projection_plans;
begin
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' or p_actor is null then
    raise exception 'Planning inputs required';
  end if;
  perform 1 from public.owners where id = p_owner for update;
  if not found then raise exception 'Owner not found'; end if;
  insert into public.v3_projection_plans(owner_id,updated_by) values(p_owner,p_actor)
    on conflict (owner_id) do nothing;
  select * into v_plan from public.v3_projection_plans where owner_id = p_owner;
  if p_patch ? 'partnership' then
    v_plan.partnership := p_patch->>'partnership';
    if v_plan.partnership is null or v_plan.partnership not in ('DIRECT_2_WAY','MIKI_REFERRAL_2_WAY') then
      raise exception 'Invalid partnership';
    end if;
  end if;
  if p_patch ? 'apartment_actual_cents' then v_plan.apartment_actual_cents := (p_patch->>'apartment_actual_cents')::bigint; end if;
  if p_patch ? 'apartment_charge_cents' then v_plan.apartment_charge_cents := (p_patch->>'apartment_charge_cents')::bigint; end if;
  if p_patch ? 'next_fund_date' then v_plan.next_fund_date := (p_patch->>'next_fund_date')::date; end if;
  if p_patch ? 'instructions' then v_plan.instructions := p_patch->>'instructions'; end if;
  update public.v3_projection_plans set partnership = v_plan.partnership,
    apartment_actual_cents = v_plan.apartment_actual_cents, apartment_charge_cents = v_plan.apartment_charge_cents,
    next_fund_date = v_plan.next_fund_date, instructions = v_plan.instructions,
    updated_at = now(), updated_by = p_actor where owner_id = p_owner;
  insert into public.audit_log(actor_user_id,action,entity_type,entity_id,metadata_json)
    values(p_actor,'v3.projection_plan.saved','owner',p_owner,jsonb_build_object('patch',p_patch));
end;
$$;
revoke execute on function public.v3_save_projection_plan(uuid,jsonb,uuid) from public, anon, authenticated;
grant execute on function public.v3_save_projection_plan(uuid,jsonb,uuid) to service_role;
