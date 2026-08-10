import { z } from "zod";
import {
  adaptationTypeSchema,
  archetypeIdSchema,
  authoringStatusSchema,
  flavourAxesSchema,
  methodClassSchema,
  shortCodeSchema,
  slugSchema,
} from "./common";

/**
 * `archetype` — SPEC.md §3. The dish skeleton, and the highest leverage table
 * in the system: nine slots with a realistic option list generate thousands of
 * coherent dishes from one authored row.
 *
 * `method_class` and `adaptation_type` are shared enums from SPEC.md §0, so they
 * live in `common.ts` and are imported here rather than re-exported —
 * re-exporting would make them ambiguous under the barrel's `export *`.
 *
 * Note what is *not* on this record: `verification_status` (derived) and
 * `structure_hash` (computed). See the verification comment below.
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

    method_class: methodClassSchema,
    cuisine_ids: z.array(z.string()).min(1),
    adaptation_type: adaptationTypeSchema,
    region_note: z.string().optional(),

    /** Authored, shown before slot filling. */
    description: z.string().min(1),
    /** What the user learns by cooking this. */
    teaching_summary: z.string().optional(),

    // Verification. What is authored is the *fact* of having cooked it, not a
    // status: `verification_status` is derived (SPEC.md §3) and so is absent
    // here, and `structure_hash` is computed from the record rather than stored
    // on it — storing a value derivable at any moment would violate design
    // rule 3 and create a staleness problem that exists only because of the
    // redundancy. `verified_structure_hash` is the exception that *is* stored:
    // a hash captured last September is history, not something recomputable.
    /** When it was cooked. */
    verified_at: z.iso.datetime().optional(),
    /** What the structure was at that moment. */
    verified_structure_hash: z.string().min(1).optional(),
    /**
     * What was wrong when it was cooked. Requires `verified_at` — it records
     * what happened during a cook, so it cannot precede one. General
     * uncertainty about an unverified archetype belongs in `authoring_notes`,
     * which exists for exactly that.
     */
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
  })
  // Mirrors the SQL CHECK in SPEC.md §3:
  //   CHECK ((verified_at IS NULL) = (verified_structure_hash IS NULL))
  // Without the date you cannot tell a current verification from a stale one;
  // without the hash you cannot tell whether it still applies. Half a
  // verification record is not a verification.
  .refine(
    (a) =>
      (a.verified_at === undefined) === (a.verified_structure_hash === undefined),
    {
      message:
        "verified_at and verified_structure_hash must both be present or both absent",
      path: ["verified_structure_hash"],
    },
  )
  // CHECK (verification_note IS NULL OR verified_at IS NOT NULL)
  .refine(
    (a) => a.verification_note === undefined || a.verified_at !== undefined,
    {
      message:
        "verification_note requires verified_at — use authoring_notes for an uncooked archetype",
      path: ["verification_note"],
    },
  );

export type EntryAffinities = z.infer<typeof entryAffinitiesSchema>;
export type ScalingLimits = z.infer<typeof scalingLimitsSchema>;

/** Parsed shape — defaults applied. */
export type Archetype = z.infer<typeof archetypeSchema>;

/** Authoring shape — defaulted fields may be omitted. Use with `satisfies`. */
export type ArchetypeInput = z.input<typeof archetypeSchema>;
