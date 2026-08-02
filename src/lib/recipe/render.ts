import {
  PLACEHOLDER_PATTERN,
  type Recipe,
  type RecipeIngredient,
} from "@/lib/schemas/recipe";
import { roundForDisplay } from "./scale";

/**
 * Substituting {ing_N} placeholders into step text.
 *
 * This is the client half of the contract the recipe schema sets up: steps carry
 * references, never numbers, and the amount is resolved at render time. That is
 * what lets the servings stepper rescale a whole recipe without another API
 * call, and what keeps the ingredient list and the directions from disagreeing.
 *
 * Scaling and unit conversion happen before this file ever sees the ingredient
 * list — the caller passes an already-scaled, already-unit-converted list (see
 * `scale.ts`), which is why every function here takes ingredients as a
 * parameter rather than reading them off `recipe` directly.
 */

/**
 * A quantity as it should appear mid-sentence.
 *
 * Deliberately terse: the step says "add {ing_1}", and reading "add 400g
 * chicken thighs" is the point. Amountless ingredients ("salt, to taste") render
 * as just the item. The amount+unit text itself is `roundForDisplay`'s job —
 * this function only adds the item name on top.
 */
export function formatQuantity(ingredient: RecipeIngredient): string {
  const { amount, unit, item } = ingredient;

  if (amount === null) return item;

  return `${roundForDisplay(amount, unit)} ${item}`;
}

/**
 * Replaces every {ing_N} with its quantity.
 *
 * An unknown reference is left as the literal placeholder rather than silently
 * dropped — the schema check should have rejected the card before it ever got
 * here, and a visible `{ing_9}` in a step is a bug report, whereas a quietly
 * missing ingredient is a ruined dinner.
 */
export function renderStepText(
  text: string,
  ingredients: RecipeIngredient[],
): string {
  const byId = new Map(ingredients.map((i) => [i.id, i]));

  return text.replace(PLACEHOLDER_PATTERN, (match, id: string) => {
    const ingredient = byId.get(id);
    return ingredient ? formatQuantity(ingredient) : match;
  });
}

/** Every step with its placeholders resolved. */
export function renderSteps(recipe: Recipe): string[] {
  return recipe.steps.map((step) => renderStepText(step.text, recipe.ingredients));
}

/** "1 hr 20 min", "45 min". */
export function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} hr` : `${hours} hr ${rest} min`;
}
