import { z } from "zod";
import {
  adaptationTypeSchema,
  archetypeIdSchema,
  authoringStatusSchema,
  dishClassSchema,
  flavourAxesSchema,
  shortCodeSchema,
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

export const archetypeSchema = z
  .object({
    id: archetypeIdSchema,
    slug: slugSchema,
    /** 2–4 uppercase letters, unique across archetypes. Step IDs are built from it. */
    short_code: shortCodeSchema,
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

    /**
     * Hash of the cooking-relevant fields. Derived rather than authored — see
     * `computeStructureHash` in `lib/structure-hash.ts`. Optional here because
     * no author can compute it by hand; when it *is* present, `validate()`
     * checks it against the recomputed value so a stale stored hash is caught.
     */
    structure_hash: z.string().min(1).optional(),
    /** The `structure_hash` at the moment the archetype was verified. */
    verified_structure_hash: z.string().min(1).optional(),

    default_servings: z.number().int().min(1).default(4),
    scalable: z.boolean().default(true),
    scaling_limits: scalingLimitsSchema.optional(),

    /** Before slot fills apply their deltas. */
    base_flavour_axes: flavourAxesSchema,
    required_equipment: z.array(z.string()).default([]),

    entry_affinities: entryAffinitiesSchema,

    /** Your own caveats and regional disputes. */
    authoring_notes: z.string().optional(),
  })
  // Mirrors the two SQL CHECK constraints in SPEC.md §3. Without the date you
  // cannot tell a current verification from a stale one; without the hash you
  // cannot tell whether it still applies.
  .refine(
    (a) => a.verification_status === "unverified" || a.verified_at !== undefined,
    {
      message: "verified_at is required unless verification_status is 'unverified'",
      path: ["verified_at"],
    },
  )
  .refine(
    (a) =>
      a.verification_status === "unverified" ||
      a.verified_structure_hash !== undefined,
    {
      message:
        "verified_structure_hash is required unless verification_status is 'unverified'",
      path: ["verified_structure_hash"],
    },
  );

export type EntryAffinities = z.infer<typeof entryAffinitiesSchema>;
export type ScalingLimits = z.infer<typeof scalingLimitsSchema>;

/** Parsed shape — defaults applied. */
export type Archetype = z.infer<typeof archetypeSchema>;

/** Authoring shape — defaulted fields may be omitted. Use with `satisfies`. */
export type ArchetypeInput = z.input<typeof archetypeSchema>;
