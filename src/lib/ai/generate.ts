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
import { BATCH_COOKING_INSTRUCTION, wrapUserText } from "./prompts/system";
import type { HouseholdContext } from "./prompts/context";
import {
  findAxesCollisions,
  tokenOverlap,
  type DrawnSeed,
  type EffortBand,
} from "@/lib/generation/variance-engine";
import type { MealType, SeedAxis } from "@/lib/db/types";

interface Caller {
  householdId: string;
  userId: string;
  mealType: MealType;
  context: HouseholdContext;
}

/** A stage-1 category pick — a hard constraint on every downstream call,
 *  generalizing what the single "main ingredient" field used to do to any
 *  of the seed pool's three axes. 0-2 per generation (enforced client-side). */
export interface CategoryPick {
  axis: SeedAxis;
  value: string;
}

/** Also the seed-set size drawn per call — see drawSeedSet in variance-engine.ts. */
export const OPTION_COUNT = 8;

const EFFORT_BAND_TEXT: Record<EffortBand, string> = {
  quick: "around 20 minutes, minimal washing up",
  standard: "45 to 60 minutes, a proper cook",
  project: "an evening, actively enjoyable",
};

const AXIS_LABEL: Record<SeedAxis, string> = {
  cuisine: "CUISINE",
  format: "FORMAT / COOKING METHOD",
  hero: "HERO INGREDIENT",
};

/** Which findAxesCollisions field a pinned seed axis corresponds to — a
 *  hero pin fixes protein, a format pin fixes method, a cuisine pin fixes
 *  itself. Same "good enough" mapping the old mainIngredient→ignoreProtein
 *  shortcut already relied on. */
const AXIS_TO_COLLISION_FIELD: Record<SeedAxis, "protein" | "method" | "cuisine"> = {
  hero: "protein",
  format: "method",
  cuisine: "cuisine",
};

const AXIS_VARY_TEXT: Record<SeedAxis, string> = {
  cuisine:
    "Vary the protein, cooking method and richness instead — eight ways to explore the same cuisine, not eight unrelated dishes.",
  format:
    "Vary the protein, cuisine and richness instead — eight ways to use the same format, not eight unrelated dishes.",
  hero: "Vary the cooking method, cuisine and richness instead — eight ways to take the same ingredient, not eight unrelated dishes. Every direction's hero_ingredients must include it by name, so the household can see it was actually used, not just implied.",
};

/** The heavier, stage-2 "hard constraint on all eight directions" framing. */
function buildPinnedBlockForOptions(pick: CategoryPick): string {
  return `${AXIS_LABEL[pick.axis]} — a hard constraint, not a suggestion:\n${wrapUserText(
    `pinned_${pick.axis}`,
    pick.value,
  )}\n\nEvery one of the eight directions must be built around this. ${AXIS_VARY_TEXT[pick.axis]}`;
}

const AXIS_PIN_TEXT_SINGLE: Record<SeedAxis, string> = {
  cuisine: "This dish must be built around this cuisine.",
  format: "This dish must be built around this format or cooking method.",
  hero: "This dish must be built around this ingredient — it must appear by name.",
};

/** The lighter framing used once a single dish has already been chosen
 *  (stages 3-5) — reinforcement, since the chosen Option already encodes
 *  the pin, not the primary mechanism for applying it. */
function buildPinnedBlockSingle(pick: CategoryPick): string {
  return `${AXIS_LABEL[pick.axis]} — a hard constraint, not a suggestion:\n${wrapUserText(
    `pinned_${pick.axis}`,
    pick.value,
  )}\n\n${AXIS_PIN_TEXT_SINGLE[pick.axis]}`;
}

function joinWithAnd(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/**
 * Whether a pinned hero ingredient shows up in a direction's hero_ingredients
 * — a household that typed "chicken thighs" should still match a hero
 * ingredient of "chicken", so this checks either string containing the other
 * rather than requiring an exact match.
 */
function mentionsIngredient(heroIngredients: string[], pinnedHero: string): boolean {
  const needle = pinnedHero.trim().toLowerCase();
  if (!needle) return true;

  return heroIngredients.some((hero) => {
    const hay = hero.trim().toLowerCase();
    return hay.includes(needle) || needle.includes(hay);
  });
}

// ---------------------------------------------------------------------------
// Stage 2 — eight lightweight options
// ---------------------------------------------------------------------------

export interface OptionsInput {
  effortBand: EffortBand;
  /** Pinned by the household at stage 1 — 0-2 entries, each a hard
   *  constraint on all eight directions. Replaces the old single
   *  mainIngredient field, generalized to any seed-pool axis. */
  categoryPicks: CategoryPick[];
  /** Free text from stage 1, "anything to use up?" — a soft preference. */
  needsUsingUp?: string | null;
  /** Stage-1 toggle — biases every generation call toward dishes that
   *  freeze and reheat well. */
  batchCooking?: boolean | null;
  /** Directions already rejected this session, not to be repeated. */
  avoidDirections?: string[] | null;
  /** Drawn by the caller from seed_pool via variance-engine.drawSeedSet. */
  seeds: DrawnSeed[];
  /** The just-shown eight directions, present only on a "Refresh" call. */
  previousDirections?: string[] | null;
}

function buildOptionsRequestBlock(input: OptionsInput): string {
  const parts: string[] = [`EFFORT BAND: ${EFFORT_BAND_TEXT[input.effortBand]}`];

  if (input.batchCooking) {
    parts.push(BATCH_COOKING_INSTRUCTION);
  }

  for (const pick of input.categoryPicks) {
    parts.push(buildPinnedBlockForOptions(pick));
  }

  if (input.needsUsingUp?.trim()) {
    parts.push(
      `ANYTHING TO USE UP — a soft preference, not a hard constraint. Favour it where it fits naturally, but do not force every direction to use it. Report which named items each direction genuinely uses in uses_named_ingredients:\n${wrapUserText(
        "needs_using_up",
        input.needsUsingUp,
      )}`,
    );
  }

  if (input.seeds.length > 0) {
    parts.push(
      `SEEDS — one loose starting point per direction, in the same order the directions will appear: seed 1 is a starting point for your first direction, seed 2 for your second, and so on. Each just anchors an idea — a cuisine, a format, a hero ingredient — not a locked recipe; invent the flavour, texture and richness yourself, and the set still needs to differ across the axes below.\n${input.seeds
        .map((s, i) => `${i + 1}. ${s.axis}: ${s.name}`)
        .join("\n")}`,
    );
  }

  if (input.avoidDirections?.length) {
    parts.push(
      `ALREADY REJECTED — do not offer these again or near-variants of them:\n${input.avoidDirections
        .map((t) => `- ${t}`)
        .join("\n")}`,
    );
  }

  const ignoredFields = new Set(input.categoryPicks.map((p) => AXIS_TO_COLLISION_FIELD[p.axis]));
  const axisWords: Record<"protein" | "method" | "cuisine", string> = {
    protein: "protein",
    method: "cooking method",
    cuisine: "cuisine region",
  };
  const diversityAxes = joinWithAnd(
    (["protein", "method", "cuisine"] as const)
      .filter((f) => !ignoredFields.has(f))
      .map((f) => axisWords[f])
      .concat("richness"),
  );

  parts.push(
    `Produce exactly ${OPTION_COUNT} short, punchy directions to explore — not finished dishes and not a title. Each is a mood-board note: a short "direction" phrase (max 80 characters, a single line with no commas — e.g. "Charred and citrus-bright", not "Charred, citrus-bright chicken with herb yoghurt"), 2-4 flavour descriptors, 2-4 texture descriptors, 2-5 potential hero ingredients that could anchor it — not locked in yet — a one-line description in 14 words or fewer, and a distinguishing_note: one sentence on how this direction differs from the other seven in the set. They must differ from one another across ${diversityAxes}.`,
  );

  return parts.join("\n\n");
}

/** Eight directions (stage 2). "Refresh" is this same function with `previousDirections` set. */
export async function generateOptionSummaries(caller: Caller, input: OptionsInput) {
  const requestBlock = buildOptionsRequestBlock(input);
  const previousDirections = input.previousDirections ?? [];
  const heroPick = input.categoryPicks.find((p) => p.axis === "hero");
  const cuisinePick = input.categoryPicks.find((p) => p.axis === "cuisine");

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
          return `"${option.direction}" contains a declared allergen (${describeHits(hits)}). Every option must avoid these entirely.`;
        }
      }

      const withCommas = response.options.filter((o) => o.direction.includes(","));
      if (withCommas.length > 0) {
        return `these directions contain commas, which makes them read like a finished dish rather than a short mood-board phrase: ${withCommas
          .map((o) => `"${o.direction}"`)
          .join(", ")}. Rewrite each as a single comma-free phrase.`;
      }

      if (heroPick) {
        const missing = response.options.filter(
          (option) => !mentionsIngredient(option.hero_ingredients, heroPick.value),
        );
        if (missing.length > 0) {
          return `these directions do not name the hero ingredient in hero_ingredients: ${missing
            .map((o) => `"${o.direction}"`)
            .join(", ")}. Every direction must include it by name so the household can see it was honoured.`;
        }
      }

      if (cuisinePick) {
        // Soft check only — cuisine phrasing varies too much between a seed
        // name and the model's own wording to fail the retry loop over it.
        const mismatched = response.options.filter(
          (o) =>
            !o.cuisine.toLowerCase().includes(cuisinePick.value.toLowerCase()) &&
            !cuisinePick.value.toLowerCase().includes(o.cuisine.toLowerCase()),
        );
        if (mismatched.length > 0) {
          console.warn(
            `[generation:options] cuisine pin "${cuisinePick.value}" didn't literally match option.cuisine on: ${mismatched.map((o) => o.cuisine).join(", ")}`,
          );
        }
      }

      const collisions = findAxesCollisions(
        response.options.map((o) => o.axes),
        { ignoreAxes: input.categoryPicks.map((p) => AXIS_TO_COLLISION_FIELD[p.axis]) },
      );
      if (collisions.length > 0) {
        const directions = collisions[0]
          .map((i) => `"${response.options[i].direction}"`)
          .join(" and ");
        return `${directions} are too similar. Every option must differ from the others across the required axes.`;
      }

      if (previousDirections.length > 0) {
        const duplicates = response.options
          .map((o) => o.direction)
          .filter((direction) =>
            previousDirections.some((prev) => tokenOverlap(direction, prev) > 0.5),
          );
        if (duplicates.length > 0) {
          return `these directions are too close to the previous set: ${duplicates.join(
            ", ",
          )}. Produce genuinely different directions, not renamed variants.`;
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
  categoryPicks?: CategoryPick[] | null;
  needsUsingUp?: string | null;
  batchCooking?: boolean | null;
}

export async function generateDishComponents(caller: Caller, input: DishComponentsInput) {
  const { option } = input;

  const parts = [
    `The household picked this direction:

Direction: ${option.direction}
Cuisine: ${option.cuisine}
Flavours: ${option.flavours.join(", ")}
Textures: ${option.textures.join(", ")}
Hero ingredients: ${option.hero_ingredients.join(", ")}
Roughly ${option.effort_minutes} minutes.`,

    ...(input.categoryPicks ?? []).map((pick) => buildPinnedBlockSingle(pick)),

    input.needsUsingUp?.trim()
      ? `ANYTHING TO USE UP: ${wrapUserText("needs_using_up", input.needsUsingUp)}`
      : null,

    input.batchCooking ? BATCH_COOKING_INSTRUCTION : null,

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
// Stage 4 — up to three richer variations, informed by the stage-3 tailoring
// ---------------------------------------------------------------------------

export interface DishVariationsInput {
  option: Option;
  /** Slot → chosen value from stage 3. May be empty or partial. */
  componentSelections?: Record<string, string> | null;
  categoryPicks?: CategoryPick[] | null;
  needsUsingUp?: string | null;
  batchCooking?: boolean | null;
}

export async function generateDishVariations(caller: Caller, input: DishVariationsInput) {
  const { option, componentSelections } = input;
  const hasSelections = componentSelections && Object.keys(componentSelections).length > 0;

  const parts = [
    `Write up to three richer variations of this direction the household picked:

Direction: ${option.direction}
Cuisine: ${option.cuisine}
Flavours: ${option.flavours.join(", ")}
Textures: ${option.textures.join(", ")}
Hero ingredients: ${option.hero_ingredients.join(", ")}
Roughly ${option.effort_minutes} minutes.`,

    hasSelections
      ? `THE HOUSEHOLD CHOSE:\n${Object.entries(componentSelections!)
          .map(([slot, value]) => `- ${slot}: ${value}`)
          .join("\n")}\n\nEvery variation must genuinely reflect these choices, not just mention them in passing.`
      : "The household did not pick specific components — use your judgement for what suits the dish best.",

    ...(input.categoryPicks ?? []).map((pick) => buildPinnedBlockSingle(pick)),

    input.needsUsingUp?.trim()
      ? `ANYTHING TO USE UP: ${wrapUserText(
          "needs_using_up",
          input.needsUsingUp,
        )}\n\nReport which of these each variation genuinely uses in uses_named_ingredients.`
      : null,

    input.batchCooking ? BATCH_COOKING_INSTRUCTION : null,

    `Produce between one and three richer variations — default to three, but produce fewer when the tailoring choices above have already locked in enough of the dish (the sauce, the sides, the format) that a further genuinely different take isn't honest. Do not pad to three with near-duplicates described differently: for example, a beef lasagne where the béchamel, sides and format are already fixed by the household's choices might only support one or two real variations, not three. They should feel like genuine alternatives on this one dish — different balances of hero ingredient, different flavour emphasis — not near-identical rewrites of the same sentence. Each needs a title, a one-line description, its hero ingredients, and a short list of flavour descriptors (e.g. "smoky", "sharp", "sweet-heat"). If you return more than one variation, give each a distinguishing_note: one sentence on how it differs from the other variation(s) in the set. If you return exactly one, set distinguishing_note to null — there is nothing to compare it against.`,
  ]
    .filter(Boolean)
    .join("\n\n");

  const { data, generationId } = await runGeneration({
    ...caller,
    type: "dish_variations",
    requestBlock: parts,
    schema: refinedOptionsResponseSchema,
    validate: (response) => {
      const n = response.options.length;
      if (n < 1 || n > 3) {
        return `you returned ${n} variations but between 1 and 3 were required.`;
      }

      if (n === 1 && response.options[0].distinguishing_note !== null) {
        return "with only one variation, distinguishing_note has nothing to compare against — set it to null.";
      }
      if (n > 1 && response.options.some((o) => !o.distinguishing_note?.trim())) {
        return "every variation needs a distinguishing_note explaining how it differs from the others, since more than one was returned.";
      }

      for (const variation of response.options) {
        const hits = checkRefinedOptionForAllergens(variation, caller.context.allergens);
        if (hits.length > 0) {
          return `"${variation.title}" contains a declared allergen (${describeHits(hits)}). Every variation must avoid these entirely.`;
        }
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
    categoryPicks?: CategoryPick[] | null;
    needsUsingUp?: string | null;
    batchCooking?: boolean | null;
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

    `If this dish freezes well, set freezing_notes to a short, practical note covering how to freeze it and how to defrost/reheat it — in the same register as make_ahead and leftovers. If it does not freeze well (built around fresh salad, an emulsified or cream sauce that splits, a fried or battered coating that goes soggy), set freezing_notes to null rather than forcing an unhelpful note.`,
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

  for (const pick of input.categoryPicks ?? []) {
    parts.push(buildPinnedBlockSingle(pick));
  }

  if (input.needsUsingUp?.trim()) {
    parts.push(`ANYTHING TO USE UP: ${wrapUserText("needs_using_up", input.needsUsingUp)}`);
  }

  if (input.batchCooking) {
    parts.push(BATCH_COOKING_INSTRUCTION);
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
