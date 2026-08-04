-- New generation call types for the five-phase flow: stage 3 (tailoring —
-- vegetable/herb/sauce component suggestions for the dish picked at stage 2)
-- and stage 4 (three richer variations on that dish, ahead of the stage-5
-- recipe call). 'options_refine' becomes a second orphaned value alongside
-- 'flavour'/'plate' — the stage-2 "Refresh" action reuses 'options' itself
-- rather than a distinct refinement call, per the same precedent already
-- established for unused enum values.
alter type generation_type add value if not exists 'dish_components';
alter type generation_type add value if not exists 'dish_variations';
