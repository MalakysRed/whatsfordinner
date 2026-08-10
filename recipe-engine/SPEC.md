# Technique, Pattern and Archetype Schema

**Companion to:** `recipe-database-plan.md`
**Purpose:** implementation ready spec for the three authored layers that drive generation.
**Dialect:** PostgreSQL. `jsonb` used where structure is nested but never queried relationally.

---

## Design rules that apply throughout

1. **Authored data is the source of truth.** Every culinary claim the app makes traces to a row here.
2. **Durations are models, not constants.** A technique takes longer with more food in the pan. Store the function, compute the number.
3. **Nothing is stored that can be computed.** Effort, total time and equipment lists are derived from the step sequence at generation time.
4. **Every option carries its own deltas.** This is what makes the live preview instant and deterministic — no model call in the interaction loop.
5. **Status field on every authored table.** `draft` records are usable in development, invisible in production.
6. **Local references use slugs; cross-record references use IDs.** A slot exists only inside its archetype, so `consumes_slots` and `condition.slot` name slot *slugs*, scoped to that archetype. Anything referring to a record that lives elsewhere — `technique_id`, `pattern_id`, `canonical_ingredient_id` — uses the permanent `ID`. `SLOT_` IDs still exist as database primary keys for `slot_option` to reference; both forms coexist deliberately. Renaming a slot slug then breaks references inside one file only, caught immediately by the validator.
7. **Keep the state vocabulary coarse.** `produces` and `accepts` values should number roughly eight to twelve across the whole system — `softened`, `browned`, `reduced`, `sealed`, `tender`, `thickened`, `combined`. Precise culinary description belongs in `sensory_cues` and `sensory_target`, which humans read. Over-specific machine states ("translucent but not yet golden") make optional steps unskippable and produce constant false validation failures.

---

## 0. Shared enums

```sql
CREATE TYPE heat_level AS ENUM (
  'none','low','medium_low','medium','medium_high','high','very_high'
);

CREATE TYPE attention_level AS ENUM (
  'unattended',   -- walk away
  'periodic',     -- check every few minutes
  'frequent',     -- stir often, stay in kitchen
  'constant'      -- do not leave, do not blink
);

CREATE TYPE technique_category AS ENUM (
  'knife','prep','heat_dry','heat_moist','heat_fat','emulsify','leaven',
  'ferment','combine','finish','rest','assembly'
);

CREATE TYPE typicality AS ENUM (
  'traditional','regional_traditional','common','modern','unconventional'
);

CREATE TYPE authoring_status AS ENUM ('draft','review','published','deprecated');

CREATE TYPE slot_cardinality AS ENUM ('exactly_one','one_to_three','zero_to_three','one_to_many');

CREATE TYPE operates_on AS ENUM (
  'vessel',   -- acts on accumulated pan contents
  'slots',    -- acts only on newly introduced fills
  'both'      -- new fills joined to existing contents
);

CREATE TYPE verification_status AS ENUM (
  'unverified',           -- authored from research, never cooked
  'author_verified',      -- cooked by the author, result was right
  'community_verified'    -- cook log cleared the confidence threshold
);

-- Strict by design. Adding a value should be a deliberate act meaning a
-- genuinely new structural category, not a dish that did not fit.
CREATE TYPE dish_class AS ENUM (
  'braise','stew','roast','traybake','pan_sauce','fry','deep_fry','stir_fry',
  'soup','bake','pasta','rice','flatbread','pastry','grill','salad','no_cook'
);

CREATE TYPE adaptation_type AS ENUM (
  'traditional','regional_traditional','diaspora',
  'restaurant_style','western_adaptation','fusion'
);

CREATE TYPE slot_role AS ENUM (
  'main','aromatic','spice','fat','acid','liquid','starch','garnish','pantry'
);
```

---

## 1. `technique`

The atomic operation. Target 150–200 rows.

```sql
CREATE TABLE technique (
  id                  text PRIMARY KEY,          -- TECH_SWEAT
  slug                text UNIQUE NOT NULL,      -- sweat
  display_name        text NOT NULL,             -- Sweat
  category            technique_category NOT NULL,
  status              authoring_status NOT NULL DEFAULT 'draft',

  -- Teaching content
  definition_short    text NOT NULL,             -- tooltip, <= 140 chars
  definition_full     text NOT NULL,
  teaching_note       text,                      -- why it matters, what it achieves
  common_misconception text,

  -- Execution contract
  accepts             jsonb NOT NULL,            -- input filter, see below
  produces            jsonb NOT NULL,            -- output state
  requires_fat        boolean NOT NULL DEFAULT false,
  heat                heat_level NOT NULL,
  vessel_types        text[] NOT NULL,           -- ['saute_pan','saucepan']
  covered             boolean,                   -- null = either

  -- Timing
  duration_model      jsonb NOT NULL,            -- see below
  attention           attention_level NOT NULL,

  -- Difficulty and progression
  difficulty          smallint NOT NULL CHECK (difficulty BETWEEN 1 AND 5),
  failure_sensitivity smallint NOT NULL CHECK (failure_sensitivity BETWEEN 1 AND 5),
  prerequisite_ids    text[] NOT NULL DEFAULT '{}',   -- technique DAG

  -- Sequencing
  can_follow          text[] NOT NULL DEFAULT '{}',   -- empty = unconstrained
  can_precede         text[] NOT NULL DEFAULT '{}',
  cannot_follow       text[] NOT NULL DEFAULT '{}',

  -- Recognition and recovery (highest value, cannot be derived)
  sensory_cues        jsonb NOT NULL,            -- ordered array
  failure_modes       jsonb NOT NULL,            -- array of objects

  -- Cross cuisine
  aliases_by_cuisine  jsonb NOT NULL DEFAULT '{}',

  equipment_ids       text[] NOT NULL DEFAULT '{}',

  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ON technique (category, difficulty);
CREATE INDEX ON technique USING gin (prerequisite_ids);
```

### `accepts` / `produces`

```jsonc
// accepts
{
  "ingredient_tags": ["aromatic_vegetable"],   // matches ontology tags
  "states": ["raw"],
  "forms": ["diced", "sliced", "minced"],
  "min_count": 1
}

// produces
{
  "state": "softened",
  "colour": "none",              // none | pale_gold | golden | browned | dark
  "moisture": "reduced",
  "notes": "translucent, sweet smelling, no colour taken"
}
```

`can_follow` chains are validated against `produces` -> `accepts` at archetype authoring time, which catches incoherent step ordering before it ever reaches a user.

### `duration_model`

Never a fixed number.

```jsonc
{
  "base_seconds": 180,
  "per_100g_seconds": 90,
  "min_seconds": 180,
  "max_seconds": 1200,
  "scales_with": "slot:aromatic_base",   // which slot's mass drives it
  "modifiers": {
    "vessel_crowded": 1.4,
    "heat_low": 1.5,
    "lid_on": 0.75
  }
}
```

### `sensory_cues`

Ordered, because they occur in sequence. This is what beginners lack — they follow the clock instead of the pan.

```jsonc
[
  {"at": "start",   "sense": "sound",  "cue": "a gentle sizzle, not a crackle"},
  {"at": "midway",  "sense": "sight",  "cue": "edges turning translucent"},
  {"at": "done",    "sense": "smell",  "cue": "sweet, not sharp"},
  {"at": "done",    "sense": "sight",  "cue": "fully translucent, no browning"},
  {"at": "overdone","sense": "sight",  "cue": "gold or brown patches appearing"}
]
```

### `failure_modes`

```jsonc
[
  {
    "symptom": "onions browning at the edges",
    "cause": "heat too high or pan too dry",
    "prevention": "medium low heat, enough fat to coat",
    "recovery": "add a splash of water, scrape, lower the heat",
    "severity": "recoverable"          // recoverable | degrades_dish | start_again
  }
]
```

### Worked row

```jsonc
{
  "id": "TECH_SWEAT",
  "slug": "sweat",
  "display_name": "Sweat",
  "category": "heat_fat",
  "definition_short": "Cook vegetables gently in fat until soft and translucent, without letting them colour.",
  "teaching_note": "Sweating draws moisture out and turns raw sharpness sweet. Browning is a different technique with a different flavour — if it colours, you have made a soffritto base for something else.",
  "common_misconception": "That it is just 'frying slowly'. The absence of colour is the entire point.",
  "requires_fat": true,
  "heat": "medium_low",
  "vessel_types": ["saute_pan","casserole","saucepan"],
  "covered": null,
  "attention": "periodic",
  "difficulty": 1,
  "failure_sensitivity": 2,
  "prerequisite_ids": ["TECH_DICE"],
  "can_precede": ["TECH_DEGLAZE","TECH_BLOOM_GROUND_SPICE","TECH_ADD_LIQUID"],
  "aliases_by_cuisine": {"fr": "faire suer", "it": "soffriggere (dolce)"}
}
```

---

## 2. `pattern`

Named composites. Target 30–50 rows. Referenced by archetypes so a change to soffritto propagates everywhere.

```sql
CREATE TABLE pattern (
  id              text PRIMARY KEY,        -- PAT_SOFFRITTO
  slug            text UNIQUE NOT NULL,
  display_name    text NOT NULL,
  status          authoring_status NOT NULL DEFAULT 'draft',
  cuisine_ids     text[] NOT NULL,
  description     text NOT NULL,
  teaching_note   text,
  step_sequence   jsonb NOT NULL,          -- ordered technique refs with params
  ingredient_spec jsonb NOT NULL,          -- slots and ratios
  produces        jsonb NOT NULL,          -- output state for sequencing checks
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
```

```jsonc
// PAT_SOFFRITTO.ingredient_spec
{
  "components": [
    {"tag": "onion",  "ratio": 2, "form": "finely diced"},
    {"tag": "carrot", "ratio": 1, "form": "finely diced"},
    {"tag": "celery", "ratio": 1, "form": "finely diced"}
  ],
  "fat": {"tag": "cooking_fat", "ml_per_100g_solids": 15},
  "basis": "total_solids_g"
}
```

---

## 3. `archetype`

The dish skeleton. Target 40–60 rows. **The highest leverage table in the system.**

```sql
CREATE TABLE archetype (
  id                  text PRIMARY KEY,    -- ARCH_CURRY_NORTH_INDIAN
  slug                text UNIQUE NOT NULL,
  display_name        text NOT NULL,
  status              authoring_status NOT NULL DEFAULT 'draft',

  dish_class          dish_class NOT NULL,
  cuisine_ids         text[] NOT NULL,
  adaptation_type     adaptation_type NOT NULL,
  region_note         text,

  description         text NOT NULL,       -- authored, shown before slot filling
  teaching_summary    text,                -- what the user learns by cooking this

  verification_status verification_status NOT NULL DEFAULT 'unverified',
  verified_at         timestamptz,
  verification_note   text,                -- what was wrong the first time it was cooked

  default_servings    smallint NOT NULL DEFAULT 4,
  scalable            boolean NOT NULL DEFAULT true,
  scaling_limits      jsonb,               -- {"min":1,"max":8,"note":"pan capacity"}

  base_flavour_axes   jsonb NOT NULL,      -- before slot fills modify them
  required_equipment  text[] NOT NULL DEFAULT '{}',

  entry_affinities    jsonb NOT NULL,      -- how it ranks per entry point, see below

  authoring_notes     text,                -- your own caveats, regional disputes
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);
```

### `base_flavour_axes`

Six axes, 0–10. Slot options apply deltas to these; the result drives the generated description and the live preview.

```jsonc
{"heat": 4, "acid": 3, "sweet": 2, "umami": 6, "richness": 5, "aromatic": 7}
```

### `entry_affinities`

Supports the pluggable entry points without a separate ranking table per door.

```jsonc
{
  "hero_ingredient_tags": ["chicken","lamb","paneer","chickpea"],
  "inventory_minimum": ["onion","garlic","ginger","ground_spice"],
  "time_band": "40_70_min",
  "effort_band": "moderate",
  "moods": ["comforting","warming","batch_cookable"]
}
```

---

## 4. `archetype_step`

Ordered operation sequence.

**A step does not always transform the previous step's output.** Some steps act on the accumulated pan contents, some introduce new ingredients and act only on those, some do both. Conflating these produces false validation failures — searing raw protein after reducing a sauce is correct cooking, not a state mismatch. `operates_on` resolves it.

**Steps are also not always a single line.** Dal boils pulses in one pan while a tarka is prepared in another; risotto keeps a stock pan alongside; biryani runs three streams. `vessel_id` partitions the sequence so chaining is validated within a stream rather than globally.

```sql
CREATE TABLE archetype_step (
  id                text PRIMARY KEY,      -- STEP_<ARCHCODE>_<SLUG>
  archetype_id      text NOT NULL REFERENCES archetype(id) ON DELETE CASCADE,
  position          smallint NOT NULL,

  technique_id      text REFERENCES technique(id),
  pattern_id        text REFERENCES pattern(id),
  CHECK (num_nonnulls(technique_id, pattern_id) = 1),

  purpose           text NOT NULL,        -- why this step exists; teaching content
  consumes_slots    text[] NOT NULL DEFAULT '{}',   -- slot SLUGS, scoped to this archetype

  -- What the technique acts on. Determines which validation applies.
  operates_on       operates_on NOT NULL,

  -- Stream partitioning. Chaining is validated within a vessel, in position order.
  vessel_id         text NOT NULL DEFAULT 'main',
  merges_from       text[] NOT NULL DEFAULT '{}',   -- vessel_ids joined at this step

  is_optional       boolean NOT NULL DEFAULT false,
  condition         jsonb,                -- e.g. {"slot":"souring_agent","filled":true}

  heat_override     heat_level,
  duration_override jsonb,
  attention_override attention_level,
  sensory_target    text NOT NULL,        -- what it should look/smell like when done

  UNIQUE (archetype_id, position)
);
```

### `operates_on`

| Value | Subject | Validation applied |
|---|---|---|
| `vessel` | Accumulated contents of `vessel_id` | Previous step in the same vessel: `produces` must satisfy `accepts` |
| `slots` | Only the newly introduced fills | Each consumed slot's `accepts_filter` must be compatible with the technique's `accepts`. **No chain check.** |
| `both` | New fills joined to existing contents | Fills validated as above. **No chain check** — the vessel state is deliberately being changed. |

Examples: reduce and simmer are `vessel`; searing the hero protein and blooming whole spices are `slots`; adding stock to a fried base and simmering is `both`.

A step with non-empty `merges_from` must be `both`.

### Parallelism is derived, not authored

`can_run_parallel_with` has been removed. Steps in different vessels with overlapping position ranges are concurrent by definition, so coordination load is computed from `vessel_id` and position rather than hand maintained. One fewer field to keep consistent while reordering steps.

### Step IDs

`STEP_` + archetype short code + slug: `STEP_NIC_BLOOM_WHOLE_SPICE`. **Never position derived.** Steps get reordered constantly during authoring, and position based IDs would break every reference on each reorder.

---

## 5. `slot` and `slot_option`

Where generation gets its variety and the UI gets its dynamism.

```sql
CREATE TABLE slot (
  id                text PRIMARY KEY,      -- SLOT_NIC_HERO_PROTEIN
  archetype_id      text NOT NULL REFERENCES archetype(id) ON DELETE CASCADE,
  slug              text NOT NULL,         -- hero_protein
  display_name      text NOT NULL,         -- "Main protein"
  ui_prompt         text NOT NULL,         -- "What are you cooking with?"
  ui_order          smallint NOT NULL,

  role              slot_role NOT NULL,
  cardinality       slot_cardinality NOT NULL,
  is_required       boolean NOT NULL DEFAULT true,

  accepts_filter    jsonb NOT NULL,        -- ontology query defining valid options
  quantity_rule_id  text NOT NULL,         -- FK to constraint layer
  default_option_id text,

  affects           text[] NOT NULL,       -- ['dish_name','time','effort','description','flavour_axes']
  UNIQUE (archetype_id, slug)
);

CREATE TABLE slot_option (
  id                      text PRIMARY KEY,
  slot_id                 text NOT NULL REFERENCES slot(id) ON DELETE CASCADE,
  canonical_ingredient_id text NOT NULL,

  suitability             numeric(3,2) NOT NULL CHECK (suitability BETWEEN 0 AND 1),
  typicality              typicality NOT NULL,
  display_order           smallint,

  -- Authored culinary claim. The model phrases this; it never originates it.
  impact_note             text NOT NULL,

  effect_on               jsonb NOT NULL,     -- the live preview payload
  adds_technique_ids      text[] NOT NULL DEFAULT '{}',
  adds_steps              jsonb,
  conflicts_with          text[] NOT NULL DEFAULT '{}',
  dietary_impact          text[] NOT NULL DEFAULT '{}',
  quantity_override_rule  text,

  UNIQUE (slot_id, canonical_ingredient_id)
);

CREATE INDEX ON slot_option (slot_id, suitability DESC);
```

### `accepts_filter`

Tag matching only. **No query language, no DSL, no parser.** If this proves insufficient, extend it when a real archetype demands it — not before.

```jsonc
{
  "any_tags":     ["red_meat","poultry"],   // must carry at least one
  "all_tags":     ["raw"],                  // optional: must carry all
  "exclude_tags": ["cured"],                // optional
  "exclude_ids":  ["ING_00219"]             // optional: specific exceptions
}
```

Validation for a `slots` or `both` step: every ingredient satisfying the filter must also satisfy the technique's `accepts`. A filter that admits an ingredient the technique cannot take is an authoring error, caught at build time rather than at generation time.

### `adds_steps` — deferred

Left permissive (`jsonb`, unvalidated) on purpose. The first archetype that genuinely needs a slot option to inject an extra step defines the shape. Specifying it now, with no use case, produces a field nobody can use correctly.

### `effect_on` — the live preview payload

**This is the field that makes 4.2 of the plan work.** Because every delta is stored, the UI recomputes the preview locally on selection with no round trip and no model call.

```jsonc
{
  "flavour_delta":   {"heat": +3, "umami": +1, "richness": -1},
  "time_delta_min":  +8,
  "effort_delta":    {"technique_ceiling": 0, "coordination": +1},
  "obtainability":   "specialist_grocer",
  "description_fragment": "smoky and properly hot",
  "dish_name_modifier": "Kashmiri",
  "equipment_added": []
}
```

### Worked example — one option

```jsonc
{
  "id": "OPT_NIC_SPICE_SMOKED_PAPRIKA",
  "slot_id": "SLOT_NIC_GROUND_SPICE",
  "canonical_ingredient_id": "ING_00871",
  "suitability": 0.30,
  "typicality": "unconventional",
  "impact_note": "Spanish rather than Indian. It brings smoke and sweetness but pulls the dish towards a chorizo stew — pleasant, but no longer a north Indian curry.",
  "effect_on": {
    "flavour_delta": {"heat": +1, "sweet": +1, "aromatic": -2},
    "description_fragment": "smoky, closer to a Spanish stew",
    "dish_name_modifier": null
  },
  "conflicts_with": ["OPT_NIC_SPICE_GARAM_MASALA"]
}
```

Note that a poor option is not hidden. It is offered, scored, and honestly annotated — which teaches the user something rather than quietly deciding for them.

---

## 6. Worked archetype

`ARCH_CURRY_NORTH_INDIAN` — short code `NIC`. Single vessel throughout.

| Pos | Technique / Pattern | `operates_on` | Slots consumed | Sensory target | Optional |
|---|---|---|---|---|---|
| 1 | TECH_BLOOM_WHOLE_SPICE | slots | whole_spice, cooking_fat | Seeds popping, fragrant, not dark | yes |
| 2 | TECH_SWEAT then TECH_FRY_AROMATIC | both | aromatic_base | Deep gold, jammy, no raw smell | no |
| 3 | TECH_FRY_PASTE | both | ginger_garlic | Fat separating at the edges | no |
| 4 | TECH_BLOOM_GROUND_SPICE | both | ground_spice | 30 seconds only, fragrant, never dark | no |
| 5 | TECH_REDUCE | both | souring_agent | Thick, fat pooling | yes (cond: souring_agent filled) |
| 6 | TECH_SEAR / TECH_ADD | slots | hero_protein | Coated and sealed | no |
| 7 | TECH_SIMMER | both | liquid | Sauce clings to a spoon | no |
| 8 | TECH_FINISH | both | finishing_dairy, finishing_herb | Glossy, fresh smelling | yes |

Note step 6: `operates_on: 'slots'`, so raw protein after a reduced sauce is not a state mismatch. Under the original rule this archetype would have failed validation while being correct cooking — which is what prompted the `operates_on` field.

**Slots:** `whole_spice` (0–3), `aromatic_base` (exactly one), `ginger_garlic` (exactly one), `ground_spice` (1–3), `souring_agent` (0–1), `hero_protein` (exactly one), `liquid` (exactly one), `finishing_dairy` (0–1), `finishing_herb` (0–1).

Nine slots, with a realistic option list per slot, generates thousands of coherent distinct dishes from one archetype — all of them structurally sound, because the skeleton is authored rather than invented per request.

### Contrast: a two vessel archetype

`ARCH_DAL_TARKA` runs two streams that converge, which is why `vessel_id` exists:

| Pos | Vessel | Technique | `operates_on` | Merges from |
|---|---|---|---|---|
| 1 | main | TECH_BOIL_PULSE | slots | — |
| 2 | main | TECH_SIMMER_TO_COLLAPSE | vessel | — |
| 3 | tarka | TECH_BLOOM_WHOLE_SPICE | slots | — |
| 4 | tarka | TECH_FRY_AROMATIC | both | — |
| 5 | main | TECH_COMBINE | both | ['tarka'] |

Steps 3 and 4 overlap in position range with 1 and 2 but sit in a different vessel, so coordination load is computed rather than authored.

---

## 7. Validation rules

Enforced in code at generation time. Rejection, not correction.

**Referential:** every ID emitted by the model exists; every slot_option belongs to the slot it fills; required slots are filled; cardinality respected; no conflicting options co-selected.

**Sequencing:** validated **per vessel**, in position order, and only for steps where `operates_on = 'vessel'` — such a step's `accepts` must be satisfiable by whichever step actually precedes it at runtime. Because optional steps may be skipped, that is not simply the step at `position - 1`.

**The optional step walk.** For each `vessel` step, walk *backwards* through the same `vessel_id` collecting candidate predecessors: every optional `vessel` or `both` step encountered, and then the first mandatory one, at which point the walk stops. The step's `accepts` must be satisfied by the `produces` of **every** candidate in that set.

Worked example — step 4 mandatory, steps 5 and 6 optional, step 7 mandatory:

| Step | Must be satisfiable by |
|---|---|
| 7 | 6, 5, 4 |
| 6 | 5, 4 |
| 5 | 4 |

This covers every combination of skips. Checking only `position - 1` would pass an archetype that breaks the moment a user's selections omit an optional step — a failure invisible at authoring time and visible in someone's kitchen.

Both `vessel` and `both` steps are valid predecessors, since each leaves the pan in a new state. Steps with `operates_on` of `slots` or `both` are exempt as *targets* of the check, because they introduce new ingredients rather than transforming what is already there; for those, each consumed slot's `accepts_filter` must instead be compatible with the technique's `accepts`.

Also check: no `cannot_follow` violation; every `merges_from` vessel exists and has at least one prior step; prerequisites satisfied for the user's technique level if level gating is on.

**Known limitation, recorded rather than fixed:** the walk treats all skip combinations as reachable, but `condition` values can make some mutually exclusive. It will therefore occasionally flag a combination that cannot actually occur. This is left deliberately — a false positive is visible and irritating, a false negative is invisible and ends up in a user's pan. If a real archetype throws a spurious failure, that is the trigger to make the walk condition aware.

**Deliberately not checked yet:** full vessel state accumulation — tracking what is actually in each pan, so that "you simmered something that was never given liquid" is caught. A real error class, but rarer than ordering mistakes, and it needs a combination model (what does `seared` become when cold stock is added?) that cannot be designed well against imaginary archetypes. Deferring costs nothing: it would consume exactly the `produces` / `accepts` data being authored now, so nothing needs re-authoring when it is added.

**Quantity:** every quantity traces to a `quantity_rule_id`; total weight per serving within plausible bounds for the dish class; seasoning within the constraint layer's range; liquid ratios within range.

**Coherence:** computed total time consistent with the sum of step durations; equipment list is the union of step requirements; declared effort axes match computed values.

**Prose:** the model's `user_facing_prose` mentions no ingredient absent from the fills, and no quantity that contradicts the computed values. Cheap to check, catches the most damaging class of error.

---

## 8. Authoring order and definition of done

Work **top down**. Author an archetype and it tells you which techniques and patterns you need; the atomic list assembles itself instead of being guessed at.

1. Pick the ten highest coverage archetypes across the target cuisines.
2. For each, write the step table first, in prose, from your own knowledge.
3. Extract the techniques it references. Author those.
4. Define slots and options. Options need `impact_note` and `effect_on` before they count as done.
5. Author the constraint rules the slots reference.
6. Generate ten dishes from the archetype and cook two.

**A technique row is done** when it has: definition_short, definition_full, accepts, produces, duration_model, attention, difficulty, at least three sensory cues including an overdone cue, and at least two failure modes with recovery steps.

**An archetype row is done** when it has: a full step sequence with sensory targets, all slots defined with at least four options each, entry_affinities populated, and one generated output that a competent cook would recognise as the dish.

The sensory cues and failure modes are the part that cannot be automated, bought or scraped. They are also the part that makes the app teach rather than instruct. Budget accordingly.