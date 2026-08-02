import { z } from "zod";
import { difficultySchema } from "./recipe";

/**
 * The three-suggestion schema (PRD 9.2).
 *
 * A suggestion is a pitch, not a recipe: cheap to produce, three at a time, and
 * thrown away if none of them appeal. The recipe card is generated only once one
 * has been chosen.
 */

export const suggestionComponentsSchema = z.object({
  protein: z.string().nullable(),
  fat: z.string().nullable(),
  carb: z.string().nullable(),
  veg: z.array(z.string()),
});

export const suggestionSchema = z.object({
  id: z.string(),
  meal_type: z.literal("dinner"),
  title: z.string(),
  /** One sentence. The length cap is enforced locally, not by the model. */
  pitch: z.string().max(140),
  cuisine: z.string(),
  components: suggestionComponentsSchema,
  flavour_layer: z.string().nullable(),
  total_minutes: z.number().int(),
  active_minutes: z.number().int(),
  difficulty: difficultySchema,
  equipment: z.array(z.string()),
  ingredients_not_in_bank: z.array(z.string()),
  /** Ties the suggestion back to their bank or their feedback. */
  why_this: z.string(),
  /**
   * Which of the "needs using up" ingredients this dish actually uses (FR11.3).
   * Empty when nothing was named.
   */
  uses_named_ingredients: z.array(z.string()),
});

export const suggestionsResponseSchema = z.object({
  suggestions: z.array(suggestionSchema),
  /**
   * Set when nothing sensible can be built from what was named (FR11.5). The
   * app says so plainly rather than inventing a dish that does not work.
   */
  infeasible_reason: z.string().nullable(),
  /** The two or three items that would unlock a decent dish. */
  would_unlock: z.array(z.string()),
});

export type Suggestion = z.infer<typeof suggestionSchema>;
export type SuggestionsResponse = z.infer<typeof suggestionsResponseSchema>;

/** Six to eight named flavour layers for the builder (PRD 7.2.5). */
export const flavourOptionSchema = z.object({
  name: z.string(),
  /** "Nam jim: fish sauce, lime, chilli, palm sugar. Sharp and hot." */
  description: z.string(),
});

export const flavoursResponseSchema = z.object({
  flavours: z.array(flavourOptionSchema),
});

export type FlavourOption = z.infer<typeof flavourOptionSchema>;

/**
 * A single option offered for one part of "the plate" (PRD 7.2's builder).
 * `in_bank` is model-reported, the same trust boundary as a recipe
 * ingredient's `in_bank` — the household bank handed to the model already
 * excludes disliked and allergen items, so a truthful model naturally will
 * not offer them back.
 */
export const plateOptionSchema = z.object({
  name: z.string(),
  in_bank: z.boolean(),
});

/**
 * Capped above what the prompt actually asks for (four to six carbs/fats,
 * eight to twelve veg) so a runaway response can't dump an unbounded wall of
 * chips into the builder — a ceiling, not the target count.
 */
export const plateOptionsResponseSchema = z.object({
  carbs: z.array(plateOptionSchema).max(8),
  fats: z.array(plateOptionSchema).max(8),
  veg: z.array(plateOptionSchema).max(14),
});

export type PlateOption = z.infer<typeof plateOptionSchema>;
export type PlateOptionsResponse = z.infer<typeof plateOptionsResponseSchema>;

/**
 * A suggestion needs nothing beyond what was named and what is already in the
 * cupboard. Badged "nothing to buy" and sorted first (FR11.3).
 */
export function needsNothingExtra(suggestion: Suggestion): boolean {
  return suggestion.ingredients_not_in_bank.length === 0;
}
