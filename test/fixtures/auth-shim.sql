-- Disposable PostgreSQL stand-in for Supabase roles and JWT helpers.
create schema auth;
create schema extensions;
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;
create table auth.users (id uuid primary key, email text, raw_app_meta_data jsonb default '{}',
  raw_user_meta_data jsonb default '{}', encrypted_password text, email_confirmed_at timestamptz,
  banned_until timestamptz, deleted_at timestamptz);
create table auth.mfa_factors (id uuid primary key,user_id uuid references auth.users on delete cascade,
  status text);
create table auth.sessions (id uuid primary key,user_id uuid references auth.users on delete cascade,
  aal text, factor_id uuid references auth.mfa_factors on delete cascade, created_at timestamptz default now(),
  refreshed_at timestamptz default now(),not_after timestamptz);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'sub', '')::uuid;
$$;
create function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb);
$$;
grant usage on schema auth to authenticated, anon;
grant execute on function auth.uid() to authenticated, anon;
grant execute on function auth.jwt() to authenticated, anon;
