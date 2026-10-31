-- New planning data remains API-only and the two saves preserve each other.
do $$ begin
  if has_table_privilege('anon','public.v3_projection_plans','select')
    or has_table_privilege('authenticated','public.v3_projection_plans','select')
    or has_table_privilege('authenticated','public.v3_projection_plans','update')
    or has_function_privilege('authenticated','public.v3_save_projection_plan(uuid,jsonb,uuid)','execute') then
    raise exception 'Planning API boundary failed';
  end if;
  if not (select relrowsecurity from pg_class where oid = 'public.v3_projection_plans'::regclass) then
    raise exception 'Planning RLS missing';
  end if;
end $$;
begin;
insert into public.owners(id,display_name,username,filing_status,state,status)
  values ('f3000000-0000-0000-0000-000000000001','Planning fixture','planning_fixture','single','TX','active');
set local role service_role;
select public.v3_save_projection_plan('f3000000-0000-0000-0000-000000000001',
  '{"partnership":"DIRECT_2_WAY","apartment_actual_cents":0,"apartment_charge_cents":0}',
  'f3000000-0000-0000-0000-000000000002');
select public.v3_save_projection_plan('f3000000-0000-0000-0000-000000000001',
  '{"next_fund_date":"2026-11-13","instructions":"Set aside the projected costs first."}',
  'f3000000-0000-0000-0000-000000000002');
do $$ begin
  if not exists (select 1 from public.v3_projection_plans where
    owner_id = 'f3000000-0000-0000-0000-000000000001' and partnership = 'DIRECT_2_WAY'
    and apartment_actual_cents = 0 and apartment_charge_cents = 0
    and next_fund_date = '2026-11-13' and instructions = 'Set aside the projected costs first.') then
    raise exception 'Planning patch lost inputs';
  end if;
end $$;
rollback;
