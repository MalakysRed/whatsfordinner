-- Row Level Security on every table (PRD section 13).
--
-- Data isolation is enforced by the database, not by remembering to filter in
-- application code. The application still checks auth in every route handler and
-- server action, but if both of those are wrong, RLS is what stops household A
-- reading household B's dinners.
--
-- The membership lookup goes through SECURITY DEFINER helpers rather than an
-- inline subquery. An inline `household_id in (select ... from memberships)`
-- inside a policy on `memberships` recurses infinitely, and inside policies on
-- other tables it evaluates the memberships policy on every row. The helpers run
-- as the definer, bypass RLS, and are marked stable so the planner caches them
-- per statement.

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- Set-returning rather than scalar: a user belongs to exactly one household in
-- v1, but nothing here has to change when that stops being true.
create or replace function public.household_ids()
returns setof uuid
language sql
security definer
stable
set search_path = public
as $$
  select household_id from memberships where user_id = auth.uid();
$$;

create or replace function public.household_peer_ids()
returns setof uuid
language sql
security definer
stable
set search_path = public
as $$
  select m.user_id
  from memberships m
  where m.household_id in (
    select household_id from memberships where user_id = auth.uid()
  );
$$;

create or replace function public.is_household_owner(target uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from memberships
    where user_id = auth.uid() and household_id = target and role = 'owner'
  );
$$;

-- Resolves the household behind a shopping list, so list_items policies do not
-- have to join through a table that is itself under RLS.
create or replace function public.list_household_id(target uuid)
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select household_id from shopping_lists where id = target;
$$;

create or replace function public.recipe_household_id(target uuid)
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select household_id from recipes where id = target;
$$;

revoke execute on function public.household_ids() from anon;
revoke execute on function public.household_peer_ids() from anon;
revoke execute on function public.is_household_owner(uuid) from anon;
revoke execute on function public.list_household_id(uuid) from anon;
revoke execute on function public.recipe_household_id(uuid) from anon;

-- ---------------------------------------------------------------------------
-- Enable RLS everywhere
-- ---------------------------------------------------------------------------

alter table users             enable row level security;
alter table households        enable row level security;
alter table memberships       enable row level security;
alter table signup_allowlist  enable row level security;
alter table invites           enable row level security;
alter table settings          enable row level security;
alter table equipment         enable row level security;
alter table dietary_rules     enable row level security;
alter table ingredients       enable row level security;
alter table recipes           enable row level security;
alter table favourites        enable row level security;
alter table cook_log          enable row level security;
alter table shopping_lists    enable row level security;
alter table list_items        enable row level security;
alter table generations       enable row level security;

-- ---------------------------------------------------------------------------
-- Identity
-- ---------------------------------------------------------------------------

-- You can see yourself and your household peers — the recipe book shows "added
-- by Nathan, favourited by both", which needs peer display names.
create policy users_select on users
  for select using (id = auth.uid() or id in (select household_peer_ids()));

create policy users_update_self on users
  for update using (id = auth.uid()) with check (id = auth.uid());

create policy households_select on households
  for select using (id in (select household_ids()));

create policy households_update_owner on households
  for update using (is_household_owner(id)) with check (is_household_owner(id));

create policy households_delete_owner on households
  for delete using (is_household_owner(id));

create policy memberships_select on memberships
  for select using (household_id in (select household_ids()));

-- Only the owner adds or removes members. Creating your own household on first
-- login goes through create_household_for_current_user(), which is SECURITY
-- DEFINER precisely because you are not yet a member at that moment.
create policy memberships_insert_owner on memberships
  for insert with check (is_household_owner(household_id));

create policy memberships_delete_owner on memberships
  for delete using (is_household_owner(household_id));

-- signup_allowlist deliberately has no policies. RLS is enabled and nothing
-- matches, so it is unreadable and unwritable from the client under any key
-- except the service role. The allowlist is not something the app should be able
-- to leak or edit on a user's behalf.

create policy invites_select on invites
  for select using (household_id in (select household_ids()));

create policy invites_insert_owner on invites
  for insert with check (is_household_owner(household_id));

create policy invites_delete_owner on invites
  for delete using (is_household_owner(household_id));

-- ---------------------------------------------------------------------------
-- Household-scoped tables
-- ---------------------------------------------------------------------------

-- All household data is visible to all members (FR1.4). There is no private
-- content, so read and write share the same predicate.

create policy settings_all on settings
  for all using (household_id in (select household_ids()))
  with check (household_id in (select household_ids()));

create policy equipment_all on equipment
  for all using (household_id in (select household_ids()))
  with check (household_id in (select household_ids()));

create policy ingredients_all on ingredients
  for all using (household_id in (select household_ids()))
  with check (household_id in (select household_ids()));

create policy recipes_all on recipes
  for all using (household_id in (select household_ids()))
  with check (household_id in (select household_ids()));

create policy cook_log_all on cook_log
  for all using (household_id in (select household_ids()))
  with check (household_id in (select household_ids()));

create policy shopping_lists_all on shopping_lists
  for all using (household_id in (select household_ids()))
  with check (household_id in (select household_ids()));

-- Generations are readable by the household (visible token spend in settings) but
-- only ever written server-side, where the token counts come from.
create policy generations_select on generations
  for select using (household_id in (select household_ids()));

-- Dietary rules are readable by the whole household — one member's allergen
-- constrains everyone's dinner, so everyone needs to see it — but only the
-- member they belong to may change them.
create policy dietary_rules_select on dietary_rules
  for select using (household_id in (select household_ids()));

create policy dietary_rules_write_self on dietary_rules
  for all using (user_id = auth.uid())
  with check (user_id = auth.uid() and household_id in (select household_ids()));

-- ---------------------------------------------------------------------------
-- Tables scoped through a parent
-- ---------------------------------------------------------------------------

-- Favouriting is per user: you see the household's favourites (that is what
-- "favourited by both" means) but you may only add and remove your own.
create policy favourites_select on favourites
  for select using (recipe_household_id(recipe_id) in (select household_ids()));

create policy favourites_write_self on favourites
  for all using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and recipe_household_id(recipe_id) in (select household_ids())
  );

create policy list_items_all on list_items
  for all using (list_household_id(list_id) in (select household_ids()))
  with check (list_household_id(list_id) in (select household_ids()));
