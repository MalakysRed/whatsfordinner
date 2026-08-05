import { z } from "zod";

/**
 * Stage 4 — up to three richer variations on the one dish picked at stage 2,
 * now informed by whatever the household chose while tailoring it at stage 3.
 * Sonnet at low effort rather than Haiku: these are close enough to a real
 * dish that a cheap model's looseness starts to show, but still cheap
 * relative to the full recipe card that follows.
 *
 * Deliberately not diversity-checked against each other the way the stage-2
 * eight are — the point here is variation on a chosen theme, not genre
 * spread, so all three may reasonably share a cuisine and method.
 *
 * Count is 1-3, not always 3: a dish whose sauce/sides/format are already
 * locked in by stage-3 tailoring may not honestly support three distinct
 * takes, and padding to three produces near-duplicates described
 * differently. `distinguishing_note` does the descriptive work the removed
 * dedup check used to do mechanically — it's required whenever there's more
 * than one variation to compare, and null when there's exactly one.
 */

export const refinedOptionSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  hero_ingredients: z.array(z.string()),
  /** Short descriptors, e.g. ["smoky", "sharp", "sweet-heat"]. */
  flavours: z.array(z.string()),
  cuisine: z.string(),
  effort_minutes: z.number().int(),
  uses_named_ingredients: z.array(z.string()),
  /** How this variation differs from the others in the set. Null iff this
   *  is the only variation returned — nothing to compare it against. */
  distinguishing_note: z.string().max(160).nullable(),
});

export const refinedOptionsResponseSchema = z.object({
  options: z.array(refinedOptionSchema).min(1).max(3),
});

export type RefinedOption = z.infer<typeof refinedOptionSchema>;
export type RefinedOptionsResponse = z.infer<typeof refinedOptionsResponseSchema>;
