-- Signup gating, profile mirroring and the bootstrap RPCs.
--
-- Closed signup (FR1.5) is enforced here, at the database, because Supabase Auth
-- has no native allowlist and the app is on a public domain. The login form also
-- checks the allowlist, but only so it can say "this email isn't invited"
-- instead of silently sending nothing. The trigger below is the actual gate: it
-- holds even if someone calls the Supabase auth endpoint directly.

-- ---------------------------------------------------------------------------
-- Closed signup
-- ---------------------------------------------------------------------------

create or replace function auth.enforce_signup_allowlist()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if exists (select 1 from public.signup_allowlist where email = new.email) then
    return new;
  end if;

  if exists (
    select 1 from public.invites
    where email = new.email
      and accepted_at is null
      and expires_at > now()
  ) then
    return new;
  end if;

  raise exception 'signup_not_allowed'
    using hint = 'This email has not been invited.';
end;
$$;

-- Dropped first so the migration can be re-applied. Creating objects in the
-- auth schema needs ownership of auth.users, which is the most likely place for
-- a first `supabase db push` to fail partway; without this guard the retry
-- fails again on the trigger that did get created.
drop trigger if exists enforce_signup_allowlist on auth.users;

create trigger enforce_signup_allowlist
  before insert on auth.users
  for each row execute function auth.enforce_signup_allowlist();

-- ---------------------------------------------------------------------------
-- Profile mirroring
-- ---------------------------------------------------------------------------

-- public.users is the half of the profile the app is allowed to join against and
-- show to household peers. auth.users stays Supabase's.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  insert into public.users (id, email, display_name, avatar_colour)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)),
    -- Two small avatars or initials on a card is enough; the colour just has to
    -- be stable and distinguishable between two people.
    (array['amber', 'teal', 'rose', 'indigo', 'lime', 'sky'])[1 + (hashtext(new.email) % 6 + 6) % 6]
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Household bootstrap
-- ---------------------------------------------------------------------------

-- SECURITY DEFINER because at the moment of creating your first household you
-- are not yet a member of it, so the memberships insert policy cannot pass. This
-- is the one legitimate way in; it always uses auth.uid() and refuses if the
-- caller already belongs somewhere, so it cannot be used to join a household you
-- were not invited to.
create or replace function public.create_household_for_current_user(household_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_household_id uuid;
  caller uuid := auth.uid();
begin
  if caller is null then
    raise exception 'not_authenticated';
  end if;

  if exists (select 1 from memberships where user_id = caller) then
    raise exception 'already_in_household';
  end if;

  insert into households (name, owner_id)
  values (coalesce(nullif(trim(household_name), ''), 'Our kitchen'), caller)
  returning id into new_household_id;

  insert into memberships (user_id, household_id, role)
  values (caller, new_household_id, 'owner');

  insert into settings (household_id) values (new_household_id);

  -- Equipment from FR2.1, all unticked. Every generation is constrained to
  -- what is available, so an empty list is a real answer, not a missing one.
  insert into equipment (household_id, name, available)
  select new_household_id, name, false
  from unnest(array[
    'Hob', 'Conventional oven', 'Fan oven', 'Grill', 'Microwave', 'Air fryer',
    'Slow cooker', 'Pressure cooker', 'Rice cooker', 'Blender', 'Stick blender',
    'Food processor', 'Stand mixer', 'Pestle and mortar', 'Wok',
    'Cast iron pan', 'Griddle pan', 'Barbecue', 'Sous vide', 'Thermometer',
    'Mandoline', 'Spiraliser', 'Scales'
  ]) as name;

  return new_household_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Invites
-- ---------------------------------------------------------------------------

-- Creating an invite also allowlists the email, because the signup trigger sees
-- only the email and never the token.
create or replace function public.create_invite(invite_email text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  target_household uuid;
  new_token uuid;
  normalised text := lower(trim(invite_email));
begin
  if caller is null then
    raise exception 'not_authenticated';
  end if;

  select household_id into target_household
  from memberships
  where user_id = caller and role = 'owner';

  if target_household is null then
    raise exception 'not_household_owner';
  end if;

  if normalised = '' or normalised not like '%_@_%' then
    raise exception 'invalid_email';
  end if;

  insert into invites (household_id, email, created_by, expires_at)
  values (target_household, normalised, caller, now() + interval '7 days')
  returning token into new_token;

  insert into signup_allowlist (email, invited_by)
  values (normalised, caller)
  on conflict (email) do nothing;

  return new_token;
end;
$$;

-- SECURITY DEFINER because the accepting user cannot read the invite row until
-- they are a member, and cannot become a member until they have read it.
create or replace function public.accept_invite(invite_token uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  caller_email text;
  invite invites;
begin
  if caller is null then
    raise exception 'not_authenticated';
  end if;

  select email into caller_email from users where id = caller;

  select * into invite from invites where token = invite_token;

  if invite is null then
    raise exception 'invite_not_found';
  end if;

  if invite.accepted_at is not null then
    raise exception 'invite_already_used';
  end if;

  if invite.expires_at <= now() then
    raise exception 'invite_expired';
  end if;

  if lower(invite.email) <> lower(caller_email) then
    raise exception 'invite_email_mismatch';
  end if;

  if exists (select 1 from memberships where user_id = caller) then
    raise exception 'already_in_household';
  end if;

  insert into memberships (user_id, household_id, role)
  values (caller, invite.household_id, 'member');

  update invites
  set accepted_at = now(), accepted_by = caller
  where token = invite_token;

  return invite.household_id;
end;
$$;

revoke execute on function public.create_household_for_current_user(text) from anon;
revoke execute on function public.create_invite(text) from anon;
revoke execute on function public.accept_invite(uuid) from anon;
