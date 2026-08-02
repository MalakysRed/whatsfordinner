-- Shopping list realtime + the per-list staples toggle (FR9.5, FR9.7).
--
-- "One person in the shop, one at home adding to the list" (FR9.7) needs tick
-- state to sync between browsers, which on Supabase means the table is a
-- member of the `supabase_realtime` publication. The publication itself is
-- created by the Supabase platform on a real project, but not on the
-- throwaway cluster `pnpm db:verify` uses, so this creates it if missing
-- rather than assuming either environment.

do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'list_items'
  ) then
    alter publication supabase_realtime add table list_items;
  end if;
end
$$;

-- Staples are excluded from a list by default (FR9.5); this is what the
-- per-list toggle flips. Defaults to false so a fresh list starts minimal.
alter table shopping_lists
  add column if not exists include_staples boolean not null default false;
