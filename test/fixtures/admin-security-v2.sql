-- Disposable-only RLS and identity lifecycle checks. The initial security
-- fixture pinned user 4000...4, and all sessions below are synthetic.
set role authenticated;
select set_config('request.jwt.claims',jsonb_build_object(
  'sub','10000000-0000-0000-0000-000000000001',
  'session_id','11111111-1111-1111-1111-111111111111',
  'iat',extract(epoch from now())::bigint,'aal','aal1',
  'app_metadata',jsonb_build_object('role','admin'),
  'user_metadata',jsonb_build_object('role','admin'))::text,false);
do $$ declare t text; n bigint;
begin
  if public.is_admin() or public.current_owner_id() is not null then
    raise exception 'Second Admin JWT or editable metadata gained privilege'; end if;
  foreach t in array array['owners','jobs','cost_internal_details','v2_external_transfers',
    'v2_transfer_verifications','v2_partner_payments','v2_commission_payments',
    'v2_settlement_batches','v2_settlement_policy_approvals'] loop
    execute format('select count(*) from public.%I',t) into n;
    if n <> 0 then raise exception 'Second Admin token can read %',t; end if;
  end loop;
  if to_regprocedure('public.v2_authorize_session(uuid,uuid,bigint,text,text,text)') is not null
     or to_regprocedure('private.authorize_session(uuid,uuid,bigint,text,text,text)') is not null then
    raise exception 'Obsolete six-argument Admin authorization remains'; end if;
  if has_function_privilege('authenticated','public.v2_authorize_session(uuid,uuid,bigint,text,text)','EXECUTE')
     or has_function_privilege('authenticated','public.v2_pin_admin(uuid,text)','EXECUTE')
     or has_function_privilege('authenticated','public.v2_admin_pin_status()','EXECUTE') then
    raise exception 'Browser may execute privileged identity routine'; end if;
end $$;
reset role;

-- Simulate a pre-existing second role-bearing Auth identity that escaped the
-- new lifecycle trigger. This fixture is disposable and rolls it back.
begin;
set session_replication_role = replica;
update auth.users set raw_app_meta_data='{"role":"admin"}'::jsonb
  where id='10000000-0000-0000-0000-000000000001';
set session_replication_role = origin;
set role authenticated;
select set_config('request.jwt.claims',jsonb_build_object(
  'sub','10000000-0000-0000-0000-000000000001',
  'session_id','11111111-1111-1111-1111-111111111111',
  'iat',extract(epoch from now())::bigint,'aal','aal1',
  'app_metadata',jsonb_build_object('role','admin'))::text,true);
do $$ declare t text; n bigint;
begin
  if public.is_admin() or private.current_authorization() is not null then
    raise exception 'Second live Admin-role identity gained authorization'; end if;
  foreach t in array array['owners','jobs','cost_internal_details','v2_external_transfers',
    'v2_transfer_verifications','v2_partner_payments','v2_commission_payments',
    'v2_settlement_batches','v2_settlement_policy_approvals'] loop
    execute format('select count(*) from public.%I',t) into n;
    if n <> 0 then raise exception 'Second live Admin-role user can read %',t; end if;
  end loop;
end $$;
reset role;
rollback;

begin;
delete from private.admin_identity;
set role authenticated;
select set_config('request.jwt.claims',jsonb_build_object(
  'sub','10000000-0000-0000-0000-000000000001',
  'session_id','11111111-1111-1111-1111-111111111111',
  'iat',extract(epoch from now())::bigint,'aal','aal1',
  'app_metadata',jsonb_build_object('role','owner'))::text,true);
do $$ begin
  if private.current_authorization() is not null then
    raise exception 'Missing Admin pin did not fail closed'; end if;
end $$;
reset role;
rollback;

-- Auth itself rejects any second role=admin account or Owner promotion.
do $$ begin
  begin
    update auth.users set raw_app_meta_data='{"role":"admin"}'::jsonb
      where id='10000000-0000-0000-0000-000000000001';
    raise exception 'Owner was promoted to Admin';
  exception when others then
    if SQLERRM <> 'Only the designated canonical Admin is permitted' then raise; end if;
  end;
  begin
    insert into auth.users(id,email,raw_app_meta_data,email_confirmed_at)
      values ('55555555-5555-5555-5555-555555555555','other@example.test',
        '{"role":"admin"}'::jsonb,now());
    raise exception 'Second Admin account was created';
  exception when others then
    if SQLERRM <> 'Only the designated canonical Admin is permitted' then raise; end if;
  end;
  begin
    update public.owners set auth_user_id='40000000-0000-0000-0000-000000000004'
      where id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    raise exception 'Admin assigned to Owner profile';
  exception when others then
    if SQLERRM <> 'Admin identity cannot be managed through Owner records' then raise; end if;
  end;
end $$;

-- The pinned Admin is authorized with a normal password-authenticated AAL1 session.
-- Live session, role and canonical UUID checks remain mandatory.
begin;
set role authenticated;
select set_config('request.jwt.claims',jsonb_build_object(
  'sub','40000000-0000-0000-0000-000000000004',
  'session_id','44444444-0000-0000-0000-000000000004',
  'iat',extract(epoch from now())::bigint,'aal','aal1',
  'app_metadata',jsonb_build_object('role','admin'))::text,true);
do $$ begin
  if not public.is_admin() or private.current_authorization() <> 'admin' then
    raise exception 'Valid AAL1 pinned Admin session was rejected'; end if;
end $$;
reset role;
rollback;

begin;
delete from auth.sessions where id='44444444-0000-0000-0000-000000000004';
set role authenticated;
select set_config('request.jwt.claims',jsonb_build_object(
  'sub','40000000-0000-0000-0000-000000000004',
  'session_id','44444444-0000-0000-0000-000000000004',
  'iat',extract(epoch from now())::bigint,'aal','aal1',
  'app_metadata',jsonb_build_object('role','admin'))::text,true);
do $$ begin if public.is_admin() then raise exception 'Deleted session retained Admin access'; end if; end $$;
reset role;
rollback;

begin;
update auth.sessions set created_at=now() - interval '13 hours'
  where id='44444444-0000-0000-0000-000000000004';
set role authenticated;
select set_config('request.jwt.claims',jsonb_build_object(
  'sub','40000000-0000-0000-0000-000000000004',
  'session_id','44444444-0000-0000-0000-000000000004',
  'iat',extract(epoch from now())::bigint,'aal','aal1',
  'app_metadata',jsonb_build_object('role','admin'))::text,true);
do $$ begin if public.is_admin() then raise exception 'Expired Admin session retained access'; end if; end $$;
reset role;
rollback;



begin;
update auth.users set encrypted_password='rotated-synthetic-hash'
  where id='40000000-0000-0000-0000-000000000004';
set role authenticated;
select set_config('request.jwt.claims',jsonb_build_object(
  'sub','40000000-0000-0000-0000-000000000004',
  'session_id','44444444-0000-0000-0000-000000000004',
  'iat',extract(epoch from now())::bigint,'aal','aal1',
  'app_metadata',jsonb_build_object('role','admin'))::text,true);
do $$ begin if public.is_admin() then raise exception 'Password rotation retained old session'; end if; end $$;
reset role;
rollback;

begin;
insert into public.tax_year_settings(year,filing_status,standard_deduction_cents,
  federal_brackets_json,social_security_rate,social_security_wage_base_cents,
  medicare_rate,additional_medicare_rate,additional_medicare_threshold_cents)
  values (2099,'single',0,'[]',0,0,0,0,0);
update public.owners set status='archived' where id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
set role authenticated;
select set_config('request.jwt.claims',jsonb_build_object(
  'sub','10000000-0000-0000-0000-000000000001',
  'session_id','11111111-1111-1111-1111-111111111111',
  'iat',extract(epoch from now())::bigint,'aal','aal1',
  'app_metadata',jsonb_build_object('role','owner'))::text,true);
do $$ begin
  if public.current_owner_id() is not null or private.current_authorization() is not null then
    raise exception 'Archived Owner retained access'; end if;
  if exists (select 1 from public.tax_year_settings) then
    raise exception 'Archived Owner retained global data read access'; end if;
end $$;
reset role;
rollback;

begin;
update public.owners set status='archived'
  where id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
update public.owners set status='active'
  where id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
set role authenticated;
select set_config('request.jwt.claims',jsonb_build_object(
  'sub','10000000-0000-0000-0000-000000000001',
  'session_id','11111111-1111-1111-1111-111111111111',
  'iat',extract(epoch from now())::bigint,'aal','aal1',
  'app_metadata',jsonb_build_object('role','owner'))::text,true);
do $$ begin
  if private.current_authorization() is not null then
    raise exception 'Reactivated Owner retained pre-archive session'; end if;
end $$;
reset role;
rollback;

-- Pin is idempotent, but a conflicting principal cannot be installed.
do $$ begin
  if public.v2_pin_admin('40000000-0000-0000-0000-000000000004','synthetic-repeat') <>
     '40000000-0000-0000-0000-000000000004' then raise exception 'Pin replay failed'; end if;
  if (select count(*) from private.admin_identity) <> 1 then raise exception 'Multiple pins created'; end if;
  if (select count(*) from auth.users where raw_app_meta_data->>'role'='admin') <> 1 then
    raise exception 'A second Admin exists'; end if;
end $$;
