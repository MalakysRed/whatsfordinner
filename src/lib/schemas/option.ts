import { z } from "zod";

/**
 * The six-option schema (feature spec §5.3).
 *
 * An option is a pitch, not a recipe: cheap to produce, six at a time, reacted
 * to rather than specified. The recipe card is generated only once one has
 * been committed to.
 */

export const richnessSchema = z.enum(["light", "medium", "rich"]);

export const optionAxesSchema = z.object({
  protein: z.string(),
  method: z.string(),
  cuisine: z.string(),
  richness: richnessSchema,
});

export const optionSwapSchema = z.object({
  slot: z.string(),
  safe_options: z.array(z.string()),
  /** Why these work and what to avoid — shown as helper text under the stage-3 dropdown. */
  note: z.string(),
});

export const optionSchema = z.object({
  id: z.string(),
  title: z.string(),
  /** One line, appetising, no jargon. */
  description: z.string(),
  effort_minutes: z.number().int(),
  key_ingredients: z.array(z.string()),
  axes: optionAxesSchema,
  /**
   * Generated at invention time, not later — the model that invented the dish
   * knows what survives in it. Powers the stage-3 dropdowns with no separate
   * validation call.
   */
  swaps: z.array(optionSwapSchema),
  /** Canonical glossary terms this dish will require. Used to filter by proficiency. */
  techniques: z.array(z.string()),
  max_technique_tier: z.number().int().min(1).max(3),
  /** Reserved for deferred difficulty scoring (spec §9) — always null in this phase. */
  difficulty_score: z.null(),
});

export const optionsResponseSchema = z.object({
  options: z.array(optionSchema),
});

export type Richness = z.infer<typeof richnessSchema>;
export type OptionAxes = z.infer<typeof optionAxesSchema>;
export type OptionSwap = z.infer<typeof optionSwapSchema>;
export type Option = z.infer<typeof optionSchema>;
export type OptionsResponse = z.infer<typeof optionsResponseSchema>;
