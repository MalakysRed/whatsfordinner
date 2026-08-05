-- Removes "not this" (feature spec §5.4) — the permanent per-card dish
-- exclusion. Fully orphaned: nothing else reads or writes this table, and
-- no Settings-page UI ever consumed it. Destructive by design, not an
-- oversight — see the feature-removal plan this migration ships with.

drop table if exists preference_exclusions;
drop type if exists exclusion_axis;
drop type if exists exclusion_reaction;
