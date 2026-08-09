import { z } from "zod";
import {
  archetypeIdSchema,
  attentionLevelSchema,
  authoredIdSchema,
  durationModelSchema,
  heatLevelSchema,
  patternIdSchema,
  slugSchema,
  techniqueIdSchema,
} from "./common";

/**
 * `archetype_step` — SPEC.md §4. The ordered operation sequence.
 */

/** e.g. `{ "slot": "souring_agent", "filled": true }`. */
export const stepConditionSchema = z.object({
  slot: slugSchema,
  filled: z.boolean(),
});

export const archetypeStepSchema = z
  .object({
    id: authoredIdSchema,
    archetype_id: archetypeIdSchema,
    /** 1-based. `UNIQUE (archetype_id, position)` is checked in `validate.ts`. */
    position: z.number().int().min(1),

    technique_id: techniqueIdSchema.optional(),
    pattern_id: patternIdSchema.optional(),

    /** Why this step exists. Teaching content, not a restatement of the action. */
    purpose: z.string().min(1),

    /**
     * Slot *slugs*, scoped to this step's archetype — SPEC.md §6 lists these as
     * `whole_spice`, `aromatic_base` and so on, not `SLOT_` identifiers.
     */
    consumes_slots: z.array(slugSchema).default([]),

    is_optional: z.boolean().default(false),
    condition: stepConditionSchema.optional(),

    heat_override: heatLevelSchema.optional(),
    duration_override: durationModelSchema.optional(),
    attention_override: attentionLevelSchema.optional(),

    /** What it should look or smell like when done. */
    sensory_target: z.string().min(1),

    /**
     * Other step IDs in the same archetype. This is what lets coordination load
     * be computed honestly — the maximum number of concurrently active steps —
     * rather than guessed.
     */
    can_run_parallel_with: z.array(authoredIdSchema).default([]),
  })
  .refine(
    (s) =>
      Number(s.technique_id !== undefined) + Number(s.pattern_id !== undefined) === 1,
    {
      message:
        "exactly one of technique_id or pattern_id must be set (SPEC.md §4: num_nonnulls = 1)",
      path: ["technique_id"],
    },
  );

export type StepCondition = z.infer<typeof stepConditionSchema>;

/** Parsed shape — defaults applied. */
export type ArchetypeStep = z.infer<typeof archetypeStepSchema>;

/** Authoring shape — defaulted fields may be omitted. Use with `satisfies`. */
export type ArchetypeStepInput = z.input<typeof archetypeStepSchema>;
