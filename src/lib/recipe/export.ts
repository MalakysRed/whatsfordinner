import { formatMinutes, formatQuantity, renderStepText } from "./render";
import type { Recipe } from "@/lib/schemas/recipe";

/**
 * Plain markdown, at the recipe's base servings — the immutable artefact, not
 * whatever the card happens to be scaled to when the button is pressed.
 * Reuses the same placeholder substitution the card renders with, so the
 * export can never disagree with what's on screen.
 */
export function recipeToMarkdown(recipe: Recipe): string {
  const lines: string[] = [`# ${recipe.title}`, ""];

  if (recipe.description) lines.push(recipe.description, "");

  lines.push(
    `*${recipe.cuisine} · serves ${recipe.base_servings} · ${formatMinutes(
      recipe.total_minutes,
    )} total, ${formatMinutes(recipe.active_minutes)} hands on · ${recipe.difficulty}*`,
    "",
  );

  if (recipe.equipment.length > 0) {
    lines.push("## You will need", "", recipe.equipment.join(", "), "");
  }

  lines.push("## Ingredients", "");
  for (const ingredient of recipe.ingredients) {
    const prep = ingredient.prep ? `, ${ingredient.prep}` : "";
    const optional = ingredient.optional ? " (optional)" : "";
    lines.push(`- ${formatQuantity(ingredient)}${prep}${optional}`);
  }
  lines.push("");

  lines.push("## Method", "");
  recipe.steps.forEach((step, i) => {
    lines.push(`${i + 1}. ${renderStepText(step.text, recipe.ingredients)}`);
  });
  lines.push("");

  if (recipe.serving_suggestion) {
    lines.push("## To serve", "", recipe.serving_suggestion, "");
  }

  if (recipe.make_ahead) lines.push(`**Ahead of time:** ${recipe.make_ahead}`, "");
  if (recipe.leftovers) lines.push(`**Leftovers:** ${recipe.leftovers}`, "");

  return lines.join("\n");
}

/** Downloads the markdown via a client-side blob — no server round trip. */
export function downloadRecipeMarkdown(recipe: Recipe): void {
  const markdown = recipeToMarkdown(recipe);
  const blob = new Blob([markdown], { type: "text/markdown" });
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;
  link.download = `${recipe.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase() || "recipe"}.md`;
  link.click();

  URL.revokeObjectURL(url);
}
