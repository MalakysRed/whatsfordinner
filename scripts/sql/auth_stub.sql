-- Minimal stand-in for the parts of Supabase that the migrations depend on, so
-- they can be applied to a plain Postgres cluster for verification.
--
-- This file is NEVER applied to a real Supabase project — Supabase provides all
-- of it. It exists so that `pnpm db:verify` can prove the migrations and the RLS
-- policies actually work without Docker or a hosted project.

create schema if not exists auth;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin bypassrls;
  end if;
end
$$;

-- Supabase's auth.users has far more columns; these are the ones the migrations
-- read (id, email, raw_user_meta_data).
create table auth.users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  raw_user_meta_data jsonb,
  created_at timestamptz not null default now()
);

-- Real auth.uid() reads the sub claim out of the request JWT. The stub reads a
-- session GUC instead, so a test can "become" a user with a plain SET.
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('test.user_id', true), '')::uuid;
$$;

grant usage on schema public to anon, authenticated, service_role;
grant usage on schema auth to anon, authenticated, service_role;
