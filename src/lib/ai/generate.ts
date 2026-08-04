import "server-only";

import {
  findDanglingPlaceholders,
  recipeSchema,
  type Recipe,
} from "@/lib/schemas/recipe";
import { optionsResponseSchema, type Option } from "@/lib/schemas/option";
import {
  checkOptionForAllergens,
  checkRecipeForAllergens,
  describeHits,
} from "./guardrails/allergen";
import { runGeneration } from "./client";
import { wrapUserText } from "./prompts/system";
import type { HouseholdContext } from "./prompts/context";
import {
  findAxesCollisions,
  findDuplicateTitles,
  type DrawnSeed,
  type EffortBand,
} from "@/lib/generation/variance-engine";
import type { MealType } from "@/lib/db/types";

interface Caller {
  householdId: string;
  userId: string;
  mealType: MealType;
  context: HouseholdContext;
}

const OPTION_COUNT = 6;

const EFFORT_BAND_TEXT: Record<EffortBand, string> = {
  quick: "around 20 minutes, minimal washing up",
  standard: "45 to 60 minutes, a proper cook",
  project: "an evening, actively enjoyable",
};

export interface OptionsInput {
  effortBand: EffortBand;
  /** Free text from stage 1, "anything to use up?" — a soft preference. */
  needsUsingUp?: string | null;
  /** Titles already rejected this session, not to be repeated. */
  avoidTitles?: string[] | null;
  /** Permanent "not this" reactions from previous sessions (spec §5.4). */
  excludedAxes: { axis: string; value: string }[];
  /** Permanent "more like this" reactions from previous sessions. */
  preferredAxes: { axis: string; value: string }[];
  /** Drawn by the caller from seed_pool via variance-engine.drawSeeds. */
  seeds: DrawnSeed[];
}

function buildOptionsRequestBlock(input: OptionsInput): string {
  const parts: string[] = [`EFFORT BAND: ${EFFORT_BAND_TEXT[input.effortBand]}`];

  if (input.needsUsingUp?.trim()) {
    parts.push(
      `ANYTHING TO USE UP — a soft preference, not a hard constraint. Favour it where it fits naturally, but do not force every option to use it:\n${wrapUserText(
        "needs_using_up",
        input.needsUsingUp,
      )}`,
    );
  }

  if (input.seeds.length > 0) {
    parts.push(
      `SEEDS — inspiration for AT MOST TWO of the six options, not all of them:\n${input.seeds
        .map((s) => `- ${s.axis}: ${s.name}`)
        .join("\n")}`,
    );
  }

  if (input.excludedAxes.length > 0) {
    parts.push(
      `PERMANENTLY EXCLUDED — the household has said "not this" before; never offer these again:\n${input.excludedAxes
        .map((e) => `- ${e.axis}: ${e.value}`)
        .join("\n")}`,
    );
  }

  if (input.preferredAxes.length > 0) {
    parts.push(
      `PERMANENTLY PREFERRED — the household has said "more like this" before; weight toward these when it genuinely fits:\n${input.preferredAxes
        .map((e) => `- ${e.axis}: ${e.value}`)
        .join("\n")}`,
    );
  }

  if (input.avoidTitles?.length) {
    parts.push(
      `ALREADY REJECTED THIS SESSION — do not offer these again or near-variants of them:\n${input.avoidTitles
        .map((t) => `- ${t}`)
        .join("\n")}`,
    );
  }

  parts.push(
    `Produce exactly ${OPTION_COUNT} options. They must differ from one another across protein, cooking method, cuisine region and richness — no two may share the same combination of protein, method and cuisine. Do not let the seeds above constrain more than two of the six.`,
  );

  return parts.join("\n\n");
}

async function runOptionsCall(
  caller: Caller,
  type: "options" | "options_refine",
  requestBlock: string,
  previousTitles: string[],
  seeds: DrawnSeed[] = [],
) {
  const { data, generationId } = await runGeneration({
    ...caller,
    type,
    requestBlock,
    // Read back by variance-engine's caller to exclude these from the
    // household's next three generations — see client.ts's requestMeta doc.
    requestMeta: { seeds: seeds.map((s) => s.name) },
    schema: optionsResponseSchema,
    validate: (response) => {
      if (response.options.length !== OPTION_COUNT) {
        return `you returned ${response.options.length} options but exactly ${OPTION_COUNT} were required.`;
      }

      for (const option of response.options) {
        const hits = checkOptionForAllergens(option, caller.context.allergens);
        if (hits.length > 0) {
          return `"${option.title}" contains a declared allergen (${describeHits(hits)}). Every option must avoid these entirely.`;
        }
      }

      const collisions = findAxesCollisions(response.options.map((o) => o.axes));
      if (collisions.length > 0) {
        const titles = collisions[0].map((i) => `"${response.options[i].title}"`).join(" and ");
        return `${titles} share the same protein, method and cuisine. Every option must differ from the others across at least one of those three.`;
      }

      if (previousTitles.length > 0) {
        const duplicates = findDuplicateTitles(
          response.options.map((o) => o.title),
          previousTitles,
        );
        if (duplicates.length > 0) {
          return `these titles are too close to the previous set: ${duplicates.join(
            ", ",
          )}. Produce genuinely different dishes, not renamed variants.`;
        }
      }

      return null;
    },
  });

  return { options: data.options, generationId };
}

/** Six options (feature spec §5.3), Call 1: fresh generation. */
export async function generateOptions(caller: Caller, input: OptionsInput) {
  return runOptionsCall(caller, "options", buildOptionsRequestBlock(input), [], input.seeds);
}

/**
 * Call 2: refinement. Same cheap model, same diversity and exclusion rules,
 * but instructed to preserve whatever the household reacted to and vary
 * everything else, and forbidden from repeating the previous set's titles
 * (spec §5.5).
 */
export async function refineOptions(
  caller: Caller,
  input: OptionsInput & { reaction: string; previousTitles: string[] },
) {
  const base = buildOptionsRequestBlock(input);
  const requestBlock = `${base}\n\nREFINEMENT — the household reacted to the previous set:\n${wrapUserText(
    "reaction",
    input.reaction,
  )}\nPreserve whatever attribute they responded to and vary everything else. Do not repeat any of these previous titles:\n${input.previousTitles
    .map((t) => `- ${t}`)
    .join("\n")}`;

  return runOptionsCall(caller, "options_refine", requestBlock, input.previousTitles, input.seeds);
}

/**
 * The full recipe card for a committed option (feature spec §7.2).
 *
 * Two things can reject a card here: an allergen, and a step that references
 * an ingredient id that does not exist. The second matters because the whole
 * scaling design rests on those references resolving — a dangling one renders
 * as literal curly braces in front of someone holding a knife.
 */
export async function generateRecipe(
  caller: Caller,
  input: {
    option: Option;
    servings: number;
    /** Chosen values from the option's own `swaps` array, keyed by slot. */
    swapSelections?: Record<string, string> | null;
    /** The card being revised at a new serving count, so the model can adjust rather than restart. */
    previous?: Recipe | null;
  },
) {
  const { option, servings } = input;

  const parts = [
    `Write the full recipe for this dish:

Title: ${option.title}
Cuisine: ${option.axes.cuisine}
The description was: ${option.description}
Roughly ${option.effort_minutes} minutes.

Write it for ${servings} ${servings === 1 ? "person" : "people"} and set base_servings to ${servings}.`,

    `Every quantity mentioned in a step must be written as a placeholder referencing the ingredient's id — {ing_1}, {ing_2} and so on — never as a literal amount. The app substitutes the scaled amount when it renders, so "Toss {ing_1} with {ing_4} and leave for 15 minutes" is right and "Toss 400g chicken with 2 tbsp oil" is wrong. Every id you reference must exist in the ingredients list.

Mark each ingredient's scales value honestly: most things scale linearly, but salt, spices, dried chilli, oil for frying and water for boiling do not — use sublinear or fixed for those.`,
  ];

  if (input.swapSelections && Object.keys(input.swapSelections).length > 0) {
    parts.push(
      `SWAPS CHOSEN — the household picked these from the pre-validated substitutions for this dish; use them instead of the default:\n${Object.entries(
        input.swapSelections,
      )
        .map(([slot, value]) => `- ${slot}: ${value}`)
        .join("\n")}`,
    );
  }

  if (input.previous) {
    parts.push(
      `You are revising this recipe at a new serving count rather than starting again. Keep what works:\n\n${JSON.stringify(
        input.previous,
      )}`,
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
