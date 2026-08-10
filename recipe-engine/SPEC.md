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
7. **The state vocabulary is a fixed, closed list.** `produces.state` and `accepts.states` draw only from the `ingredient_state` enum in §0. Precise culinary description belongs in `sensory_cues` and `sensory_target`, which humans read and the validator ignores. Over-specific machine states ("translucent but not yet golden") make optional steps unskippable and produce constant false validation failures. A closed enum makes vocabulary drift impossible rather than merely detectable — adding a state requires a deliberate migration, as with `method_class`.
8. **Tags and states are separate namespaces and never mix.** A *tag* is a permanent property of an ingredient (`poultry`, `pulse`, `whole_spice`) and lives on the canonical ingredient. A *state* is a temporary condition at one moment in the sequence (`raw`, `sealed`, `tender`) and is produced by a step. Slot filters describe *which ingredient*; states describe *what has happened to it*. Merging them would require separate ingredient records for raw and cooked chicken.

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

-- Closed by design. See design rule 7. Adding a value is a migration, not
-- a convenience. Never overlaps with ingredient tags — see design rule 8.
CREATE TYPE ingredient_state AS ENUM (
  'raw','softened','browned','sealed','reduced',
  'thickened','tender','combined','set','rested'
);

-- DERIVED, never authored or stored. Computed by comparing
-- verified_structure_hash against the freshly computed structure_hash.
-- See §3 Verification integrity.
--
-- Two values only. A 'community_verified' state was considered and
-- deliberately left out: the cook log does not exist yet, and when it does,
-- community verification will need a threshold, a cook count and a link
-- between cook entries and archetype versions — more than a third branch
-- in the derivation. A placeholder now would almost certainly be the wrong
-- shape later, and an unreachable enum value invites incorrect wiring.
CREATE TYPE verification_status AS ENUM (
  'unverified',           -- never cooked, or cooked against a structure since changed
  'author_verified'       -- cooked by the author against the current structure
);

-- Strict by design. Adding a value should be a deliberate act meaning a
-- genuinely new structural category, not a dish that did not fit.
-- A PROCESS taxonomy: how heat is applied and how food is transformed.
-- Strict by design. Adding a value is a migration, and should mean a
-- genuinely new process, not a dish that did not fit.
--
-- Deliberately NOT included: principal component (pasta, rice, flatbread,
-- pastry) and format (traybake, pan_sauce, salad). Those answer different
-- questions and mixing three axes on one field is what produced the
-- overlaps in the earlier draft. A lasagne and a pizza are both 'bake';
-- what separates them is the archetype. One tin is derivable from
-- vessel_id, not a class.
CREATE TYPE method_class AS ENUM (
  -- dry heat
  'roast',       -- sustained dry oven heat on something already food, largely unattended
  'bake',        -- assembled or mixed cold, set or transformed by sustained oven heat
  'grill',       -- direct radiant heat, one surface at a time
  'fry',         -- shallow fat, active, minutes
  'deep_fry',    -- submerged in fat held at temperature
  'stir_fry',    -- very high heat, constant movement, mise en place mandatory
  -- moist heat
  'simmer',      -- sustained liquid heat below boiling, long
  'boil',        -- rolling liquid, usually starch or vegetable, short
  'steam',       -- indirect moist heat
  'poach',       -- gentle submerged liquid below simmer, high failure sensitivity
  -- combination
  'braise',      -- sear, then liquid, then slow covered cooking (absorbs 'stew')
  -- biological
  'ferment',     -- microbial transformation over hours to weeks; near-zero active
                 -- time, long elapsed time, ambient conditions are the parameter
  -- none
  'raw'          -- no heat applied at any point
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
  short_code          text UNIQUE NOT NULL CHECK (short_code ~ '^[A-Z]{2,4}$'),
  display_name        text NOT NULL,
  status              authoring_status NOT NULL DEFAULT 'draft',

  method_class        method_class NOT NULL,
  cuisine_ids         text[] NOT NULL,
  adaptation_type     adaptation_type NOT NULL,
  region_note         text,

  description         text NOT NULL,       -- authored, shown before slot filling
  teaching_summary    text,                -- what the user learns by cooking this

  -- Verification. See below: what is authored here is the FACT of cooking
  -- it, not a status. verification_status is DERIVED, never authored.
  verified_at         timestamptz,
  verified_structure_hash text,            -- structure_hash at time of verification
  verification_note   text,                -- what was wrong when it was cooked
  CHECK ((verified_at IS NULL) = (verified_structure_hash IS NULL)),
  CHECK (verification_note IS NULL OR verified_at IS NOT NULL),

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

### Verification integrity

A verification records that *a specific version* of the archetype was cooked and came out right. Edit the structure afterwards and that record no longer applies.

**What is authored is the fact, not the status.** The author records three things: `verified_at` (when it was cooked), `verified_structure_hash` (what the structure was at that moment), and `verification_note` (what was wrong). Nothing else.

**`verification_status` is derived, never stored or authored:**

| Condition | Derived status |
|---|---|
| `verified_structure_hash` is null | `unverified` |
| equals the computed `structure_hash` | `author_verified` |
| differs from the computed `structure_hash` | `unverified` |

Reversion is therefore not enforced — it simply *is*. The derived value changes the instant the structure does, and there is nothing to override because there is no stored field to overwrite. This keeps the validator to rejection-not-correction: it never mutates authored data.

**`structure_hash` is computed, never stored on the record.** It is derivable from the record at any moment, so storing it would violate design rule 3 and create a staleness problem that exists only because of the redundancy. Compute it during validation and at build time. The SQL column is populated by the build, not by the author.

`verified_structure_hash` is different and *is* stored: it records what the structure was at a past moment, which cannot be recomputed from the current record. That is the dividing line — authored data holds facts only the author knows; a hash of the current record is derived, a hash captured last September is history.

**Hashed — the cooking-relevant fields:**

- the full ordered step sequence: `technique_id`, `pattern_id`, `operates_on`, `vessel_id`, `merges_from`, `consumes_slots`, `is_optional`, `condition`, and any overrides
- every slot's `role`, `cardinality`, `is_required` and `quantity_rule_id`
- the archetype's `default_servings` and `scaling_limits`

**Set fields are sorted before hashing.** `consumes_slots` and `merges_from` are sets, not sequences — a step that uses the protein and the fat uses both regardless of listing order. Sort them canonically before hashing so that reordering a list does not read as a cooking change. If addition order ever matters materially, that is two steps, not one ordered list, and this rule should be revisited. Validate that neither list contains duplicates.

`verification_note` requires `verified_at` to be present: it records what happened when the dish was cooked. General uncertainty about an unverified archetype belongs in `authoring_notes`, which exists for exactly that.

**Deliberately excluded:** `description`, `teaching_summary`, `authoring_notes`, `region_note`, `ui_prompt`, `display_name`, and any `impact_note` or `sensory_target` prose. Correcting a typo must not un-verify a dish cooked last week — if prose edits triggered reversion, the rule would be switched off within a fortnight for being tiresome, which is worse than not having it. **Do not widen this list.**

**Also excluded, on a considered decision: `slot.accepts_filter`.** A verification attests that the *skeleton* is sound, not that every slot combination works — it never could, since nine slots with six options each is tens of thousands of permutations and exactly one was cooked. Widening a filter from poultry to poultry and red meat leaves the skeleton unchanged and the cooked version still correct. Slot *structure* is hashed because it changes the skeleton; the option list is not. The real risk here — a poorly suited option being added — belongs to `suitability`, `impact_note` and the cook log.

**Reporting, not failing.** Reverted archetypes are reported at build time, not raised as errors. Editing an archetype is legitimate work, and failing the build for its expected consequence is the kind of rule that gets disabled.

**The report names the archetypes, and does not claim a delta.** Nothing persists between builds, so "reverted since last build" is not computable without a committed build manifest — and a state file that changes on every build buys git noise and merge conflicts for very little. Report what is computable, naming names:

```
1 archetype reverted to unverified:
  ARCH_CURRY_NORTH_INDIAN  (verified 2026-08-12, structure changed since)
14 archetypes never verified
3 archetypes verified against current structure
```

Naming the archetype supplies what a delta would have: if you have just edited the curry and the curry is listed, the cause is obvious. A bare count teaches you to ignore it.

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
  slug              text NOT NULL,         -- bloom_whole_spice; unique within archetype
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

`STEP_` + the archetype's `short_code` + the step's `slug`: `STEP_NIC_BLOOM_WHOLE_SPICE`. Both components are stored fields — `short_code` on `archetype` (2–4 uppercase letters, unique) and `slug` on `archetype_step` (unique within its archetype) — so the ID is fully verifiable rather than only prefix checked. **Never position derived.** Steps get reordered constantly during authoring, and position based IDs would break every reference on each reorder.

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
  "all_tags":     ["fresh"],                // optional: must carry all
  "exclude_tags": ["cured"],                // optional
  "exclude_ids":  ["ING_00219"]             // optional: specific exceptions
}
```

**Tags only — never states.** Per design rule 8, a filter says *which ingredient*, never *what condition it is in*. `raw`, `sealed` and `tender` are states and must not appear here; condition is determined by where a step sits in the sequence, not by the ingredient. Compatibility checking against a technique's `accepts` therefore compares tags alone, and this is correct rather than a limitation to be fixed later: a filter carries no state information because it cannot meaningfully have any.

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

`ARCH_CURRY_NORTH_INDIAN` — `short_code: 'NIC'`, `method_class: 'braise'`. Single vessel throughout.

**On the method class.** There is deliberately no `curry` value. Curry is a dish name, not a process — hundreds of unrelated things carry it. `method_class` describes how heat is applied, and this process is *sear, add liquid, cook slowly covered*, which is the same process as a British beef and ale stew and an Italian ragù despite the three tasting nothing alike. That shared classification is the point: it is what lets the ranker, the effort model and the constraint layer treat structurally similar dishes consistently. What separates the three is the archetype — the step sequence — not the class.

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

**`slots` steps are fully transparent to the walk, mandatory or not.** They are skipped over and never stop it. A step that only introduces new fills leaves accumulated vessel contents exactly as the last `vessel` or `both` step left them, so the condition a later step receives was set earlier in the sequence. This holds by definition: a step that *does* alter existing contents while adding new ones must be labelled `both`, not `slots`.

**`cannot_follow` is scoped to `vessel` targets only**, using the same predecessor set. Deliberately narrow. Most real "you cannot do that after this" constraints are about the *condition* of the food, and the `produces` / `accepts` check already covers those with a clearer failure message. Widening `cannot_follow` to all technique adjacency would encode the same constraints twice in two mechanisms that can disagree. Reserve it for constraints that are genuinely not about condition; if an archetype needs something the narrow form cannot express, that is the evidence for widening it.

Also check: every `merges_from` vessel exists and has at least one prior step; **no step lists its own `vessel_id` in `merges_from`** (an authoring error that currently passes, since the vessel trivially exists); prerequisites satisfied for the user's technique level if level gating is on.

**Verification checks:** `verified_at` and `verified_structure_hash` are both present or both absent. `verification_status` is **derived, never validated as authored input** — it is computed by comparing `verified_structure_hash` against the freshly computed `structure_hash`. Reverted archetypes are counted and reported at build time, not raised as errors. See §3.

**Identity checks:** every `short_code` is unique across archetypes; every step `slug` is unique within its archetype; every step ID equals `STEP_` + its own archetype's `short_code` + its own `slug`.

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