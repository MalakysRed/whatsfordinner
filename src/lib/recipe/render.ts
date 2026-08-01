import {
  PLACEHOLDER_PATTERN,
  type Recipe,
  type RecipeIngredient,
} from "@/lib/schemas/recipe";

/**
 * Substituting {ing_N} placeholders into step text.
 *
 * This is the client half of the contract the recipe schema sets up: steps carry
 * references, never numbers, and the amount is resolved at render time. That is
 * what will let the servings stepper rescale a whole recipe without another API
 * call, and what keeps the ingredient list and the directions from disagreeing.
 *
 * Scaling and unit conversion are not here yet — they slot in by passing an
 * already-scaled ingredient list to `renderStepText`, which is why this takes
 * ingredients rather than reading them off the recipe.
 */

/**
 * A quantity as it should appear mid-sentence.
 *
 * Deliberately terse: the step says "add {ing_1}", and reading "add 400g
 * chicken thighs" is the point. Amountless ingredients ("salt, to taste") render
 * as just the item.
 */
export function formatQuantity(ingredient: RecipeIngredient): string {
  const { amount, unit, item } = ingredient;

  if (amount === null) return item;

  const rounded = formatAmount(amount);

  // Count words ("clove", "each") read as "2 cloves garlic", not "2 clove garlic".
  if (!unit) return `${rounded} ${item}`;
  if (unit === "each") return `${rounded} ${item}`;

  const spaced = /^(g|kg|ml|l)$/i.test(unit) ? "" : " ";
  return `${rounded}${spaced}${unit} ${item}`;
}

/** Trims float noise without pretending to the rounding rules that come later. */
export function formatAmount(amount: number): string {
  if (Number.isInteger(amount)) return String(amount);
  return String(Math.round(amount * 100) / 100);
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
