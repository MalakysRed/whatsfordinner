import { z } from "zod";
import {
  acceptsSchema,
  attentionLevelSchema,
  authoringStatusSchema,
  durationModelSchema,
  failureModeSchema,
  heatLevelSchema,
  producesSchema,
  sensoryCueSchema,
  slugSchema,
  techniqueCategorySchema,
  techniqueIdSchema,
} from "./common";

/**
 * `technique` — SPEC.md §1. The atomic operation; target 150–200 rows.
 *
 * Note what is *not* enforced here. SPEC.md §8 defines a technique as "done"
 * when it carries at least three sensory cues including an overdone cue and at
 * least two failure modes with recovery steps. That is a bar for publishing,
 * not for existing: `draft` rows are explicitly usable in development, so
 * requiring it in the schema would make it impossible to save a technique
 * part-written. It belongs in a status-aware validation check.
 */
export const techniqueSchema = z.object({
  id: techniqueIdSchema,
  slug: slugSchema,
  display_name: z.string().min(1),
  category: techniqueCategorySchema,
  status: authoringStatusSchema.default("draft"),

  // Teaching content
  /** Tooltip copy. SPEC.md caps this at 140 characters. */
  definition_short: z.string().min(1).max(140),
  definition_full: z.string().min(1),
  teaching_note: z.string().optional(),
  common_misconception: z.string().optional(),

  // Execution contract
  accepts: acceptsSchema,
  produces: producesSchema,
  requires_fat: z.boolean().default(false),
  heat: heatLevelSchema,
  vessel_types: z.array(z.string()).min(1),
  /** `null` means either covered or uncovered is fine. */
  covered: z.boolean().nullable().default(null),

  // Timing
  duration_model: durationModelSchema,
  attention: attentionLevelSchema,

  // Difficulty and progression
  difficulty: z.number().int().min(1).max(5),
  failure_sensitivity: z.number().int().min(1).max(5),
  /** Technique DAG. Acyclicity is a validation concern, not a schema one. */
  prerequisite_ids: z.array(techniqueIdSchema).default([]),

  // Sequencing. Empty means unconstrained.
  can_follow: z.array(techniqueIdSchema).default([]),
  can_precede: z.array(techniqueIdSchema).default([]),
  cannot_follow: z.array(techniqueIdSchema).default([]),

  // Recognition and recovery — the part that cannot be derived or scraped.
  sensory_cues: z.array(sensoryCueSchema).default([]),
  failure_modes: z.array(failureModeSchema).default([]),

  /** e.g. `{ fr: "faire suer", it: "soffriggere (dolce)" }`. */
  aliases_by_cuisine: z.record(z.string(), z.string()).default({}),

  /**
   * SPEC.md defines no equipment table and no `EQUIP_` prefix, so these are
   * free strings. `validate.ts` will check them once a registry exists.
   */
  equipment_ids: z.array(z.string()).default([]),
});

/** Parsed shape — defaults applied. Use for anything reading authored data. */
export type Technique = z.infer<typeof techniqueSchema>;

/** Authoring shape — defaulted fields may be omitted. Use with `satisfies`. */
export type TechniqueInput = z.input<typeof techniqueSchema>;
