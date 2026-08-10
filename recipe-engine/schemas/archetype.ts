import { z } from "zod";
import {
  adaptationTypeSchema,
  archetypeIdSchema,
  authoringStatusSchema,
  dishClassSchema,
  flavourAxesSchema,
  slugSchema,
  verificationStatusSchema,
} from "./common";

/**
 * `archetype` — SPEC.md §3. The dish skeleton, and the highest leverage table
 * in the system: nine slots with a realistic option list generate thousands of
 * coherent dishes from one authored row.
 *
 * `dish_class`, `adaptation_type` and `verification_status` are shared enums
 * from SPEC.md §0, so they live in `common.ts` and are imported here rather
 * than re-exported — re-exporting would make them ambiguous under the barrel's
 * `export *`.
 */

export const scalingLimitsSchema = z
  .object({
    min: z.number().int().min(1),
    max: z.number().int().min(1),
    note: z.string().optional(),
  })
  .refine((s) => s.min <= s.max, {
    message: "min must not exceed max",
    path: ["min"],
  });

/**
 * How the archetype ranks per entry point, so a new door needs no new ranking
 * table. `time_band` and `effort_band` are free strings: SPEC.md shows single
 * example values (`40_70_min`, `moderate`) but never the full vocabulary, and
 * guessing the rest would bake in a wrong set.
 */
export const entryAffinitiesSchema = z.object({
  hero_ingredient_tags: z.array(z.string()).default([]),
  inventory_minimum: z.array(z.string()).default([]),
  time_band: z.string().optional(),
  effort_band: z.string().optional(),
  moods: z.array(z.string()).default([]),
});

export const archetypeSchema = z.object({
  id: archetypeIdSchema,
  slug: slugSchema,
  display_name: z.string().min(1),
  status: authoringStatusSchema.default("draft"),

  dish_class: dishClassSchema,
  cuisine_ids: z.array(z.string()).min(1),
  adaptation_type: adaptationTypeSchema,
  region_note: z.string().optional(),

  /** Authored, shown before slot filling. */
  description: z.string().min(1),
  /** What the user learns by cooking this. */
  teaching_summary: z.string().optional(),

  verification_status: verificationStatusSchema.default("unverified"),
  verified_at: z.iso.datetime().optional(),
  /** What was wrong the first time it was cooked. */
  verification_note: z.string().optional(),

  default_servings: z.number().int().min(1).default(4),
  scalable: z.boolean().default(true),
  scaling_limits: scalingLimitsSchema.optional(),

  /** Before slot fills apply their deltas. */
  base_flavour_axes: flavourAxesSchema,
  required_equipment: z.array(z.string()).default([]),

  entry_affinities: entryAffinitiesSchema,

  /** Your own caveats and regional disputes. */
  authoring_notes: z.string().optional(),
});

export type EntryAffinities = z.infer<typeof entryAffinitiesSchema>;
export type ScalingLimits = z.infer<typeof scalingLimitsSchema>;

/** Parsed shape — defaults applied. */
export type Archetype = z.infer<typeof archetypeSchema>;

/** Authoring shape — defaulted fields may be omitted. Use with `satisfies`. */
export type ArchetypeInput = z.input<typeof archetypeSchema>;
