-- The seeded starter set (FR3.4, decision D3).
--
-- This is a global catalogue rather than 150 rows copied into every household on
-- creation. The bank is meant to be useful in minute one, but it is also meant
-- to be *yours* — so the app offers this list to tick from and copies across only
-- what is wanted. The catalogue stays readable afterwards so "add more from the
-- starter set" keeps working once the bank is established.
--
-- Edit this file freely. It is a starting point drafted for UK supermarkets, not
-- a fixed reference. staple_default marks the things it is safe to assume live
-- in a cupboard, which keeps them off shopping lists (A3).

create table starter_ingredients (
  name text primary key,
  category ingredient_category not null,
  typical_unit text,
  staple_default boolean not null default false
);

alter table starter_ingredients enable row level security;

-- Readable by anyone signed in; it is a reference list, not household data.
create policy starter_ingredients_read on starter_ingredients
  for select to authenticated using (true);

insert into starter_ingredients (name, category, typical_unit, staple_default) values
  -- Animal protein
  ('Chicken breast', 'animal_protein', 'g', false),
  ('Chicken thighs, boneless and skinless', 'animal_protein', 'g', false),
  ('Chicken thighs, bone in', 'animal_protein', 'g', false),
  ('Whole chicken', 'animal_protein', 'kg', false),
  ('Beef mince', 'animal_protein', 'g', false),
  ('Sirloin steak', 'animal_protein', 'g', false),
  ('Braising steak', 'animal_protein', 'g', false),
  ('Pork loin chops', 'animal_protein', 'g', false),
  ('Pork shoulder', 'animal_protein', 'g', false),
  ('Pork mince', 'animal_protein', 'g', false),
  ('Lamb mince', 'animal_protein', 'g', false),
  ('Lamb shoulder', 'animal_protein', 'g', false),
  ('Streaky bacon', 'animal_protein', 'g', false),
  ('Sausages', 'animal_protein', 'g', false),
  ('Chorizo', 'animal_protein', 'g', false),
  ('Salmon fillet', 'animal_protein', 'g', false),
  ('Cod fillet', 'animal_protein', 'g', false),
  ('King prawns', 'animal_protein', 'g', false),
  ('Tinned tuna', 'animal_protein', 'g', true),
  ('Eggs', 'animal_protein', 'each', true),

  -- Plant protein
  ('Chickpeas, tinned', 'plant_protein', 'g', true),
  ('Butter beans, tinned', 'plant_protein', 'g', true),
  ('Cannellini beans, tinned', 'plant_protein', 'g', true),
  ('Black beans, tinned', 'plant_protein', 'g', true),
  ('Kidney beans, tinned', 'plant_protein', 'g', true),
  ('Green lentils', 'plant_protein', 'g', true),
  ('Red lentils', 'plant_protein', 'g', true),
  ('Puy lentils', 'plant_protein', 'g', true),
  ('Firm tofu', 'plant_protein', 'g', false),
  ('Tempeh', 'plant_protein', 'g', false),

  -- Healthy fat
  ('Extra virgin olive oil', 'healthy_fat', 'ml', true),
  ('Olive oil', 'healthy_fat', 'ml', true),
  ('Rapeseed oil', 'healthy_fat', 'ml', true),
  ('Toasted sesame oil', 'healthy_fat', 'ml', true),
  ('Avocado', 'healthy_fat', 'each', false),
  ('Almonds', 'healthy_fat', 'g', true),
  ('Cashews', 'healthy_fat', 'g', true),
  ('Walnuts', 'healthy_fat', 'g', true),
  ('Pine nuts', 'healthy_fat', 'g', true),
  ('Tahini', 'healthy_fat', 'g', true),
  ('Peanut butter', 'healthy_fat', 'g', true),
  ('Kalamata olives', 'healthy_fat', 'g', false),

  -- Complex carb
  ('Basmati rice', 'complex_carb', 'g', true),
  ('Brown rice', 'complex_carb', 'g', true),
  ('Risotto rice', 'complex_carb', 'g', true),
  ('Couscous', 'complex_carb', 'g', true),
  ('Bulgur wheat', 'complex_carb', 'g', true),
  ('Quinoa', 'complex_carb', 'g', true),
  ('Pearl barley', 'complex_carb', 'g', true),
  ('Spaghetti', 'complex_carb', 'g', true),
  ('Penne', 'complex_carb', 'g', true),
  ('Rigatoni', 'complex_carb', 'g', true),
  ('Egg noodles', 'complex_carb', 'g', true),
  ('Rice noodles', 'complex_carb', 'g', true),
  ('Udon noodles', 'complex_carb', 'g', false),
  ('Maris Piper potatoes', 'complex_carb', 'g', false),
  ('New potatoes', 'complex_carb', 'g', false),
  ('Sweet potatoes', 'complex_carb', 'g', false),
  ('Tortilla wraps', 'complex_carb', 'each', false),
  ('Pitta bread', 'complex_carb', 'each', false),
  ('Sourdough loaf', 'complex_carb', 'each', false),
  ('Plain flour', 'complex_carb', 'g', true),

  -- Vegetable
  ('Onions', 'vegetable', 'each', true),
  ('Red onions', 'vegetable', 'each', false),
  ('Shallots', 'vegetable', 'each', false),
  ('Garlic', 'vegetable', 'clove', true),
  ('Leeks', 'vegetable', 'each', false),
  ('Spring onions', 'vegetable', 'each', false),
  ('Carrots', 'vegetable', 'each', true),
  ('Celery', 'vegetable', 'stick', false),
  ('Red peppers', 'vegetable', 'each', false),
  ('Red chillies', 'vegetable', 'each', false),
  ('Courgettes', 'vegetable', 'each', false),
  ('Aubergine', 'vegetable', 'each', false),
  ('Chestnut mushrooms', 'vegetable', 'g', false),
  ('Tomatoes', 'vegetable', 'each', false),
  ('Cherry tomatoes', 'vegetable', 'g', false),
  ('Chopped tomatoes, tinned', 'vegetable', 'g', true),
  ('Broccoli', 'vegetable', 'each', false),
  ('Tenderstem broccoli', 'vegetable', 'g', false),
  ('Cauliflower', 'vegetable', 'each', false),
  ('Green beans', 'vegetable', 'g', false),
  ('Frozen peas', 'vegetable', 'g', true),
  ('Spinach', 'vegetable', 'g', false),
  ('Kale', 'vegetable', 'g', false),
  ('Savoy cabbage', 'vegetable', 'each', false),
  ('Pak choi', 'vegetable', 'each', false),
  ('Butternut squash', 'vegetable', 'each', false),
  ('Cucumber', 'vegetable', 'each', false),
  ('Little gem lettuce', 'vegetable', 'each', false),
  ('Rocket', 'vegetable', 'g', false),
  ('Asparagus', 'vegetable', 'g', false),

  -- Fruit
  ('Lemons', 'fruit', 'each', true),
  ('Limes', 'fruit', 'each', true),
  ('Oranges', 'fruit', 'each', false),
  ('Apples', 'fruit', 'each', false),
  ('Bananas', 'fruit', 'each', false),
  ('Mango', 'fruit', 'each', false),
  ('Frozen mixed berries', 'fruit', 'g', false),
  ('Pomegranate', 'fruit', 'each', false),
  ('Medjool dates', 'fruit', 'g', true),
  ('Raisins', 'fruit', 'g', true),
  ('Dried apricots', 'fruit', 'g', true),

  -- Dairy
  ('Salted butter', 'dairy', 'g', true),
  ('Unsalted butter', 'dairy', 'g', true),
  ('Whole milk', 'dairy', 'ml', true),
  ('Double cream', 'dairy', 'ml', false),
  ('Crème fraîche', 'dairy', 'g', false),
  ('Greek yoghurt', 'dairy', 'g', false),
  ('Natural yoghurt', 'dairy', 'g', false),
  ('Cheddar', 'dairy', 'g', true),
  ('Parmesan', 'dairy', 'g', true),
  ('Mozzarella', 'dairy', 'g', false),
  ('Feta', 'dairy', 'g', false),
  ('Halloumi', 'dairy', 'g', false),
  ('Soured cream', 'dairy', 'g', false),

  -- Herb and spice
  ('Flaky sea salt', 'herb_and_spice', 'g', true),
  ('Black pepper', 'herb_and_spice', 'g', true),
  ('Ground cumin', 'herb_and_spice', 'tsp', true),
  ('Ground coriander', 'herb_and_spice', 'tsp', true),
  ('Smoked paprika', 'herb_and_spice', 'tsp', true),
  ('Turmeric', 'herb_and_spice', 'tsp', true),
  ('Ground cinnamon', 'herb_and_spice', 'tsp', true),
  ('Chilli flakes', 'herb_and_spice', 'tsp', true),
  ('Cayenne pepper', 'herb_and_spice', 'tsp', true),
  ('Garam masala', 'herb_and_spice', 'tsp', true),
  ('Curry powder', 'herb_and_spice', 'tsp', true),
  ('Ras el hanout', 'herb_and_spice', 'tsp', true),
  ('Za''atar', 'herb_and_spice', 'tsp', true),
  ('Dried oregano', 'herb_and_spice', 'tsp', true),
  ('Dried thyme', 'herb_and_spice', 'tsp', true),
  ('Bay leaves', 'herb_and_spice', 'each', true),
  ('Fresh rosemary', 'herb_and_spice', 'sprig', false),
  ('Fresh thyme', 'herb_and_spice', 'sprig', false),
  ('Fresh basil', 'herb_and_spice', 'g', false),
  ('Fresh coriander', 'herb_and_spice', 'g', false),
  ('Flat leaf parsley', 'herb_and_spice', 'g', false),
  ('Fresh mint', 'herb_and_spice', 'g', false),
  ('Fresh dill', 'herb_and_spice', 'g', false),
  ('Fresh ginger', 'herb_and_spice', 'g', false),
  ('Lemongrass', 'herb_and_spice', 'stalk', false),
  ('Cardamom pods', 'herb_and_spice', 'each', true),
  ('Fennel seeds', 'herb_and_spice', 'tsp', true),
  ('Chinese five spice', 'herb_and_spice', 'tsp', true),

  -- Pantry
  ('Chicken stock cubes', 'pantry', 'each', true),
  ('Vegetable stock cubes', 'pantry', 'each', true),
  ('Coconut milk, tinned', 'pantry', 'ml', true),
  ('Passata', 'pantry', 'g', true),
  ('Tomato purée', 'pantry', 'tbsp', true),
  ('Caster sugar', 'pantry', 'g', true),
  ('Honey', 'pantry', 'tbsp', true),
  ('Maple syrup', 'pantry', 'tbsp', true),
  ('Cornflour', 'pantry', 'tbsp', true),
  ('Panko breadcrumbs', 'pantry', 'g', true),
  ('Tinned anchovies', 'pantry', 'g', true),
  ('Capers', 'pantry', 'g', true),
  ('Sun-dried tomatoes', 'pantry', 'g', true),
  ('Nori sheets', 'pantry', 'each', false),

  -- Condiment
  ('Light soy sauce', 'condiment', 'tbsp', true),
  ('Dark soy sauce', 'condiment', 'tbsp', true),
  ('Fish sauce', 'condiment', 'tbsp', true),
  ('Oyster sauce', 'condiment', 'tbsp', true),
  ('Rice vinegar', 'condiment', 'tbsp', true),
  ('White wine vinegar', 'condiment', 'tbsp', true),
  ('Red wine vinegar', 'condiment', 'tbsp', true),
  ('Balsamic vinegar', 'condiment', 'tbsp', true),
  ('Cider vinegar', 'condiment', 'tbsp', true),
  ('Dijon mustard', 'condiment', 'tsp', true),
  ('Wholegrain mustard', 'condiment', 'tsp', true),
  ('Sriracha', 'condiment', 'tbsp', true),
  ('Gochujang', 'condiment', 'tbsp', true),
  ('White miso paste', 'condiment', 'tbsp', true),
  ('Harissa', 'condiment', 'tbsp', true),
  ('Thai green curry paste', 'condiment', 'tbsp', true),
  ('Thai red curry paste', 'condiment', 'tbsp', true),
  ('Mirin', 'condiment', 'tbsp', true);

-- Copies the starter set into a household's bank. Names already present are left
-- alone, so this is safe to run again to top up after the catalogue grows.
-- Passing null adopts everything; pass an array to adopt only what was ticked.
create or replace function public.adopt_starter_ingredients(names text[] default null)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  target_household uuid;
  inserted integer;
begin
  if caller is null then
    raise exception 'not_authenticated';
  end if;

  select household_id into target_household
  from memberships where user_id = caller;

  if target_household is null then
    raise exception 'no_household';
  end if;

  insert into ingredients (household_id, name, category, typical_unit, staple)
  select target_household, s.name, s.category, s.typical_unit, s.staple_default
  from starter_ingredients s
  where names is null or s.name = any (names)
  on conflict (household_id, name) do nothing;

  get diagnostics inserted = row_count;
  return inserted;
end;
$$;

revoke execute on function public.adopt_starter_ingredients(text[]) from anon;
