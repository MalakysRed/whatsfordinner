-- Removes the ingredient bank and the repeat-slot quota system, and lands the
-- schema for the variance-engine spec: six generated options per request
-- instead of three, a seed pool the server draws from to force variety, and a
-- permanent per-household exclusion list replacing bank-item "disliked" flags.
--
-- The new generation flow keeps no standing pantry list and no user-adjustable
-- "how often may a suggestion repeat" setting — both are removed outright
-- rather than kept alongside code that no longer reads them. This is
-- deliberately destructive for the ingredient bank: any household's curated
-- data is gone once this runs. See the feature-removal plan for the reasoning.

-- ---------------------------------------------------------------------------
-- Drop the ingredient bank
-- ---------------------------------------------------------------------------

-- list_items.category depended on ingredient_category via a bank lookup by
-- name that no longer exists — staple exclusion and bank-derived grouping are
-- both gone in this phase. Drop the column before the enum it depends on.
alter table list_items drop column if exists category;

drop function if exists adopt_starter_ingredients(text[]);
drop table if exists starter_ingredients;
drop table if exists ingredients;
drop type if exists ingredient_category;

-- ---------------------------------------------------------------------------
-- Drop shopping-list staple exclusion
-- ---------------------------------------------------------------------------

alter table shopping_lists drop column if exists include_staples;

-- ---------------------------------------------------------------------------
-- Drop the repeat-slot quota system
-- ---------------------------------------------------------------------------

alter table settings
  drop column if exists only_new,
  drop column if exists recency_weighting,
  drop column if exists recency_window_days,
  drop column if exists include_favourites;

drop type if exists recency_weighting;

-- ---------------------------------------------------------------------------
-- New generation call types
-- ---------------------------------------------------------------------------

-- 'flavour' and 'plate' become orphaned once the Builder is removed. Postgres
-- cannot drop enum values without a full type rebuild, and that migration
-- cost is not worth paying in this phase — leave them in place, as this repo
-- already does with unused enum values elsewhere.
alter type generation_type add value if not exists 'options';
alter type generation_type add value if not exists 'options_refine';

-- ---------------------------------------------------------------------------
-- Seed pool (spec Appendix B) — global, model-facing, drawn from at
-- generation time to force variety the user never asked for.
-- ---------------------------------------------------------------------------

create type seed_axis as enum ('cuisine', 'format', 'hero');
create type seed_status as enum ('active', 'candidate', 'retired');
create type seed_source as enum ('curated', 'harvested', 'proposed');

create table seed_pool (
  id uuid primary key default gen_random_uuid(),
  axis seed_axis not null,
  name text not null,
  -- UK-season tags for cuisine/hero rows (e.g. {"spring","summer"}, empty
  -- means all year); effort-band tags for format rows (e.g. {"quick"}).
  tags text[] not null default '{}',
  status seed_status not null default 'active',
  source seed_source not null default 'curated',
  created_at timestamptz not null default now(),
  unique (axis, name)
);

create index seed_pool_axis_status_idx on seed_pool (axis, status);

alter table seed_pool enable row level security;

-- Reference/global table, not household data — readable by anyone signed in,
-- the same pattern starter_ingredients used.
create policy seed_pool_read on seed_pool
  for select to authenticated using (true);

grant select on seed_pool to authenticated;

insert into seed_pool (axis, name, tags) values
  -- Cuisines and regions (spec Appendix B.1) — no seasonal bias of their own.
  ('cuisine', 'Northern Italian', '{}'), ('cuisine', 'Southern Italian', '{}'),
  ('cuisine', 'Sicilian', '{}'), ('cuisine', 'French bistro', '{}'),
  ('cuisine', 'French provincial', '{}'), ('cuisine', 'Spanish', '{}'),
  ('cuisine', 'Basque', '{}'), ('cuisine', 'Portuguese', '{}'),
  ('cuisine', 'Greek', '{}'), ('cuisine', 'Turkish', '{}'),
  ('cuisine', 'Lebanese', '{}'), ('cuisine', 'Levantine', '{}'),
  ('cuisine', 'Persian', '{}'), ('cuisine', 'Georgian', '{}'),
  ('cuisine', 'Moroccan', '{}'), ('cuisine', 'Tunisian', '{}'),
  ('cuisine', 'Egyptian', '{}'), ('cuisine', 'Ethiopian', '{}'),
  ('cuisine', 'Nigerian', '{}'), ('cuisine', 'West African', '{}'),
  ('cuisine', 'South African', '{}'), ('cuisine', 'Polish', '{}'),
  ('cuisine', 'German', '{}'), ('cuisine', 'Austrian', '{}'),
  ('cuisine', 'Hungarian', '{}'), ('cuisine', 'Nordic', '{}'),
  ('cuisine', 'Danish', '{}'), ('cuisine', 'British classic', '{}'),
  ('cuisine', 'British modern', '{}'), ('cuisine', 'Irish', '{}'),
  ('cuisine', 'American Southern', '{}'), ('cuisine', 'Cajun', '{}'),
  ('cuisine', 'Creole', '{}'), ('cuisine', 'Tex Mex', '{}'),
  ('cuisine', 'Mexican', '{}'), ('cuisine', 'Yucatecan', '{}'),
  ('cuisine', 'Peruvian', '{}'), ('cuisine', 'Brazilian', '{}'),
  ('cuisine', 'Argentine', '{}'), ('cuisine', 'Jamaican', '{}'),
  ('cuisine', 'Trinidadian', '{}'), ('cuisine', 'Cuban', '{}'),
  ('cuisine', 'North Indian', '{}'), ('cuisine', 'South Indian', '{}'),
  ('cuisine', 'Goan', '{}'), ('cuisine', 'Bengali', '{}'),
  ('cuisine', 'Sri Lankan', '{}'), ('cuisine', 'Pakistani', '{}'),
  ('cuisine', 'Nepali', '{}'), ('cuisine', 'Burmese', '{}'),
  ('cuisine', 'Thai', '{}'), ('cuisine', 'Northern Thai', '{}'),
  ('cuisine', 'Vietnamese', '{}'), ('cuisine', 'Cambodian', '{}'),
  ('cuisine', 'Malaysian', '{}'), ('cuisine', 'Singaporean', '{}'),
  ('cuisine', 'Indonesian', '{}'), ('cuisine', 'Filipino', '{}'),
  ('cuisine', 'Sichuan', '{}'), ('cuisine', 'Cantonese', '{}'),
  ('cuisine', 'Hunan', '{}'), ('cuisine', 'Shanghainese', '{}'),
  ('cuisine', 'Taiwanese', '{}'), ('cuisine', 'Japanese', '{}'),
  ('cuisine', 'Okinawan', '{}'), ('cuisine', 'Korean', '{}'),
  ('cuisine', 'Yemeni', '{}'), ('cuisine', 'Afghan', '{}'),
  ('cuisine', 'Israeli', '{}'),

  -- Formats and methods (spec Appendix B.2), tagged with the effort bands
  -- they suit.
  ('format', 'Stir fry', '{quick}'), ('format', 'Noodle bowl', '{quick}'),
  ('format', 'Rice bowl', '{quick}'), ('format', 'Flatbread based', '{quick}'),
  ('format', 'Toastie as a main', '{quick}'), ('format', 'Omelette or frittata', '{quick}'),
  ('format', 'Salad as a main', '{quick}'), ('format', 'No cook', '{quick}'),
  ('format', 'Grain bowl', '{quick}'), ('format', 'Quick pickle led', '{quick}'),
  ('format', 'Pan fried with a sauce', '{quick}'), ('format', 'Wrap or taco', '{quick}'),
  ('format', 'Soup from store cupboard', '{quick}'),
  ('format', 'Traybake', '{standard}'), ('format', 'Sheet pan', '{standard}'),
  ('format', 'One pot', '{standard}'), ('format', 'Curry', '{standard}'),
  ('format', 'Stew', '{standard}'), ('format', 'Soup', '{standard}'),
  ('format', 'Pasta', '{standard}'), ('format', 'Risotto', '{standard}'),
  ('format', 'Gratin', '{standard}'), ('format', 'Layered bake', '{standard}'),
  ('format', 'Skewers', '{standard}'), ('format', 'Fritters', '{standard}'),
  ('format', 'Hash', '{standard}'), ('format', 'Crumb coated', '{standard}'),
  ('format', 'Steamed', '{standard}'), ('format', 'Poached', '{standard}'),
  ('format', 'Sticky glaze', '{standard}'), ('format', 'Stuffed vegetables', '{standard}'),
  ('format', 'Pie with shop bought pastry', '{standard}'), ('format', 'Dumplings or parcels', '{standard}'),
  ('format', 'Broth led', '{standard}'),
  ('format', 'Slow braise', '{project}'), ('format', 'Slow roast', '{project}'),
  ('format', 'Tagine', '{project}'), ('format', 'Hotpot', '{project}'),
  ('format', 'Homemade pasta', '{project}'), ('format', 'Laminated or made pastry', '{project}'),
  ('format', 'Smoked', '{project}'), ('format', 'Confit', '{project}'),
  ('format', 'Cured', '{project}'), ('format', 'Terrine', '{project}'),
  ('format', 'Whole roast', '{project}'), ('format', 'Layered celebration bake', '{project}'),
  ('format', 'Fermented or long marinated', '{project}'),
  ('format', 'Air fryer', '{quick,standard,project}'), ('format', 'Pressure cooker', '{quick,standard,project}'),
  ('format', 'Slow cooker', '{quick,standard,project}'), ('format', 'Barbecue or outdoor grill', '{quick,standard,project}'),
  ('format', 'Single pan only', '{quick,standard,project}'), ('format', 'Oven only', '{quick,standard,project}'),
  ('format', 'Hob only', '{quick,standard,project}'),

  -- Hero ingredients (spec Appendix B.3). Meat/poultry, fish/shellfish,
  -- eggs/dairy, plant proteins and grains carry no UK season; vegetables do.
  ('hero', 'Chicken thigh', '{}'), ('hero', 'Chicken breast', '{}'), ('hero', 'Whole chicken', '{}'),
  ('hero', 'Chicken wings', '{}'), ('hero', 'Pork shoulder', '{}'), ('hero', 'Pork belly', '{}'),
  ('hero', 'Pork chop', '{}'), ('hero', 'Pork mince', '{}'), ('hero', 'Sausages', '{}'),
  ('hero', 'Bacon or lardons', '{}'), ('hero', 'Gammon', '{}'), ('hero', 'Beef mince', '{}'),
  ('hero', 'Beef shin', '{}'), ('hero', 'Brisket', '{}'), ('hero', 'Steak', '{}'),
  ('hero', 'Ox cheek', '{}'), ('hero', 'Lamb shoulder', '{}'), ('hero', 'Lamb chops', '{}'),
  ('hero', 'Lamb mince', '{}'), ('hero', 'Duck breast', '{}'), ('hero', 'Duck legs', '{}'),
  ('hero', 'Chicken livers', '{}'),
  ('hero', 'White fish fillet', '{}'), ('hero', 'Salmon', '{}'), ('hero', 'Trout', '{}'),
  ('hero', 'Mackerel', '{}'), ('hero', 'Sardines', '{}'), ('hero', 'Anchovies', '{}'),
  ('hero', 'Tinned tuna', '{}'), ('hero', 'Smoked haddock', '{}'), ('hero', 'Prawns', '{}'),
  ('hero', 'Squid', '{}'), ('hero', 'Mussels', '{}'), ('hero', 'Clams', '{}'), ('hero', 'Crab', '{}'),
  ('hero', 'Eggs', '{}'), ('hero', 'Halloumi', '{}'), ('hero', 'Paneer', '{}'), ('hero', 'Feta', '{}'),
  ('hero', 'Ricotta', '{}'), ('hero', 'Mozzarella', '{}'), ('hero', 'Mature cheddar', '{}'),
  ('hero', 'Goat cheese', '{}'), ('hero', 'Yoghurt', '{}'), ('hero', 'Creme fraiche', '{}'),
  ('hero', 'Tofu', '{}'), ('hero', 'Silken tofu', '{}'), ('hero', 'Tempeh', '{}'),
  ('hero', 'Chickpeas', '{}'), ('hero', 'Butter beans', '{}'), ('hero', 'Cannellini beans', '{}'),
  ('hero', 'Black beans', '{}'), ('hero', 'Kidney beans', '{}'), ('hero', 'Red lentils', '{}'),
  ('hero', 'Puy lentils', '{}'), ('hero', 'Split peas', '{}'), ('hero', 'Edamame', '{}'),
  ('hero', 'Rice', '{}'), ('hero', 'Basmati', '{}'), ('hero', 'Couscous', '{}'),
  ('hero', 'Giant couscous', '{}'), ('hero', 'Bulgur', '{}'), ('hero', 'Freekeh', '{}'),
  ('hero', 'Barley', '{}'), ('hero', 'Farro', '{}'), ('hero', 'Polenta', '{}'),
  ('hero', 'Pasta', '{}'), ('hero', 'Orzo', '{}'), ('hero', 'Gnocchi', '{}'),
  ('hero', 'Egg noodles', '{}'), ('hero', 'Rice noodles', '{}'), ('hero', 'Udon', '{}'),
  ('hero', 'Potatoes', '{}'), ('hero', 'New potatoes', '{}'), ('hero', 'Sweet potato', '{}'),
  ('hero', 'Asparagus', '{spring}'), ('hero', 'Jersey Royals', '{spring}'),
  ('hero', 'Spring onions', '{spring}'), ('hero', 'Radish', '{spring}'),
  ('hero', 'Broad beans', '{summer}'), ('hero', 'Peas', '{summer}'),
  ('hero', 'Courgette', '{summer}'), ('hero', 'Tomatoes', '{summer}'),
  ('hero', 'Sweetcorn', '{summer}'), ('hero', 'Aubergine', '{summer}'),
  ('hero', 'Runner beans', '{summer}'), ('hero', 'Peppers', '{summer}'),
  ('hero', 'Fennel', '{autumn}'), ('hero', 'Squash', '{autumn}'), ('hero', 'Pumpkin', '{autumn}'),
  ('hero', 'Mushrooms', '{autumn}'), ('hero', 'Beetroot', '{autumn}'),
  ('hero', 'Celeriac', '{winter}'), ('hero', 'Swede', '{winter}'), ('hero', 'Parsnip', '{winter}'),
  ('hero', 'Leeks', '{winter}'), ('hero', 'Cabbage', '{winter}'), ('hero', 'Brussels sprouts', '{winter}'),
  ('hero', 'Kale', '{winter}'), ('hero', 'Chard', '{winter}'),
  ('hero', 'Cauliflower', '{}'), ('hero', 'Broccoli', '{}'), ('hero', 'Carrots', '{}'),
  ('hero', 'Onions', '{}'), ('hero', 'Spinach', '{}'), ('hero', 'Pak choi', '{}'),
  ('hero', 'Purple sprouting broccoli', '{winter}'),
  ('hero', 'Preserved lemon', '{}'), ('hero', 'Miso', '{}'), ('hero', 'Gochujang', '{}'),
  ('hero', 'Harissa', '{}'), ('hero', 'Tamarind', '{}'), ('hero', 'Fish sauce', '{}'),
  ('hero', 'Doubanjiang', '{}'), ('hero', 'Black bean sauce', '{}'), ('hero', 'Nduja', '{}'),
  ('hero', 'Chorizo', '{}'), ('hero', 'Capers', '{}'), ('hero', 'Olives', '{}'),
  ('hero', 'Sumac', '{}'), ('hero', 'Za''atar', '{}'), ('hero', 'Dukkah', '{}'),
  ('hero', 'Ras el hanout', '{}'), ('hero', 'Berbere', '{}'), ('hero', 'Smoked paprika', '{}'),
  ('hero', 'Curry leaves', '{}'), ('hero', 'Black garlic', '{}'), ('hero', 'Pomegranate molasses', '{}'),
  ('hero', 'Tahini', '{}'), ('hero', 'Coconut milk', '{}'), ('hero', 'Mustard', '{}'),
  ('hero', 'Horseradish', '{}'), ('hero', 'Salted lemon and chilli', '{}'),
  ('hero', 'Anchovy butter', '{}'), ('hero', 'Sesame', '{}'), ('hero', 'Kimchi', '{}')
on conflict (axis, name) do nothing;

-- ---------------------------------------------------------------------------
-- Permanent per-card exclusions ("not this" / "more like this")
-- ---------------------------------------------------------------------------

create type exclusion_axis as enum ('protein', 'method', 'cuisine', 'dish');
create type exclusion_reaction as enum ('excluded', 'preferred');

create table preference_exclusions (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households (id) on delete cascade,
  axis exclusion_axis not null,
  value text not null,
  reaction exclusion_reaction not null,
  created_at timestamptz not null default now()
);

create index preference_exclusions_household_idx on preference_exclusions (household_id);

alter table preference_exclusions enable row level security;

create policy preference_exclusions_all on preference_exclusions
  for all using (household_id in (select household_ids()))
  with check (household_id in (select household_ids()));

grant select, insert, update, delete on preference_exclusions to authenticated;
