import { z } from "zod";

/**
 * The recipe card schema (PRD 9.3).
 *
 * Used twice: converted to a JSON schema for Anthropic's structured outputs, and
 * as the parser for the response before it reaches the client. The SDK strips
 * constraints that JSON Schema cannot express (string lengths, numeric ranges)
 * from what it sends to Claude and enforces them locally instead — which is
 * exactly the split the PRD asks for.
 */

export const difficultySchema = z.enum(["easy", "medium", "involved"]);

export const componentSchema = z.enum([
  "protein",
  "fat",
  "carb",
  "veg",
  "fruit",
  "aromatic",
  "pantry",
  "flavour_layer",
]);

/**
 * How an ingredient responds to scaling.
 *
 * Salt, spices, frying oil and boiling water do not double when the servings
 * double — sublinear applies a square-root damping, fixed does not move at all.
 */
export const scalesSchema = z.enum(["linear", "sublinear", "fixed"]);

export const recipeIngredientSchema = z.object({
  /** Referenced from step text as {ing_1}. */
  id: z.string(),
  item: z.string(),
  amount: z.number().nullable(),
  /** Canonical metric base units (g, ml) or a count word like "clove". */
  unit: z.string().nullable(),
  prep: z.string().nullable(),
  component: componentSchema,
  scales: scalesSchema,
  optional: z.boolean(),
  in_bank: z.boolean(),
});

export const recipeStepSchema = z.object({
  n: z.number().int(),
  /**
   * Quantities appear as {ing_N} placeholders, never as literal numbers. The
   * client substitutes the scaled, unit-converted amount at render time — this
   * is what makes the servings stepper work without a second API call.
   */
  text: z.string(),
  duration_seconds: z.number().int().nullable(),
  temperature_c: z.number().nullable(),
});

export const recipeSchema = z.object({
  title: z.string(),
  meal_type: z.literal("dinner"),
  description: z.string(),
  cuisine: z.string(),
  base_servings: z.number().int().min(1).max(12),
  total_minutes: z.number().int(),
  active_minutes: z.number().int(),
  difficulty: difficultySchema,
  equipment: z.array(z.string()),
  ingredients: z.array(recipeIngredientSchema).min(1),
  steps: z.array(recipeStepSchema).min(1),
  serving_suggestion: z.string(),
  make_ahead: z.string().nullable(),
  leftovers: z.string().nullable(),
});

export type Recipe = z.infer<typeof recipeSchema>;
export type RecipeIngredient = z.infer<typeof recipeIngredientSchema>;
export type RecipeStep = z.infer<typeof recipeStepSchema>;

/** Matches {ing_1}, {ing_12} etc. in step text. */
export const PLACEHOLDER_PATTERN = /\{([a-z0-9_]+)\}/gi;

export function referencedIngredientIds(text: string): string[] {
  return Array.from(text.matchAll(PLACEHOLDER_PATTERN), (m) => m[1]);
}

/**
 * Checks that every {ing_N} in every step resolves to a real ingredient.
 *
 * A dangling placeholder renders as literal curly braces in a kitchen, so a
 * recipe that has one is malformed and must be regenerated rather than shown.
 * This lives outside the Zod schema deliberately: a cross-field rule cannot be
 * expressed in JSON Schema, and keeping it separate lets the caller distinguish
 * "the model returned the wrong shape" from "the model returned a broken
 * reference" and retry accordingly.
 */
export function findDanglingPlaceholders(recipe: Recipe): string[] {
  const known = new Set(recipe.ingredients.map((i) => i.id));
  const dangling = new Set<string>();

  for (const step of recipe.steps) {
    for (const id of referencedIngredientIds(step.text)) {
      if (!known.has(id)) dangling.add(id);
    }
  }

  return Array.from(dangling);
}

/** Ingredients never mentioned by any step. Not fatal, but worth surfacing. */
export function findUnreferencedIngredients(recipe: Recipe): string[] {
  const referenced = new Set(
    recipe.steps.flatMap((step) => referencedIngredientIds(step.text)),
  );

  return recipe.ingredients
    .filter((i) => !referenced.has(i.id))
    .map((i) => i.id);
}
