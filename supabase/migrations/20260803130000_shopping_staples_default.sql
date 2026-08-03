-- A household-level default for the per-list staples toggle (FR9.5).
--
-- shopping_lists.include_staples (20260802150000) is per-list and always
-- starts false, so a household that always wants staples included had to
-- flip the toggle on every fresh list. This adds a household setting that
-- seeds a new list's include_staples instead of hardcoding false.

alter table settings
  add column if not exists default_include_staples boolean not null default false;
