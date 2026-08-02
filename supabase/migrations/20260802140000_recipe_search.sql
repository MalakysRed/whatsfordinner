-- Full-text search over the recipe book (PRD 8).
--
-- Scoped to title, description and cuisine — the columns already denormalised
-- onto the row. Postgres forbids subqueries in a generated column expression,
-- which rules out pulling ingredient names out of `payload` here without a
-- separately maintained trigger; title/description/cuisine already cover what
-- a two-person household actually types into a search box, so that trigger
-- is not worth the admin (the same call as D1's dropped aisle mapping).

alter table recipes
  add column if not exists search tsvector
  generated always as (
    to_tsvector(
      'english',
      coalesce(title, '') || ' ' || coalesce(description, '') || ' ' || coalesce(cuisine, '')
    )
  ) stored;

create index if not exists recipes_search_idx on recipes using gin (search);
