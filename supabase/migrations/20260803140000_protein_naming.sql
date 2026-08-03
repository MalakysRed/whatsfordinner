-- Standardises animal_protein/plant_protein naming to a max-two-word
-- convention — type plus cut/form (e.g. "Chicken Thigh", "Salmon Fillet"),
-- or a single recognisable name where a cut doesn't apply (e.g. "Tofu",
-- "Chickpeas"). Drops packaging/prep-state qualifiers (tinned, boneless,
-- skinless, bone in) entirely — those describe purchase/prep state, not
-- what the ingredient is, and made the meal builder's Protein chips read
-- inconsistently (some two words, some a whole qualifier clause).
--
-- Two things need fixing, both keyed by exact old name text rather than by
-- household, so this is safe to run uniformly everywhere: the
-- starter_ingredients catalogue itself (affects future adoptions), and any
-- household `ingredients` rows already copied from the old names (affects
-- every household that has already adopted starters, this one included).
--
-- starter_ingredients.name is a primary key, and ingredients has a
-- unique(household_id, name) constraint — both matter because the two old
-- "Chicken thighs..." variants both target the same new name "Chicken
-- Thigh". Where the target name already exists, the source row is deleted
-- instead of updated, rather than erroring on the collision.

do $$
declare
  mapping constant text[][] := array[
    ['Chicken breast', 'Chicken Breast'],
    ['Chicken thighs, boneless and skinless', 'Chicken Thigh'],
    ['Chicken thighs, bone in', 'Chicken Thigh'],
    ['Whole chicken', 'Whole Chicken'],
    ['Beef mince', 'Beef Mince'],
    ['Sirloin steak', 'Sirloin Steak'],
    ['Braising steak', 'Braising Steak'],
    ['Pork loin chops', 'Pork Chop'],
    ['Pork shoulder', 'Pork Shoulder'],
    ['Pork mince', 'Pork Mince'],
    ['Lamb mince', 'Lamb Mince'],
    ['Lamb shoulder', 'Lamb Shoulder'],
    ['Streaky bacon', 'Streaky Bacon'],
    ['Salmon fillet', 'Salmon Fillet'],
    ['Cod fillet', 'Cod Fillet'],
    ['King prawns', 'King Prawns'],
    ['Tinned tuna', 'Tuna'],
    ['Chickpeas, tinned', 'Chickpeas'],
    ['Butter beans, tinned', 'Butter Beans'],
    ['Cannellini beans, tinned', 'Cannellini Beans'],
    ['Black beans, tinned', 'Black Beans'],
    ['Kidney beans, tinned', 'Kidney Beans'],
    ['Green lentils', 'Green Lentils'],
    ['Red lentils', 'Red Lentils'],
    ['Puy lentils', 'Puy Lentils'],
    ['Firm tofu', 'Firm Tofu']
  ];
  m text[];
  r record;
begin
  foreach m slice 1 in array mapping loop
    if exists (select 1 from starter_ingredients where name = m[2]) then
      delete from starter_ingredients where name = m[1];
    else
      update starter_ingredients set name = m[2] where name = m[1];
    end if;

    for r in select id, household_id from ingredients where name = m[1] loop
      if exists (select 1 from ingredients where household_id = r.household_id and name = m[2]) then
        delete from ingredients where id = r.id;
      else
        update ingredients set name = m[2] where id = r.id;
      end if;
    end loop;
  end loop;
end $$;
