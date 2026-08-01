-- Proves the security model actually holds, rather than trusting that the
-- policies read correctly.
--
-- The assertion that matters is CHECK 5: household B querying household A's
-- ingredients gets zero rows from the database itself, not filtered results from
-- application code. Everything else here exists to make that one meaningful.
--
-- Note on style: psql does not interpolate :variables inside dollar-quoted
-- blocks, so assertions inside DO blocks look things up by name rather than
-- taking an id from \gset. Expected-failure cases turn ON_ERROR_STOP off around
-- the failing statement and then assert on the resulting state, which also
-- proves the write genuinely did not land rather than merely that it errored.
--
-- Run by `pnpm db:verify`. Any failed assertion raises and aborts the script.

\set ON_ERROR_STOP on
\pset pager off
\set QUIET on

-- ---------------------------------------------------------------------------
-- CHECK 1: closed signup rejects an uninvited email (FR1.5)
-- ---------------------------------------------------------------------------

\set ON_ERROR_STOP off
insert into auth.users (id, email)
values ('99999999-9999-9999-9999-999999999999', 'gatecrasher@example.com');
\set ON_ERROR_STOP on

do $$
begin
  if exists (select 1 from auth.users where email = 'gatecrasher@example.com') then
    raise exception 'FAIL check 1: uninvited email was allowed to sign up';
  end if;
end
$$;

\echo 'ok 1: uninvited signup rejected'

-- ---------------------------------------------------------------------------
-- CHECK 2: an allowlisted email may sign up, and gets a profile row
-- ---------------------------------------------------------------------------

insert into signup_allowlist (email) values
  ('nathan@example.com'),
  ('stranger@example.com');

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'nathan@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'stranger@example.com');

do $$
begin
  if (select count(*) from users) <> 2 then
    raise exception 'FAIL check 2: profile rows were not mirrored from auth.users';
  end if;
end
$$;

\echo 'ok 2: allowlisted signup accepted, profile mirrored'

-- ---------------------------------------------------------------------------
-- CHECK 3: household bootstrap creates settings and equipment
-- ---------------------------------------------------------------------------

select set_config('test.user_id', '11111111-1111-1111-1111-111111111111', false) \gset dummy_a_
select create_household_for_current_user('Bray kitchen') as household_a \gset

select set_config('test.user_id', '22222222-2222-2222-2222-222222222222', false) \gset dummy_b_
select create_household_for_current_user('Someone else') as household_b \gset

do $$
begin
  if (select count(*) from settings) <> 2 then
    raise exception 'FAIL check 3: settings row not created per household';
  end if;
  -- 23 pieces of equipment per household, from FR2.1.
  if (select count(*) from equipment) <> 46 then
    raise exception 'FAIL check 3: expected 46 equipment rows, got %',
      (select count(*) from equipment);
  end if;
  if (select count(*) from memberships where role = 'owner') <> 2 then
    raise exception 'FAIL check 3: creator was not made owner';
  end if;
end
$$;

\echo 'ok 3: household bootstrap seeded settings and equipment'

-- ---------------------------------------------------------------------------
-- CHECK 4: adopting the starter set fills the bank (FR3.4)
-- ---------------------------------------------------------------------------

select set_config('test.user_id', '11111111-1111-1111-1111-111111111111', false) \gset dummy_c_
select adopt_starter_ingredients();

do $$
declare
  adopted integer;
begin
  select count(*) into adopted
  from ingredients
  where household_id = (select id from households where name = 'Bray kitchen');

  if adopted < 100 then
    raise exception 'FAIL check 4: starter set adopted only % ingredients', adopted;
  end if;

  -- Staples came across as staples; they are what keeps shopping lists short.
  if not exists (
    select 1 from ingredients
    where name = 'Flaky sea salt' and staple
  ) then
    raise exception 'FAIL check 4: staple flags were not carried over';
  end if;
end
$$;

-- A recipe belonging to household A, used by the isolation checks below.
insert into recipes (household_id, created_by, title, base_servings, payload)
values (
  :'household_a',
  '11111111-1111-1111-1111-111111111111',
  'Secret family chilli',
  2,
  '{"title": "Secret family chilli"}'::jsonb
);

\echo 'ok 4: starter set adopted with flags intact'

-- ---------------------------------------------------------------------------
-- CHECK 5: RLS blocks cross-household reads
--
-- This is the one that matters. Everything above runs as the superuser, which
-- bypasses RLS; from here we become the `authenticated` role, which does not.
-- ---------------------------------------------------------------------------

set role authenticated;
select set_config('test.user_id', '22222222-2222-2222-2222-222222222222', false) \gset dummy_d_

do $$
declare
  visible_ingredients integer;
  visible_recipes integer;
  visible_settings integer;
  visible_households integer;
begin
  select count(*) into visible_ingredients from ingredients;
  select count(*) into visible_recipes from recipes;
  select count(*) into visible_settings from settings;
  select count(*) into visible_households from households;

  if visible_ingredients <> 0 then
    raise exception
      'FAIL check 5: household B can see % of household A''s ingredients',
      visible_ingredients;
  end if;

  if visible_recipes <> 0 then
    raise exception
      'FAIL check 5: household B can see % of household A''s recipes',
      visible_recipes;
  end if;

  -- B has its own settings row and must see exactly that one, not A's.
  if visible_settings <> 1 then
    raise exception
      'FAIL check 5: household B sees % settings rows, expected exactly its own',
      visible_settings;
  end if;

  if visible_households <> 1 then
    raise exception
      'FAIL check 5: household B sees % households, expected exactly its own',
      visible_households;
  end if;
end
$$;

\echo 'ok 5: cross-household reads return zero rows'

-- ---------------------------------------------------------------------------
-- CHECK 6: RLS blocks cross-household writes
-- ---------------------------------------------------------------------------

\set ON_ERROR_STOP off
insert into ingredients (household_id, name, category)
values (:'household_a', 'Trojan horse', 'vegetable');
\set ON_ERROR_STOP on

-- ---------------------------------------------------------------------------
-- CHECK 7: the signup allowlist is invisible to the client
-- ---------------------------------------------------------------------------

do $$
declare
  leaked integer;
begin
  begin
    select count(*) into leaked from signup_allowlist;
    if leaked <> 0 then
      raise exception 'FAIL check 7: allowlist leaked % rows to a signed-in user', leaked;
    end if;
  exception
    when insufficient_privilege then null;  -- No grant at all. Better still.
    when sqlstate 'P0001' then
      if sqlerrm like 'FAIL%' then raise; end if;
  end;
end
$$;

\echo 'ok 7: signup allowlist not readable by authenticated'

-- ---------------------------------------------------------------------------
-- CHECK 8: a member sees their own household's data
--
-- The mirror of check 5 — proves the policies are not simply denying everything,
-- which would pass every isolation test and ship a broken app.
-- ---------------------------------------------------------------------------

select set_config('test.user_id', '11111111-1111-1111-1111-111111111111', false) \gset dummy_e_

do $$
begin
  if (select count(*) from ingredients) < 100 then
    raise exception 'FAIL check 8: household A cannot see its own ingredient bank';
  end if;
  if (select count(*) from recipes) <> 1 then
    raise exception 'FAIL check 8: household A cannot see its own recipe';
  end if;
end
$$;

\echo 'ok 8: own-household reads work'

reset role;

-- The cross-household write from check 6 must not have landed. Asserted here,
-- as superuser, because under RLS household B could not see it either way.
do $$
begin
  if exists (select 1 from ingredients where name = 'Trojan horse') then
    raise exception 'FAIL check 6: household B wrote into household A''s bank';
  end if;
end
$$;

\echo 'ok 6: cross-household write did not land'

-- ---------------------------------------------------------------------------
-- CHECK 9: invite flow (FR1.3) — allowlists the email and joins the household
-- ---------------------------------------------------------------------------

select set_config('test.user_id', '11111111-1111-1111-1111-111111111111', false) \gset dummy_f_
select create_invite('wife@example.com') as invite_token \gset

do $$
begin
  if not exists (select 1 from signup_allowlist where email = 'wife@example.com') then
    raise exception 'FAIL check 9: creating an invite did not allowlist the email';
  end if;
end
$$;

-- The invited person signs up (allowed by the invite) and accepts.
insert into auth.users (id, email)
values ('33333333-3333-3333-3333-333333333333', 'wife@example.com');

select set_config('test.user_id', '33333333-3333-3333-3333-333333333333', false) \gset dummy_g_
select accept_invite(:'invite_token');

do $$
begin
  if not exists (
    select 1 from memberships m
    join households h on h.id = m.household_id
    where m.user_id = '33333333-3333-3333-3333-333333333333'
      and m.role = 'member'
      and h.name = 'Bray kitchen'
  ) then
    raise exception 'FAIL check 9: invite acceptance did not join the right household';
  end if;
end
$$;

\echo 'ok 9: invite allowlists, then joins the right household'

-- ---------------------------------------------------------------------------
-- CHECK 10: an expired invite is refused
-- ---------------------------------------------------------------------------

insert into signup_allowlist (email) values ('late@example.com');
insert into auth.users (id, email)
values ('44444444-4444-4444-4444-444444444444', 'late@example.com');

insert into invites (household_id, email, created_by, expires_at)
values (
  :'household_a',
  'late@example.com',
  '11111111-1111-1111-1111-111111111111',
  now() - interval '1 day'
)
returning token as expired_token \gset

select set_config('test.user_id', '44444444-4444-4444-4444-444444444444', false) \gset dummy_h_

\set ON_ERROR_STOP off
select accept_invite(:'expired_token');
\set ON_ERROR_STOP on

do $$
begin
  if exists (
    select 1 from memberships
    where user_id = '44444444-4444-4444-4444-444444444444'
  ) then
    raise exception 'FAIL check 10: an expired invite created a membership';
  end if;
end
$$;

\echo 'ok 10: expired invite refused'

-- ---------------------------------------------------------------------------
-- CHECK 11: one household per user in v1 (FR1.2)
-- ---------------------------------------------------------------------------

select set_config('test.user_id', '33333333-3333-3333-3333-333333333333', false) \gset dummy_i_

\set ON_ERROR_STOP off
select create_household_for_current_user('Second kitchen');
\set ON_ERROR_STOP on

do $$
begin
  if (select count(*) from memberships
      where user_id = '33333333-3333-3333-3333-333333333333') <> 1 then
    raise exception 'FAIL check 11: a user ended up in more than one household';
  end if;
end
$$;

\echo 'ok 11: a user cannot join a second household'

\echo ''
\echo 'ALL CHECKS PASSED'
