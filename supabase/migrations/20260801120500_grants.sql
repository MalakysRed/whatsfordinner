-- Table privileges for the Supabase roles.
--
-- RLS policies decide *which rows*; grants decide *whether the role may touch
-- the table at all*. Both are needed: a policy without a grant fails with a
-- permission error, and a grant without a policy returns nothing. Supabase
-- applies broad default privileges to the public schema, so being explicit here
-- is what keeps the two environments honest with each other.
--
-- anon gets nothing. There is no public content in this app — every row belongs
-- to a household, and you have to be signed in to belong to one.

grant select, insert, update, delete on
  users,
  households,
  memberships,
  invites,
  settings,
  equipment,
  dietary_rules,
  ingredients,
  recipes,
  favourites,
  cook_log,
  shopping_lists,
  list_items
to authenticated;

-- Read-only for the client. Generation rows are written server-side, where the
-- token counts and costs come from; letting a browser write them would make the
-- daily cap and the spend figures fiction.
grant select on generations to authenticated;

grant select on starter_ingredients to authenticated;

-- signup_allowlist is intentionally absent. Service role only.
