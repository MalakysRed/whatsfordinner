import { z } from "zod";
import {
  archetypeIdSchema,
  attentionLevelSchema,
  durationModelSchema,
  heatLevelSchema,
  operatesOnSchema,
  patternIdSchema,
  slugSchema,
  stepIdSchema,
  techniqueIdSchema,
  vesselIdSchema,
} from "./common";

/**
 * `archetype_step` — SPEC.md §4. The ordered operation sequence.
 *
 * A step does not always transform the previous step's output: some act on the
 * accumulated pan contents, some introduce new ingredients and act only on
 * those, some do both. `operates_on` is what records the difference, and
 * `vessel_id` partitions the sequence into streams so chaining is validated
 * within a stream rather than globally.
 */

/** e.g. `{ "slot": "souring_agent", "filled": true }`. */
export const stepConditionSchema = z.object({
  slot: slugSchema,
  filled: z.boolean(),
});

export const archetypeStepSchema = z
  .object({
    id: stepIdSchema,
    archetype_id: archetypeIdSchema,
    /**
     * Unique within the archetype. Together with the archetype's `short_code`
     * this composes `id` — `STEP_` + `NIC` + `BLOOM_WHOLE_SPICE` — so the ID is
     * fully verifiable rather than only prefix checked.
     */
    slug: slugSchema,
    /** 1-based. `UNIQUE (archetype_id, position)` is checked in `validate.ts`. */
    position: z.number().int().min(1),

    technique_id: techniqueIdSchema.optional(),
    pattern_id: patternIdSchema.optional(),

    /** Why this step exists. Teaching content, not a restatement of the action. */
    purpose: z.string().min(1),

    /**
     * Slot *slugs*, scoped to this archetype — a slot exists only inside its
     * archetype, so local references use slugs (SPEC.md design rule 6).
     */
    consumes_slots: z.array(slugSchema).default([]),

    /** What the technique acts on, and therefore which validation applies. */
    operates_on: operatesOnSchema,

    /** Stream partitioning. Chaining is validated within a vessel. */
    vessel_id: vesselIdSchema.default("main"),
    /** Vessel IDs joined into this one at this step. */
    merges_from: z.array(vesselIdSchema).default([]),

    is_optional: z.boolean().default(false),
    condition: stepConditionSchema.optional(),

    heat_override: heatLevelSchema.optional(),
    duration_override: durationModelSchema.optional(),
    attention_override: attentionLevelSchema.optional(),

    /** What it should look or smell like when done. */
    sensory_target: z.string().min(1),
  })
  .refine(
    (s) =>
      Number(s.technique_id !== undefined) + Number(s.pattern_id !== undefined) === 1,
    {
      message:
        "exactly one of technique_id or pattern_id must be set (SPEC.md §4: num_nonnulls = 1)",
      path: ["technique_id"],
    },
  )
  .refine((s) => s.merges_from.length === 0 || s.operates_on === "both", {
    message:
      "a step with non-empty merges_from must have operates_on 'both' (SPEC.md §4)",
    path: ["operates_on"],
  });

export type StepCondition = z.infer<typeof stepConditionSchema>;

/** Parsed shape — defaults applied. */
export type ArchetypeStep = z.infer<typeof archetypeStepSchema>;

/** Authoring shape — defaulted fields may be omitted. Use with `satisfies`. */
export type ArchetypeStepInput = z.input<typeof archetypeStepSchema>;
