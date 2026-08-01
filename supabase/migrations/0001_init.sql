-- whatsfordinner: initial schema (PRD section 11).
--
-- Two deliberate departures from the PRD are recorded here because they are
-- invisible in the column list otherwise:
--
--   * list_items has no `aisle` column (decision D1). Aisle mapping was dropped;
--     the shopping list and the Cowork export group by ingredient `category`,
--     which every ingredient already carries and nobody has to maintain.
--   * signup_allowlist and invites exist (decision D2) so that adding a household
--     member does not require a redeploy.
--
-- Tables for later build-order steps (recipes, favourites, cook_log, shopping
-- lists, generations) are created now. They cost nothing empty, and creating them
-- later means a migration across live data.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

-- Hard-set to 'dinner' throughout v1, but present from day one. Retrofitting it
-- later would mean a migration across recipes, the cook log and every generation
-- record, plus a rewrite of the repeat-suppression query. The restriction to
-- dinner lives in application code, not in a database constraint, so adding
-- breakfast later is a prompt and UI change rather than a migration.
create type meal_type as enum ('dinner', 'breakfast', 'lunch', 'snack', 'side');

create type membership_role as enum ('member', 'owner');

create type ingredient_category as enum (
  'animal_protein',
  'plant_protein',
  'healthy_fat',
  'complex_carb',
  'vegetable',
  'fruit',
  'dairy',
  'herb_and_spice',
  'pantry',
  'condiment'
);

create type difficulty as enum ('easy', 'medium', 'involved');

create type dietary_rule_type as enum ('allergen', 'avoid', 'diet');

create type spice_tolerance as enum ('mild', 'medium', 'hot', 'very_hot');

-- Maps to the slot quota in FR2.8. The mapping from setting to "how many of the
-- three suggestion slots may be a repeat" lives in application code
-- (src/lib/generation/quota.ts), not here, because it is logic rather than data.
create type recency_weighting as enum ('never', 'a_bit', 'sometimes', 'mostly', 'always');

create type generation_type as enum ('flavour', 'suggestions', 'recipe');

create type list_status as enum ('active', 'archived');

create type unit_weight as enum ('metric', 'imperial');
create type unit_volume as enum ('metric', 'imperial', 'us_cups');
create type unit_temp as enum ('c', 'f');
create type unit_length as enum ('cm', 'inches');

-- ---------------------------------------------------------------------------
-- Identity and household
-- ---------------------------------------------------------------------------

-- Mirrors auth.users. Supabase owns the auth schema; this is the profile data we
-- are allowed to join against and expose to household peers.
create table users (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null unique,
  display_name text,
  avatar_colour text,
  created_at timestamptz not null default now()
);

create table households (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_id uuid not null references users (id),
  created_at timestamptz not null default now()
);

-- A user belongs to exactly one household in v1 (FR1.2), enforced by the unique
-- constraint on user_id. The table shape does not assume this permanently —
-- lifting the restriction later means dropping one constraint.
create table memberships (
  user_id uuid not null references users (id) on delete cascade,
  household_id uuid not null references households (id) on delete cascade,
  role membership_role not null default 'member',
  created_at timestamptz not null default now(),
  primary key (user_id, household_id)
);

create unique index memberships_one_household_per_user on memberships (user_id);
create index memberships_household_idx on memberships (household_id);

-- Closed signup (FR1.5, decision D2). Seeded once from BOOTSTRAP_SIGNUP_EMAILS,
-- then managed in the database. Every new account is a hole in the API budget.
create table signup_allowlist (
  email text primary key,
  invited_by uuid references users (id),
  created_at timestamptz not null default now()
);

-- An invite names the email it is for. The signup trigger cannot see the token
-- in the link — it only sees the email being registered — so authorising signup
-- by possession of the link alone is not possible. Creating an invite therefore
-- also adds its email to signup_allowlist, and the token governs which household
-- the account joins rather than whether it may exist at all.
create table invites (
  token uuid primary key default gen_random_uuid(),
  household_id uuid not null references households (id) on delete cascade,
  email text not null,
  created_by uuid not null references users (id),
  expires_at timestamptz not null,
  accepted_at timestamptz,
  accepted_by uuid references users (id),
  created_at timestamptz not null default now()
);

create index invites_household_idx on invites (household_id);

-- ---------------------------------------------------------------------------
-- Settings
-- ---------------------------------------------------------------------------

create table settings (
  household_id uuid primary key references households (id) on delete cascade,

  -- Measurements are independent toggles per family (FR2.2). Imperial uses UK
  -- conventions — 568ml pints, no US cups — unless the user opts into us_cups.
  units_weight unit_weight not null default 'metric',
  units_volume unit_volume not null default 'metric',
  units_temp unit_temp not null default 'c',
  units_length unit_length not null default 'cm',
  show_gas_mark boolean not null default false,

  spice_tolerance spice_tolerance not null default 'medium',
  eating_notes text,

  -- Shopping preferences are used only by the Cowork export (FR2.5).
  supermarket text,
  delivery_day text,
  shopping_notes text,

  daily_generation_cap integer not null default 30 check (daily_generation_cap > 0),

  -- Suggestion variety (FR2.7). While only_new is on, the three settings below
  -- are hidden in the UI and ignored by the quota calculation.
  only_new boolean not null default false,
  recency_weighting recency_weighting not null default 'sometimes',
  recency_window_days integer not null default 14
    check (recency_window_days between 1 and 90),
  include_favourites boolean not null default true,

  -- Keyed by meal_type: { "dinner": { "default_servings": 2,
  -- "default_time_limit": null } }. Only the dinner key is read in v1.
  meal_defaults jsonb not null default '{"dinner": {"default_servings": 2, "default_time_limit": null}}'::jsonb,

  updated_at timestamptz not null default now()
);

-- Every generation is constrained to available equipment (FR2.1).
create table equipment (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households (id) on delete cascade,
  name text not null,
  available boolean not null default false,
  unique (household_id, name)
);

create index equipment_household_idx on equipment (household_id);

-- Per member (FR2.4). Rules from all members are unioned and applied to every
-- generation, so one member's allergen constrains the whole household.
create table dietary_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id) on delete cascade,
  household_id uuid not null references households (id) on delete cascade,
  type dietary_rule_type not null,
  value text not null,
  created_at timestamptz not null default now(),
  unique (user_id, type, value)
);

create index dietary_rules_household_idx on dietary_rules (household_id);

-- ---------------------------------------------------------------------------
-- Ingredient bank
-- ---------------------------------------------------------------------------

create table ingredients (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households (id) on delete cascade,
  name text not null,
  category ingredient_category not null,
  typical_unit text,

  -- disliked and allergen are exclusions; loved raises weighting in generation.
  -- staple means "assume it is in the cupboard" and keeps it off shopping lists.
  loved boolean not null default false,
  disliked boolean not null default false,
  staple boolean not null default false,
  allergen boolean not null default false,

  notes text,
  seasonality text,
  use_count integer not null default 0,

  -- null means any meal type. Unused in v1.
  suitable_meal_types meal_type[],

  created_at timestamptz not null default now(),
  unique (household_id, name)
);

create index ingredients_household_idx on ingredients (household_id);
create index ingredients_category_idx on ingredients (household_id, category);

-- ---------------------------------------------------------------------------
-- Recipes, favourites, cook log
-- ---------------------------------------------------------------------------

-- payload holds the full recipe JSON from PRD 9.3. Recipes are deliberately not
-- normalised into ingredient rows: a saved recipe is an immutable artefact, and
-- a change to the ingredient bank must never silently rewrite a recipe you
-- cooked last month (FR3.7). The scalar columns are denormalised copies of
-- payload fields, present only so the recipe book can filter and sort without
-- unpacking jsonb on every row.
create table recipes (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households (id) on delete cascade,
  created_by uuid not null references users (id),
  meal_type meal_type not null default 'dinner',

  title text not null,
  description text,
  cuisine text,
  base_servings integer not null check (base_servings between 1 and 12),
  total_minutes integer,
  active_minutes integer,
  difficulty difficulty,

  payload jsonb not null,

  source_suggestion_id text,
  generation_id uuid,

  created_at timestamptz not null default now(),
  edited_by uuid references users (id),
  edited_at timestamptz
);

create index recipes_household_idx on recipes (household_id, meal_type);
create index recipes_created_by_idx on recipes (created_by);

-- Favouriting is per user, not per household. A recipe can be favourited by one,
-- both or neither. "Favourited by both" is the closest thing the app has to a
-- guaranteed win.
create table favourites (
  recipe_id uuid not null references recipes (id) on delete cascade,
  user_id uuid not null references users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (recipe_id, user_id)
);

create index favourites_user_idx on favourites (user_id);

-- Household wide (FR2.10): a meal cooked by either member counts as cooked for
-- both. Source of truth for what counts as recently cooked.
create table cook_log (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references recipes (id) on delete cascade,
  household_id uuid not null references households (id) on delete cascade,
  meal_type meal_type not null default 'dinner',
  cooked_by uuid not null references users (id),
  cooked_at timestamptz not null default now(),
  servings integer,
  rating integer check (rating between 1 and 5),
  note text
);

-- Repeat suppression queries "what has this household cooked, of this meal type,
-- inside the recency window" on every generation.
create index cook_log_recency_idx on cook_log (household_id, meal_type, cooked_at desc);
create index cook_log_recipe_idx on cook_log (recipe_id);

-- ---------------------------------------------------------------------------
-- Shopping
-- ---------------------------------------------------------------------------

create table shopping_lists (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households (id) on delete cascade,
  name text,
  status list_status not null default 'active',
  created_at timestamptz not null default now(),
  archived_at timestamptz
);

-- One active list per household (FR9.1), plus an archive.
create unique index shopping_lists_one_active
  on shopping_lists (household_id)
  where status = 'active';

create table list_items (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references shopping_lists (id) on delete cascade,
  item text not null,

  -- Canonical metric base units (FR5.1), converted for display at render time.
  amount numeric,
  unit text,

  -- Grouping key for the list and the Cowork export (decision D1: category
  -- rather than aisle). Null for manual items that match nothing in the bank.
  category ingredient_category,

  -- Which recipes contributed this item, so removing a recipe removes the right
  -- amount rather than the whole line (FR9.4).
  source_recipe_ids uuid[] not null default '{}',

  added_by uuid not null references users (id),
  ticked boolean not null default false,
  ticked_by uuid references users (id),
  ticked_at timestamptz,
  is_manual boolean not null default false,
  created_at timestamptz not null default now()
);

create index list_items_list_idx on list_items (list_id);

-- ---------------------------------------------------------------------------
-- Generation log
-- ---------------------------------------------------------------------------

-- Every generation stores its inputs, outputs, model, token counts and latency
-- (FR4.7). This is the review surface for prompt iteration, not just a cost
-- ledger — if the suggestions are bland, this table is where you find out why.
create table generations (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households (id) on delete cascade,
  user_id uuid not null references users (id),
  meal_type meal_type not null default 'dinner',
  type generation_type not null,
  model text not null,

  input_tokens integer,
  output_tokens integer,
  -- Prompt caching splits input tokens three ways; cache reads cost a tenth of
  -- standard input, so cost is wrong without these.
  cache_creation_input_tokens integer,
  cache_read_input_tokens integer,

  latency_ms integer,
  cost_usd numeric(10, 6),

  request jsonb,
  response jsonb,
  feedback text,

  -- False when the call failed or was rejected by a guardrail. Failed attempts
  -- still cost tokens and still count against the daily cap.
  succeeded boolean not null default true,
  error text,

  created_at timestamptz not null default now()
);

-- The daily cap counts a user's generations since midnight on every call.
create index generations_cap_idx on generations (user_id, created_at desc);
create index generations_household_idx on generations (household_id, created_at desc);

alter table recipes
  add constraint recipes_generation_fk
  foreign key (generation_id) references generations (id) on delete set null;
