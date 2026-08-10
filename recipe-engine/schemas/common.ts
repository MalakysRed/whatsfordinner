import { z } from "zod";

/**
 * Shared enums and nested object shapes, per SPEC.md §0 and the `jsonb`
 * payloads defined alongside each table.
 *
 * SPEC.md is the schema authority. Where a field is `jsonb` in the SQL and the
 * spec gives a worked example but no exhaustive field list, the shape here
 * follows the example and marks everything the example does not prove mandatory
 * as optional. Where the spec gives no example at all, the value stays
 * deliberately permissive rather than inventing a structure.
 */

/* -------------------------------------------------------------------------- */
/* Identifiers                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * IDs are uppercase, carry a type prefix and are permanent once created
 * (root `CLAUDE.md`). Enforcing the prefix in the schema is what stops a
 * technique ID being pasted into a slot reference — the resulting dangling
 * reference would otherwise only surface in `validate.ts`.
 */
function prefixedId(prefix: string) {
  return z
    .string()
    .regex(
      new RegExp(`^${prefix}_[A-Z0-9]+(?:_[A-Z0-9]+)*$`),
      `must be an uppercase ${prefix}_ identifier, e.g. ${prefix}_EXAMPLE`,
    );
}

export const techniqueIdSchema = prefixedId("TECH");
export const patternIdSchema = prefixedId("PAT");
export const archetypeIdSchema = prefixedId("ARCH");
export const ingredientIdSchema = prefixedId("ING");
export const slotIdSchema = prefixedId("SLOT");
export const slotOptionIdSchema = prefixedId("OPT");
export const quantityRuleIdSchema = prefixedId("RULE");

/**
 * `STEP_` + archetype short code + slug, e.g. `STEP_NIC_BLOOM_WHOLE_SPICE`.
 *
 * The trailing-digits rejection enforces SPEC.md §4's "never position derived":
 * steps get reordered constantly while authoring, and a position-based ID would
 * break every reference on each reorder. It is a heuristic — it catches
 * `STEP_NIC_4`, not a slug that merely happens to end in a number.
 *
 * The `<ARCHCODE>` segment is not checked against the archetype, because no
 * short-code column exists on `archetype` to check it against.
 */
export const stepIdSchema = prefixedId("STEP").refine(
  (id) => !/_\d+$/.test(id),
  "step IDs must not be position derived (SPEC.md §4)",
);

/** Lowercase snake_case, matching the `slug` columns and slot slugs. */
export const slugSchema = z
  .string()
  .regex(/^[a-z0-9]+(?:_[a-z0-9]+)*$/, "must be lowercase snake_case");

/**
 * Stream identifier, e.g. `main`, `tarka`. Chaining is validated within a
 * vessel rather than globally (SPEC.md §4).
 */
export const vesselIdSchema = slugSchema;

/* -------------------------------------------------------------------------- */
/* Enums — SPEC.md §0                                                          */
/* -------------------------------------------------------------------------- */

export const heatLevelSchema = z.enum([
  "none",
  "low",
  "medium_low",
  "medium",
  "medium_high",
  "high",
  "very_high",
]);

export const attentionLevelSchema = z.enum([
  "unattended",
  "periodic",
  "frequent",
  "constant",
]);

export const techniqueCategorySchema = z.enum([
  "knife",
  "prep",
  "heat_dry",
  "heat_moist",
  "heat_fat",
  "emulsify",
  "leaven",
  "ferment",
  "combine",
  "finish",
  "rest",
  "assembly",
]);

export const typicalitySchema = z.enum([
  "traditional",
  "regional_traditional",
  "common",
  "modern",
  "unconventional",
]);

export const authoringStatusSchema = z.enum([
  "draft",
  "review",
  "published",
  "deprecated",
]);

export const slotCardinalitySchema = z.enum([
  "exactly_one",
  "one_to_three",
  "zero_to_three",
  "one_to_many",
]);

/**
 * What a step's technique acts on, and therefore which validation applies
 * (SPEC.md §4). This is what stops "sear raw protein after reducing a sauce"
 * being reported as a state mismatch when it is correct cooking.
 */
export const operatesOnSchema = z.enum([
  /** Acts on the accumulated contents of `vessel_id`. Chain-checked. */
  "vessel",
  /** Acts only on newly introduced fills. No chain check. */
  "slots",
  /** New fills joined to existing contents. No chain check. */
  "both",
]);

export const verificationStatusSchema = z.enum([
  /** Authored from research, never cooked. */
  "unverified",
  /** Cooked by the author, result was right. */
  "author_verified",
  /** Cook log cleared the confidence threshold. */
  "community_verified",
]);

/**
 * Strict by design (SPEC.md §0): adding a value should mean a genuinely new
 * structural category, not a dish that did not fit.
 */
export const dishClassSchema = z.enum([
  "braise",
  "stew",
  "roast",
  "traybake",
  "pan_sauce",
  "fry",
  "deep_fry",
  "stir_fry",
  "soup",
  "bake",
  "pasta",
  "rice",
  "flatbread",
  "pastry",
  "grill",
  "salad",
  "no_cook",
]);

export const adaptationTypeSchema = z.enum([
  "traditional",
  "regional_traditional",
  "diaspora",
  "restaurant_style",
  "western_adaptation",
  "fusion",
]);

export const slotRoleSchema = z.enum([
  "main",
  "aromatic",
  "spice",
  "fat",
  "acid",
  "liquid",
  "starch",
  "garnish",
  "pantry",
]);

/* -------------------------------------------------------------------------- */
/* Flavour axes — SPEC.md §3                                                   */
/* -------------------------------------------------------------------------- */

/** The six axes, in the order SPEC.md lists them. */
export const FLAVOUR_AXES = [
  "heat",
  "acid",
  "sweet",
  "umami",
  "richness",
  "aromatic",
] as const;

const axisValue = z.number().int().min(0).max(10);

/** Absolute axis values, 0–10. Every axis is required on an archetype. */
export const flavourAxesSchema = z.object({
  heat: axisValue,
  acid: axisValue,
  sweet: axisValue,
  umami: axisValue,
  richness: axisValue,
  aromatic: axisValue,
});

/**
 * Signed deltas applied by a slot option. Partial — an option states only the
 * axes it moves — and signed, since options routinely pull an axis down.
 */
export const flavourDeltaSchema = z.object({
  heat: z.number().int().min(-10).max(10).optional(),
  acid: z.number().int().min(-10).max(10).optional(),
  sweet: z.number().int().min(-10).max(10).optional(),
  umami: z.number().int().min(-10).max(10).optional(),
  richness: z.number().int().min(-10).max(10).optional(),
  aromatic: z.number().int().min(-10).max(10).optional(),
});

/* -------------------------------------------------------------------------- */
/* Execution contract — SPEC.md §1 `accepts` / `produces`                      */
/* -------------------------------------------------------------------------- */

/**
 * The input filter. An empty array means unconstrained on that dimension,
 * matching the convention SPEC.md states for `can_follow` ("empty =
 * unconstrained"); `validate.ts` relies on this for the sequencing check.
 */
export const acceptsSchema = z.object({
  ingredient_tags: z.array(z.string()).default([]),
  states: z.array(z.string()).default([]),
  forms: z.array(z.string()).default([]),
  min_count: z.number().int().min(0).optional(),
});

/**
 * The ontology query defining a slot's valid options (SPEC.md §5).
 *
 * Tag matching only — no query language, no DSL, no parser. `any_tags` is the
 * one required arm: it is what actually selects candidates, and a filter with
 * only exclusions would admit the entire ontology.
 */
export const acceptsFilterSchema = z.object({
  /** Must carry at least one of these. */
  any_tags: z.array(z.string()).min(1),
  /** Optional: must carry all of these. */
  all_tags: z.array(z.string()).default([]),
  /** Optional: must carry none of these. */
  exclude_tags: z.array(z.string()).default([]),
  /** Optional: specific ingredient exceptions. */
  exclude_ids: z.array(ingredientIdSchema).default([]),
});

/** Output state colour, per the inline comment in SPEC.md §1. */
export const producesColourSchema = z.enum([
  "none",
  "pale_gold",
  "golden",
  "browned",
  "dark",
]);

/**
 * The output state. `state` is required because it is the field the
 * produces → accepts sequencing check reads; the rest are optional so a draft
 * technique can be written before its prose is settled.
 */
export const producesSchema = z.object({
  state: z.string().min(1),
  colour: producesColourSchema.optional(),
  moisture: z.string().optional(),
  notes: z.string().optional(),
});

/* -------------------------------------------------------------------------- */
/* Duration — SPEC.md §1 `duration_model`                                      */
/* -------------------------------------------------------------------------- */

/**
 * "Durations are models, not constants" (SPEC.md design rule 2). There is
 * deliberately no plain `seconds` field — a fixed number cannot be scaled by
 * mass, so the schema does not offer one.
 */
export const durationModelSchema = z
  .object({
    base_seconds: z.number().int().min(0),
    per_100g_seconds: z.number().min(0).optional(),
    min_seconds: z.number().int().min(0).optional(),
    max_seconds: z.number().int().min(0).optional(),
    /** Which slot's mass drives scaling, e.g. `slot:aromatic_base`. */
    scales_with: z.string().optional(),
    /** Multipliers, e.g. `{ vessel_crowded: 1.4, lid_on: 0.75 }`. */
    modifiers: z.record(z.string(), z.number().positive()).optional(),
  })
  .refine(
    (d) =>
      d.min_seconds === undefined ||
      d.max_seconds === undefined ||
      d.min_seconds <= d.max_seconds,
    { message: "min_seconds must not exceed max_seconds", path: ["min_seconds"] },
  );

/* -------------------------------------------------------------------------- */
/* Recognition and recovery — SPEC.md §1                                       */
/* -------------------------------------------------------------------------- */

/** Ordered, because the cues occur in sequence. */
export const sensoryCueAtSchema = z.enum([
  "start",
  "midway",
  "done",
  "overdone",
]);

/**
 * SPEC.md's worked cues use sound/sight/smell. `touch` and `taste` are included
 * to complete the five senses — a structural choice, not a culinary one.
 */
export const sensorySenseSchema = z.enum([
  "sight",
  "sound",
  "smell",
  "touch",
  "taste",
]);

export const sensoryCueSchema = z.object({
  at: sensoryCueAtSchema,
  sense: sensorySenseSchema,
  cue: z.string().min(1),
});

export const failureSeveritySchema = z.enum([
  "recoverable",
  "degrades_dish",
  "start_again",
]);

export const failureModeSchema = z.object({
  symptom: z.string().min(1),
  cause: z.string().min(1),
  prevention: z.string().min(1),
  recovery: z.string().min(1),
  severity: failureSeveritySchema,
});

/* -------------------------------------------------------------------------- */
/* Inferred types                                                              */
/* -------------------------------------------------------------------------- */

export type HeatLevel = z.infer<typeof heatLevelSchema>;
export type AttentionLevel = z.infer<typeof attentionLevelSchema>;
export type TechniqueCategory = z.infer<typeof techniqueCategorySchema>;
export type Typicality = z.infer<typeof typicalitySchema>;
export type AuthoringStatus = z.infer<typeof authoringStatusSchema>;
export type SlotCardinality = z.infer<typeof slotCardinalitySchema>;
export type OperatesOn = z.infer<typeof operatesOnSchema>;
export type VerificationStatus = z.infer<typeof verificationStatusSchema>;
export type DishClass = z.infer<typeof dishClassSchema>;
export type AdaptationType = z.infer<typeof adaptationTypeSchema>;
export type SlotRole = z.infer<typeof slotRoleSchema>;
export type FlavourAxis = (typeof FLAVOUR_AXES)[number];
export type FlavourAxes = z.infer<typeof flavourAxesSchema>;
export type FlavourDelta = z.infer<typeof flavourDeltaSchema>;
export type Accepts = z.infer<typeof acceptsSchema>;
export type AcceptsFilter = z.infer<typeof acceptsFilterSchema>;
export type Produces = z.infer<typeof producesSchema>;
export type ProducesColour = z.infer<typeof producesColourSchema>;
export type DurationModel = z.infer<typeof durationModelSchema>;
export type SensoryCue = z.infer<typeof sensoryCueSchema>;
export type FailureMode = z.infer<typeof failureModeSchema>;
