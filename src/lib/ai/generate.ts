import "server-only";

import {
  findDanglingPlaceholders,
  recipeSchema,
  type Recipe,
} from "@/lib/schemas/recipe";
import { optionsResponseSchema, type Option } from "@/lib/schemas/option";
import {
  dishComponentsResponseSchema,
  type ComponentSlot,
} from "@/lib/schemas/dish-components";
import {
  refinedOptionsResponseSchema,
  type RefinedOption,
} from "@/lib/schemas/dish-variations";
import {
  checkDishComponentsForAllergens,
  checkOptionForAllergens,
  checkRecipeForAllergens,
  checkRefinedOptionForAllergens,
  describeHits,
} from "./guardrails/allergen";
import { runGeneration } from "./client";
import { wrapUserText } from "./prompts/system";
import type { HouseholdContext } from "./prompts/context";
import {
  findAxesCollisions,
  tokenOverlap,
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
const VARIATION_COUNT = 3;

const EFFORT_BAND_TEXT: Record<EffortBand, string> = {
  quick: "around 20 minutes, minimal washing up",
  standard: "45 to 60 minutes, a proper cook",
  project: "an evening, actively enjoyable",
};

// ---------------------------------------------------------------------------
// Stage 2 — six lightweight options
// ---------------------------------------------------------------------------

export interface OptionsInput {
  effortBand: EffortBand;
  /** Pinned by the user at stage 1 — a hard constraint, not a nudge: every
   *  option is built around it, varying method/cuisine/richness instead. */
  mainIngredient?: string | null;
  /** Free text from stage 1, "anything to use up?" — a soft preference. */
  needsUsingUp?: string | null;
  /** Titles already rejected this session, not to be repeated. */
  avoidTitles?: string[] | null;
  /** Permanent "not this" reactions from previous sessions (spec §5.4). */
  excludedAxes: { axis: string; value: string }[];
  /** Drawn by the caller from seed_pool via variance-engine.drawSeeds. */
  seeds: DrawnSeed[];
  /** The just-shown six titles, present only on a "Refresh" call. */
  previousTitles?: string[] | null;
}

function buildOptionsRequestBlock(input: OptionsInput): string {
  const parts: string[] = [`EFFORT BAND: ${EFFORT_BAND_TEXT[input.effortBand]}`];

  if (input.mainIngredient?.trim()) {
    parts.push(
      `MAIN INGREDIENT — a hard constraint, not a suggestion:\n${wrapUserText(
        "main_ingredient",
        input.mainIngredient,
      )}\n\nEvery one of the six options must be built around this. Vary the cooking method, cuisine and richness instead — six ways to cook the same ingredient, not six unrelated dishes.`,
    );
  }

  if (input.needsUsingUp?.trim()) {
    parts.push(
      `ANYTHING TO USE UP — a soft preference, not a hard constraint. Favour it where it fits naturally, but do not force every option to use it. Report which named items each option genuinely uses in uses_named_ingredients:\n${wrapUserText(
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

  if (input.avoidTitles?.length) {
    parts.push(
      `ALREADY REJECTED — do not offer these again or near-variants of them:\n${input.avoidTitles
        .map((t) => `- ${t}`)
        .join("\n")}`,
    );
  }

  const diversityAxes = input.mainIngredient?.trim()
    ? "method, cuisine region and richness"
    : "protein, cooking method, cuisine region and richness";

  parts.push(
    `Produce exactly ${OPTION_COUNT} options. They must differ from one another across ${diversityAxes}.`,
  );

  return parts.join("\n\n");
}

/** Six options (stage 2). "Refresh" is this same function with `previousTitles` set. */
export async function generateOptionSummaries(caller: Caller, input: OptionsInput) {
  const requestBlock = buildOptionsRequestBlock(input);
  const previousTitles = input.previousTitles ?? [];

  const { data, generationId } = await runGeneration({
    ...caller,
    type: "options",
    requestBlock,
    // Read back by the route to exclude these seeds from the household's
    // next three generations — see client.ts's requestMeta doc.
    requestMeta: { seeds: input.seeds.map((s) => s.name) },
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

      const collisions = findAxesCollisions(
        response.options.map((o) => o.axes),
        { ignoreProtein: Boolean(input.mainIngredient?.trim()) },
      );
      if (collisions.length > 0) {
        const titles = collisions[0].map((i) => `"${response.options[i].title}"`).join(" and ");
        return `${titles} are too similar. Every option must differ from the others across the required axes.`;
      }

      if (previousTitles.length > 0) {
        const duplicates = response.options
          .map((o) => o.title)
          .filter((title) => previousTitles.some((prev) => tokenOverlap(title, prev) > 0.5));
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

// ---------------------------------------------------------------------------
// Stage 3 — tailoring: component slots for the one dish picked at stage 2
// ---------------------------------------------------------------------------

export interface DishComponentsInput {
  option: Option;
  mainIngredient?: string | null;
  needsUsingUp?: string | null;
  /** Present when called as the "refresh the rest to match" follow-up. */
  locked?: { slot: string; value: string } | null;
}

export async function generateDishComponents(caller: Caller, input: DishComponentsInput) {
  const { option } = input;

  const parts = [
    `The household picked this dish:

Title: ${option.title}
Cuisine: ${option.cuisine}
Description: ${option.description}
Roughly ${option.effort_minutes} minutes.`,

    input.mainIngredient?.trim()
      ? `MAIN INGREDIENT: ${wrapUserText("main_ingredient", input.mainIngredient)}`
      : null,

    input.needsUsingUp?.trim()
      ? `ANYTHING TO USE UP: ${wrapUserText("needs_using_up", input.needsUsingUp)}`
      : null,

    input.locked
      ? `The household has already chosen "${input.locked.value}" for the ${input.locked.slot} slot. Suggest the remaining slots to genuinely pair with that choice, and repeat the ${input.locked.slot} slot unchanged with that as its only option.`
      : null,

    `Suggest two to five slots that are genuinely worth choosing between for this specific dish — vegetables, a hero herb or spice, a sauce/dressing/gravy, or whatever else actually varies it. Not every dish needs every kind of slot; only include what applies to this one. For each slot, give two to six named options with a short note on why each works or what it pairs with. Every option must still be true to the dish above, not turn it into a different dish.`,
  ]
    .filter(Boolean)
    .join("\n\n");

  const { data, generationId } = await runGeneration({
    ...caller,
    type: "dish_components",
    requestBlock: parts,
    schema: dishComponentsResponseSchema,
    validate: (response) => {
      const hits = checkDishComponentsForAllergens(response, caller.context.allergens);
      if (hits.length > 0) {
        return `these suggestions contain a declared allergen (${describeHits(hits)}). Every option in every slot must avoid these entirely.`;
      }
      return null;
    },
  });

  return { slots: data.slots as ComponentSlot[], generationId };
}

// ---------------------------------------------------------------------------
// Stage 4 — three richer variations, informed by the stage-3 tailoring
// ---------------------------------------------------------------------------

export interface DishVariationsInput {
  option: Option;
  /** Slot → chosen value from stage 3. May be empty or partial. */
  componentSelections?: Record<string, string> | null;
  mainIngredient?: string | null;
  needsUsingUp?: string | null;
}

/** Pairwise near-duplicate check among a small set — used for the three variations,
 *  which are meant to vary on a theme but not repeat each other outright. */
function findPairwiseDuplicates(titles: string[], threshold = 0.5): [number, number][] {
  const pairs: [number, number][] = [];
  for (let i = 0; i < titles.length; i++) {
    for (let j = i + 1; j < titles.length; j++) {
      if (tokenOverlap(titles[i], titles[j]) > threshold || tokenOverlap(titles[j], titles[i]) > threshold) {
        pairs.push([i, j]);
      }
    }
  }
  return pairs;
}

export async function generateDishVariations(caller: Caller, input: DishVariationsInput) {
  const { option, componentSelections } = input;
  const hasSelections = componentSelections && Object.keys(componentSelections).length > 0;

  const parts = [
    `Write three richer variations of this dish the household picked:

Title: ${option.title}
Cuisine: ${option.cuisine}
Description: ${option.description}
Roughly ${option.effort_minutes} minutes.`,

    hasSelections
      ? `THE HOUSEHOLD CHOSE:\n${Object.entries(componentSelections!)
          .map(([slot, value]) => `- ${slot}: ${value}`)
          .join("\n")}\n\nEvery variation must genuinely reflect these choices, not just mention them in passing.`
      : "The household did not pick specific components — use your judgement for what suits the dish best.",

    input.mainIngredient?.trim()
      ? `MAIN INGREDIENT: ${wrapUserText("main_ingredient", input.mainIngredient)}`
      : null,

    input.needsUsingUp?.trim()
      ? `ANYTHING TO USE UP: ${wrapUserText(
          "needs_using_up",
          input.needsUsingUp,
        )}\n\nReport which of these each variation genuinely uses in uses_named_ingredients.`
      : null,

    `Produce exactly three variations. They should feel like genuine alternatives on this one dish — different balances of hero ingredient, different flavour emphasis — not three near-identical rewrites of the same sentence. Each needs a title, a one-line description, its hero ingredients, and a short list of flavour descriptors (e.g. "smoky", "sharp", "sweet-heat").`,
  ]
    .filter(Boolean)
    .join("\n\n");

  const { data, generationId } = await runGeneration({
    ...caller,
    type: "dish_variations",
    requestBlock: parts,
    schema: refinedOptionsResponseSchema,
    validate: (response) => {
      if (response.options.length !== VARIATION_COUNT) {
        return `you returned ${response.options.length} variations but exactly ${VARIATION_COUNT} were required.`;
      }

      for (const variation of response.options) {
        const hits = checkRefinedOptionForAllergens(variation, caller.context.allergens);
        if (hits.length > 0) {
          return `"${variation.title}" contains a declared allergen (${describeHits(hits)}). Every variation must avoid these entirely.`;
        }
      }

      const duplicates = findPairwiseDuplicates(response.options.map((o) => o.title));
      if (duplicates.length > 0) {
        const [i, j] = duplicates[0];
        return `"${response.options[i].title}" and "${response.options[j].title}" are too close to each other. Produce three genuinely different variations, not near-identical rewrites.`;
      }

      return null;
    },
  });

  return { options: data.options, generationId };
}

// ---------------------------------------------------------------------------
// Stage 5 — the full recipe card, for the chosen variation
// ---------------------------------------------------------------------------

export async function generateRecipe(
  caller: Caller,
  input: {
    option: RefinedOption;
    /** The stage-3 choices that shaped the chosen variation, carried through
     *  so the recipe actually uses them rather than re-deciding. */
    componentSelections?: Record<string, string> | null;
    mainIngredient?: string | null;
    needsUsingUp?: string | null;
    servings: number;
    /** The card being revised at a new serving count, so the model can adjust rather than restart. */
    previous?: Recipe | null;
  },
) {
  const { option, servings } = input;

  const parts = [
    `Write the full recipe for this dish:

Title: ${option.title}
Cuisine: ${option.cuisine}
Description: ${option.description}
Hero ingredients: ${option.hero_ingredients.join(", ")}
Flavours: ${option.flavours.join(", ")}
Roughly ${option.effort_minutes} minutes.

Write it for ${servings} ${servings === 1 ? "person" : "people"} and set base_servings to ${servings}.`,

    `Every quantity mentioned in a step must be written as a placeholder referencing the ingredient's id — {ing_1}, {ing_2} and so on — never as a literal amount. The app substitutes the scaled amount when it renders, so "Toss {ing_1} with {ing_4} and leave for 15 minutes" is right and "Toss 400g chicken with 2 tbsp oil" is wrong. Every id you reference must exist in the ingredients list.

Mark each ingredient's scales value honestly: most things scale linearly, but salt, spices, dried chilli, oil for frying and water for boiling do not — use sublinear or fixed for those.`,
  ];

  if (input.componentSelections && Object.keys(input.componentSelections).length > 0) {
    parts.push(
      `CHOSEN COMPONENTS — the household picked these while tailoring the dish; the recipe must actually use them:\n${Object.entries(
        input.componentSelections,
      )
        .map(([slot, value]) => `- ${slot}: ${value}`)
        .join("\n")}`,
    );
  }

  if (input.mainIngredient?.trim()) {
    parts.push(`MAIN INGREDIENT: ${wrapUserText("main_ingredient", input.mainIngredient)}`);
  }

  if (input.needsUsingUp?.trim()) {
    parts.push(`ANYTHING TO USE UP: ${wrapUserText("needs_using_up", input.needsUsingUp)}`);
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
