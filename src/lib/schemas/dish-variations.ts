import { z } from "zod";

/**
 * Stage 4 — three richer variations on the one dish picked at stage 2, now
 * informed by whatever the household chose while tailoring it at stage 3.
 * Sonnet at low effort rather than Haiku: these are close enough to a real
 * dish that a cheap model's looseness starts to show, but still cheap
 * relative to the full recipe card that follows.
 *
 * Deliberately not diversity-checked against each other the way the stage-2
 * eight are — the point here is variation on a chosen theme, not genre
 * spread, so all three may reasonably share a cuisine and method.
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
});

export const refinedOptionsResponseSchema = z.object({
  options: z.array(refinedOptionSchema).length(3),
});

export type RefinedOption = z.infer<typeof refinedOptionSchema>;
export type RefinedOptionsResponse = z.infer<typeof refinedOptionsResponseSchema>;
