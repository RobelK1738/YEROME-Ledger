-- No live identity is seeded. Pin explicitly after inventory and password rotation.
create table private.admin_identity (
  singleton boolean primary key default true check (singleton),
  auth_user_id uuid not null unique references auth.users(id) on delete restrict,
  email text not null check (email = 'robiemelaku@gmail.com'),
  pinned_at timestamptz not null default now(),
  recovery_reference text not null check (length(btrim(recovery_reference)) > 0)
);
create table private.session_revocations (
  auth_user_id uuid primary key,
  revoked_before timestamptz not null,
  reason text not null
);
alter table private.admin_identity enable row level security;
alter table private.session_revocations enable row level security;
revoke all on private.admin_identity,private.session_revocations from public,anon,authenticated,service_role;

-- This internal helper is the single backend/database authorization model.
-- Read live identity, session, factor and revocation state; a stale JWT alone
-- can never retain privilege. Only the service RPC and no-argument RLS wrappers
-- below can call it, not a browser supplying another user's identity.
create function private.authorize_session(p_user uuid,p_session uuid,p_iat bigint,
  p_aal text,p_role text,p_admin_email text)
returns text language plpgsql stable security definer set search_path = '' as $$
declare u auth.users; s auth.sessions; pin private.admin_identity; cutoff timestamptz;
begin
  if p_user is null or p_session is null or p_iat is null or p_iat <= 0
     or p_iat > extract(epoch from now()) + 30 then return null; end if;
  select * into u from auth.users where id = p_user;
  if not found or u.deleted_at is not null or (u.banned_until is not null and u.banned_until > now())
     or u.email_confirmed_at is null or u.raw_app_meta_data->>'role' is distinct from p_role then return null; end if;
  select * into s from auth.sessions where id = p_session and user_id = p_user;
  if not found or s.created_at is null or (s.not_after is not null and s.not_after <= now())
     or s.created_at < now() - interval '12 hours' then return null; end if;
  select revoked_before into cutoff from private.session_revocations where auth_user_id = p_user;
  if cutoff is not null and (s.created_at <= cutoff or p_iat < floor(extract(epoch from cutoff))) then return null; end if;
  if (select count(*) from private.admin_identity) <> 1 then return null; end if;
  if p_role = 'admin' then
    select * into pin from private.admin_identity;
    if pin.auth_user_id <> p_user or lower(u.email) is distinct from pin.email
       or p_admin_email is distinct from pin.email then return null; end if;
    if p_aal = 'aal2' and s.aal::text = 'aal2' and exists (
        select 1 from auth.mfa_factors f where f.id = s.factor_id and f.user_id = p_user
          and f.status::text = 'verified') then return 'admin'; end if;
    return 'admin_mfa_required';
  end if;
  if p_role = 'owner' and exists (select 1 from public.owners where auth_user_id = p_user and status = 'active')
     and not exists (select 1 from private.admin_identity where auth_user_id = p_user) then return 'owner'; end if;
  return null;
end;
$$;
revoke execute on function private.authorize_session(uuid,uuid,bigint,text,text,text) from public,anon,authenticated;
grant execute on function private.authorize_session(uuid,uuid,bigint,text,text,text) to service_role;

create function private.current_authorization() returns text
language plpgsql stable security definer set search_path = '' as $$
declare claims jsonb := auth.jwt();
begin
  return private.authorize_session(auth.uid(),(claims->>'session_id')::uuid,
    (claims->>'iat')::bigint,claims->>'aal',claims->'app_metadata'->>'role',
    (select email from private.admin_identity where singleton));
exception when invalid_text_representation or numeric_value_out_of_range then return null;
end;
$$;
revoke execute on function private.current_authorization() from public,anon;
grant execute on function private.current_authorization() to authenticated;
create or replace function public.is_admin() returns boolean
language sql stable security invoker set search_path = '' as $$
  select coalesce(private.current_authorization() = 'admin',false);
$$;
create function private.authorized_owner_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select id from public.owners where auth_user_id = auth.uid() and status = 'active'
    and private.current_authorization() = 'owner';
$$;
revoke execute on function private.authorized_owner_id() from public,anon;
grant execute on function private.authorized_owner_id() to authenticated;
create or replace function public.current_owner_id() returns uuid
language sql stable security invoker set search_path = '' as $$ select private.authorized_owner_id(); $$;
create or replace function public.current_owner_job_ids() returns setof uuid
language sql stable security definer set search_path = '' as $$
  select id from public.jobs where owner_id = public.current_owner_id();
$$;
create or replace function public.current_owner_referral_ids() returns setof uuid
language sql stable security definer set search_path = '' as $$
  select id from public.referrals where referrer_owner_id = public.current_owner_id();
$$;
create or replace function public.current_owner_allocated_cost_ids() returns setof uuid
language sql stable security definer set search_path = '' as $$
  select distinct ca.cost_id from public.cost_allocations ca join public.jobs j on j.id = ca.job_id
    where j.owner_id = public.current_owner_id();
$$;

create function public.v2_authorize_session(p_user uuid,p_session uuid,p_iat bigint,
  p_aal text,p_role text,p_admin_email text)
returns text language sql stable security invoker set search_path = '' as $$
  select private.authorize_session(p_user,p_session,p_iat,p_aal,p_role,p_admin_email);
$$;
revoke execute on function public.v2_authorize_session(uuid,uuid,bigint,text,text,text) from public,anon,authenticated;
grant execute on function public.v2_authorize_session(uuid,uuid,bigint,text,text,text) to service_role;

create function private.pin_admin(p_user uuid,p_reference text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare u auth.users; pin private.admin_identity;
begin
  perform pg_catalog.pg_advisory_xact_lock(746026001);
  if length(btrim(coalesce(p_reference,''))) = 0 then raise exception 'Audited provisioning reference required'; end if;
  select * into u from auth.users where id = p_user;
  if not found or lower(u.email) is distinct from 'robiemelaku@gmail.com'
     or u.raw_app_meta_data->>'role' is distinct from 'admin' or u.deleted_at is not null
     or u.email_confirmed_at is null or (u.banned_until is not null and u.banned_until > now()) then
    raise exception 'Designated active confirmed Admin required'; end if;
  if exists (select 1 from auth.users where id <> p_user and raw_app_meta_data->>'role' = 'admin') then
    raise exception 'Conflicting Admin identities require independent review'; end if;
  select * into pin from private.admin_identity;
  if found then
    if pin.auth_user_id <> p_user or pin.email <> lower(u.email) then
      raise exception 'Canonical identity conflict; authorized recovery required'; end if;
    return pin.auth_user_id;
  end if;
  if exists (select 1 from public.owners where auth_user_id = p_user) then
    raise exception 'Admin must not be linked to an Owner account'; end if;
  insert into private.admin_identity(auth_user_id,email,recovery_reference)
    values (p_user,lower(u.email),btrim(p_reference));
  insert into public.audit_log(actor_user_id,action,entity_type,entity_id,metadata_json)
    values (p_user,'security.admin_pinned','auth_user',p_user,jsonb_build_object('reference',p_reference));
  return p_user;
end;
$$;
revoke execute on function private.pin_admin(uuid,text) from public,anon,authenticated;
grant execute on function private.pin_admin(uuid,text) to service_role;
create function public.v2_pin_admin(p_user uuid,p_reference text) returns uuid
language sql security invoker set search_path = '' as $$ select private.pin_admin(p_user,p_reference); $$;
revoke execute on function public.v2_pin_admin(uuid,text) from public,anon,authenticated;
grant execute on function public.v2_pin_admin(uuid,text) to service_role;

-- Identity lifecycle guard: no public/Owner workflow can add another Admin or
-- repurpose the pinned account. Recovery requires a separately authorized DBA
-- transaction; there is intentionally no HTTP recovery or override parameter.
create function private.guard_auth_identity() returns trigger
language plpgsql security definer set search_path = '' as $$
declare pin private.admin_identity;
begin
  perform pg_catalog.pg_advisory_xact_lock(746026001);
  select * into pin from private.admin_identity;
  if new.raw_app_meta_data->>'role' = 'admin' then
    if lower(new.email) is distinct from 'robiemelaku@gmail.com' or
       (pin.auth_user_id is not null and pin.auth_user_id <> new.id) or
       exists (select 1 from auth.users where id <> new.id and raw_app_meta_data->>'role' = 'admin') then
      raise exception 'Only the designated canonical Admin is permitted'; end if;
  end if;
  if pin.auth_user_id = new.id and (lower(new.email) is distinct from pin.email or
      new.raw_app_meta_data->>'role' is distinct from 'admin') then
    raise exception 'Canonical Admin identity changes require authorized recovery'; end if;
  if tg_op = 'UPDATE' and (new.encrypted_password is distinct from old.encrypted_password
      or new.email is distinct from old.email or
      new.raw_app_meta_data->>'role' is distinct from old.raw_app_meta_data->>'role'
      or new.banned_until is distinct from old.banned_until) then
    insert into private.session_revocations(auth_user_id,revoked_before,reason)
      values (new.id,clock_timestamp(),'identity_security_changed')
      on conflict (auth_user_id) do update set revoked_before = excluded.revoked_before,reason = excluded.reason;
    insert into public.audit_log(actor_user_id,action,entity_type,entity_id,metadata_json)
      values (new.id,'security.identity_sessions_revoked','auth_user',new.id,'{}');
  end if;
  return new;
end;
$$;
revoke execute on function private.guard_auth_identity() from public,anon,authenticated,service_role;
create trigger yerome_guard_auth_identity before insert or update on auth.users
  for each row execute function private.guard_auth_identity();

create function private.guard_owner_identity() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.auth_user_id is not null and (exists (
      select 1 from private.admin_identity where auth_user_id = new.auth_user_id) or exists (
      select 1 from auth.users where id = new.auth_user_id and raw_app_meta_data->>'role' = 'admin')) then
    raise exception 'Admin identity cannot be managed through Owner records'; end if;
  if tg_op = 'UPDATE' and new.status is distinct from old.status and new.auth_user_id is not null then
    insert into private.session_revocations(auth_user_id,revoked_before,reason)
      values (new.auth_user_id,clock_timestamp(),'owner_status_changed')
      on conflict (auth_user_id) do update set revoked_before = excluded.revoked_before,reason = excluded.reason;
  end if;
  return new;
end;
$$;
revoke execute on function private.guard_owner_identity() from public,anon,authenticated,service_role;
create trigger yerome_guard_owner_identity before insert or update on public.owners
  for each row execute function private.guard_owner_identity();

create function public.v2_admin_pin_status() returns uuid
language sql stable security definer set search_path = '' as $$
  select auth_user_id from private.admin_identity where singleton;
$$;
revoke execute on function public.v2_admin_pin_status() from public,anon,authenticated;
grant execute on function public.v2_admin_pin_status() to service_role;

-- A disabled or expired identity must not retain the broad legacy read policy
-- for otherwise harmless global tax parameters. Every signed-in read now
-- requires the same live session and active account check as finance policies.
drop policy if exists tax_year_settings_select_auth on public.tax_year_settings;
create policy tax_year_settings_select_active on public.tax_year_settings
  for select to authenticated using (private.current_authorization() in ('admin','owner'));
