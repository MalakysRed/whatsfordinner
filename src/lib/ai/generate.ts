import "server-only";

import {
  findDanglingPlaceholders,
  recipeSchema,
  type Recipe,
} from "@/lib/schemas/recipe";
import {
  flavoursResponseSchema,
  suggestionsResponseSchema,
  needsNothingExtra,
  type Suggestion,
} from "@/lib/schemas/suggestion";
import {
  checkRecipeForAllergens,
  checkSuggestionForAllergens,
  describeHits,
} from "./guardrails/allergen";
import { runGeneration } from "./client";
import { buildRequestBlock, wrapUserText, type BuilderConstraints } from "./prompts/system";
import type { HouseholdContext } from "./prompts/context";
import type { MealType } from "@/lib/db/types";

interface Caller {
  householdId: string;
  userId: string;
  mealType: MealType;
  context: HouseholdContext;
}

/** Six to eight flavour layers for the builder (PRD 7.2.5). */
export async function generateFlavours(
  caller: Caller,
  input: { cuisine?: string | null; components: string[] },
) {
  const described = input.components.filter(Boolean).join(", ");

  const requestBlock = [
    input.cuisine ? `CUISINE: ${input.cuisine}` : null,
    described ? `CHOSEN SO FAR: ${described}` : null,
    "Suggest six to eight flavour layers that would suit this — sauces, dressings, dips, rubs, marinades or pickles. Name each one properly and give one line describing what is in it and what it tastes like, in the style of \"Nam jim: fish sauce, lime, chilli, palm sugar. Sharp and hot.\" Favour ones the household could actually make from their bank.",
  ]
    .filter(Boolean)
    .join("\n\n");

  const { data, generationId } = await runGeneration({
    ...caller,
    type: "flavour",
    requestBlock,
    schema: flavoursResponseSchema,
  });

  return { flavours: data.flavours, generationId };
}

/**
 * Three suggestions.
 *
 * The allergen check runs here as well as on the recipe card — catching it at
 * the suggestion stage saves generating a card that would only be thrown away.
 */
export async function generateSuggestions(
  caller: Caller,
  constraints: BuilderConstraints,
) {
  const requestBlock = buildRequestBlock({
    ...constraints,
    newIdeaSlots: constraints.newIdeaSlots ?? 3,
  });

  const { data, generationId } = await runGeneration({
    ...caller,
    type: "suggestions",
    requestBlock,
    schema: suggestionsResponseSchema,
    validate: (response) => {
      const wanted = constraints.newIdeaSlots ?? 3;

      // An infeasible "needs using up" is a legitimate answer, not a failure —
      // the PRD would rather say so plainly than invent a dish that does not work.
      if (response.infeasible_reason && response.suggestions.length === 0) {
        return null;
      }

      if (response.suggestions.length !== wanted) {
        return `you returned ${response.suggestions.length} suggestions but exactly ${wanted} were required.`;
      }

      for (const suggestion of response.suggestions) {
        const hits = checkSuggestionForAllergens(suggestion, caller.context.allergens);
        if (hits.length > 0) {
          return `"${suggestion.title}" contains a declared allergen (${describeHits(hits)}). Every suggestion must avoid these entirely.`;
        }
      }

      return null;
    },
  });

  // "Nothing to buy" sorts first (FR11.3).
  const suggestions = [...data.suggestions].sort((a, b) => {
    const aClean = needsNothingExtra(a) ? 0 : 1;
    const bClean = needsNothingExtra(b) ? 0 : 1;
    return aClean - bClean;
  });

  return {
    suggestions,
    infeasibleReason: data.infeasible_reason,
    wouldUnlock: data.would_unlock,
    generationId,
  };
}

/**
 * The full recipe card for a chosen suggestion.
 *
 * Two things can reject a card here: an allergen, and a step that references an
 * ingredient id that does not exist. The second matters because the whole
 * scaling design rests on those references resolving — a dangling one renders as
 * literal curly braces in front of someone holding a knife.
 */
export async function generateRecipe(
  caller: Caller,
  input: {
    suggestion: Suggestion;
    servings: number;
    /** Free text from "refresh card" ("too much faff", "make the sauce sharper"). */
    feedback?: string | null;
    /** The card being revised, so the model can improve rather than restart. */
    previous?: Recipe | null;
  },
) {
  const { suggestion, servings } = input;

  const parts = [
    `Write the full recipe for this dish:

Title: ${suggestion.title}
Cuisine: ${suggestion.cuisine}
The pitch was: ${suggestion.pitch}
Flavour layer: ${suggestion.flavour_layer ?? "your choice"}
Roughly ${suggestion.total_minutes} minutes total.

Write it for ${servings} ${servings === 1 ? "person" : "people"} and set base_servings to ${servings}.`,

    `Every quantity mentioned in a step must be written as a placeholder referencing the ingredient's id — {ing_1}, {ing_2} and so on — never as a literal amount. The app substitutes the scaled amount when it renders, so "Toss {ing_1} with {ing_4} and leave for 15 minutes" is right and "Toss 400g chicken with 2 tbsp oil" is wrong. Every id you reference must exist in the ingredients list.

Mark each ingredient's scales value honestly: most things scale linearly, but salt, spices, dried chilli, oil for frying and water for boiling do not — use sublinear or fixed for those.

Set in_bank to false for anything the household does not already have.`,
  ];

  if (input.previous) {
    parts.push(
      `You are revising this recipe rather than starting again. Keep what works:\n\n${JSON.stringify(
        input.previous,
        null,
        2,
      )}`,
    );
  }

  if (input.feedback?.trim()) {
    parts.push(
      `WHAT THEY WANT CHANGED:\n${wrapUserText("feedback", input.feedback)}`,
    );
  }

  const { data, generationId } = await runGeneration({
    ...caller,
    type: "recipe",
    requestBlock: parts.join("\n\n"),
    schema: recipeSchema,
    validate: (recipe) => {
      const hits = checkRecipeForAllergens(recipe, caller.context.allergens);
      if (hits.length > 0) {
        return `this recipe contains a declared allergen (${describeHits(hits)}). It must be avoided entirely, including in garnishes and serving suggestions.`;
      }

      const dangling = findDanglingPlaceholders(recipe);
      if (dangling.length > 0) {
        return `steps reference ingredient ids that do not exist: ${dangling.join(", ")}. Every {ing_N} placeholder must match an id in the ingredients list.`;
      }

      return null;
    },
  });

  return { recipe: data, generationId };
}
