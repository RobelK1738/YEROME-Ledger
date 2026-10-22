-- Production already applied the earlier six-argument, MFA-gated migration.
-- This forward migration gives that schema the same password-only authorization
-- as a fresh install of the revised twelve migrations. Apply during a held
-- maintenance window and deploy the matching application before reopening it.
create or replace function private.authorize_session(p_user uuid,p_session uuid,p_iat bigint,
  p_role text,p_admin_email text)
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
    return 'admin';
  end if;
  if p_role = 'owner' and exists (select 1 from public.owners where auth_user_id = p_user and status = 'active')
     and not exists (select 1 from private.admin_identity where auth_user_id = p_user) then return 'owner'; end if;
  return null;
end;
$$;
revoke execute on function private.authorize_session(uuid,uuid,bigint,text,text)
  from public,anon,authenticated;
grant execute on function private.authorize_session(uuid,uuid,bigint,text,text) to service_role;

create or replace function private.current_authorization() returns text
language plpgsql stable security definer set search_path = '' as $$
declare claims jsonb := auth.jwt();
begin
  return private.authorize_session(auth.uid(),(claims->>'session_id')::uuid,
    (claims->>'iat')::bigint,claims->'app_metadata'->>'role',
    (select email from private.admin_identity where singleton));
exception when invalid_text_representation or numeric_value_out_of_range then return null;
end;
$$;
revoke execute on function private.current_authorization() from public,anon;
grant execute on function private.current_authorization() to authenticated;

create or replace function public.v2_authorize_session(p_user uuid,p_session uuid,p_iat bigint,
  p_role text,p_admin_email text)
returns text language sql stable security invoker set search_path = '' as $$
  select private.authorize_session(p_user,p_session,p_iat,p_role,p_admin_email);
$$;
revoke execute on function public.v2_authorize_session(uuid,uuid,bigint,text,text)
  from public,anon,authenticated;
grant execute on function public.v2_authorize_session(uuid,uuid,bigint,text,text) to service_role;

-- The old application must be held from traffic until the matching build is
-- live. Removal is atomic with the new function definitions in this migration.
drop function if exists public.v2_authorize_session(uuid,uuid,bigint,text,text,text);
drop function if exists private.authorize_session(uuid,uuid,bigint,text,text,text);
