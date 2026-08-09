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

  dish_class          text NOT NULL,       -- curry | braise | stir_fry | soup | bake | pasta | salad | roast
  cuisine_ids         text[] NOT NULL,
  adaptation_type     text NOT NULL,       -- traditional | regional_traditional | diaspora | restaurant_style | western_adaptation
  region_note         text,

  description         text NOT NULL,       -- authored, shown before slot filling
  teaching_summary    text,                -- what the user learns by cooking this

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

```sql
CREATE TABLE archetype_step (
  id                text PRIMARY KEY,
  archetype_id      text NOT NULL REFERENCES archetype(id) ON DELETE CASCADE,
  position          smallint NOT NULL,

  technique_id      text REFERENCES technique(id),
  pattern_id        text REFERENCES pattern(id),
  CHECK (num_nonnulls(technique_id, pattern_id) = 1),

  purpose           text NOT NULL,        -- why this step exists; teaching content
  consumes_slots    text[] NOT NULL DEFAULT '{}',

  is_optional       boolean NOT NULL DEFAULT false,
  condition         jsonb,                -- e.g. {"slot":"souring_agent","filled":true}

  heat_override     heat_level,
  duration_override jsonb,
  attention_override attention_level,
  sensory_target    text NOT NULL,        -- what it should look/smell like when done
  can_run_parallel_with text[] NOT NULL DEFAULT '{}',   -- drives coordination load

  UNIQUE (archetype_id, position)
);
```

`can_run_parallel_with` is what lets you compute the coordination load axis honestly rather than guessing: count the maximum number of concurrently active steps.

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

  role              text NOT NULL,         -- main | aromatic | spice | fat | acid | liquid | garnish | pantry
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

`ARCH_CURRY_NORTH_INDIAN`

| Pos | Technique / Pattern | Slots consumed | Sensory target | Optional |
|---|---|---|---|---|
| 1 | TECH_BLOOM_WHOLE_SPICE | whole_spice, cooking_fat | Seeds popping, fragrant, not dark | yes |
| 2 | TECH_SWEAT then TECH_FRY_AROMATIC | aromatic_base | Deep gold, jammy, no raw smell | no |
| 3 | TECH_FRY_PASTE | ginger_garlic | Fat separating at the edges | no |
| 4 | TECH_BLOOM_GROUND_SPICE | ground_spice | 30 seconds only, fragrant, never dark | no |
| 5 | TECH_REDUCE | souring_agent | Thick, fat pooling | yes (cond: souring_agent filled) |
| 6 | TECH_SEAR / TECH_ADD | hero_protein | Coated and sealed | no |
| 7 | TECH_SIMMER | liquid | Sauce clings to a spoon | no |
| 8 | TECH_FINISH | finishing_dairy, finishing_herb | Glossy, fresh smelling | yes |

**Slots:** `whole_spice` (0–3), `aromatic_base` (exactly one), `ginger_garlic` (exactly one), `ground_spice` (1–3), `souring_agent` (0–1), `hero_protein` (exactly one), `liquid` (exactly one), `finishing_dairy` (0–1), `finishing_herb` (0–1).

Nine slots, with a realistic option list per slot, generates thousands of coherent distinct dishes from one archetype — all of them structurally sound, because the skeleton is authored rather than invented per request.

---

## 7. Validation rules

Enforced in code at generation time. Rejection, not correction.

**Referential:** every ID emitted by the model exists; every slot_option belongs to the slot it fills; required slots are filled; cardinality respected; no conflicting options co-selected.

**Sequencing:** each step's `produces` satisfies the next step's `accepts`; no `cannot_follow` violation; prerequisites satisfied for the user's technique level if level gating is on.

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
