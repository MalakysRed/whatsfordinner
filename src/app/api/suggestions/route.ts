import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { generateSuggestions } from "@/lib/ai/generate";
import { prepareGeneration, toErrorResponse } from "@/lib/api/handler";
import { planSuggestionSlots, recencyCutoff } from "@/lib/generation/quota";
import { countEligibleRepeats, fetchEligibleRepeats } from "@/lib/generation/eligible-repeats";
import { needsNothingExtra, type Suggestion } from "@/lib/schemas/suggestion";
import { createClient } from "@/lib/supabase/server";
import type { Recipe } from "@/lib/schemas/recipe";

const bodySchema = z.object({
  needs_using_up: z.string().max(500).nullish(),
  cuisine: z.string().max(80).nullish(),
  taste_profile: z.array(z.string().max(40)).max(8).nullish(),
  protein: z.string().max(80).nullish(),
  fat: z.string().max(80).nullish(),
  carb: z.string().max(80).nullish(),
  veg: z.array(z.string().max(80)).max(10).nullish(),
  flavour_layers: z.array(z.string().max(120)).max(2).nullish(),
  time_limit: z.number().int().min(5).max(240).nullish(),
  servings: z.number().int().min(1).max(12).nullish(),
  batch_cooking: z.boolean().nullish(),
  /** Free text from the refresh box. Treated as data, never as instruction. */
  feedback: z.string().max(500).nullish(),
  /** Titles rejected this session. */
  avoid_titles: z.array(z.string().max(200)).max(30).nullish(),
});

/**
 * A suggestion that may point at a saved recipe instead of something Claude
 * just wrote. `from_book` is a response-envelope addition, not part of the
 * structured-output schema sent to Claude — the model has no business filling
 * this in, so it is only ever attached here, after generation.
 */
interface SuggestionWithBook extends Suggestion {
  from_book: { recipe_id: string; payload: Recipe } | null;
}

/** Reshapes a saved recipe into the suggestion card shape (FR2.9). */
function suggestionFromRecipe(id: string, recipe: Recipe): SuggestionWithBook {
  const firstOfComponent = (name: string) =>
    recipe.ingredients.find((i) => i.component === name)?.item ?? null;

  const veg = recipe.ingredients
    .filter((i) => i.component === "veg" || i.component === "fruit")
    .map((i) => i.item);

  const flavourLayerItems = recipe.ingredients
    .filter((i) => i.component === "flavour_layer")
    .map((i) => i.item);

  const pitch =
    recipe.description.length > 140
      ? `${recipe.description.slice(0, 137)}...`
      : recipe.description;

  return {
    id,
    meal_type: "dinner",
    title: recipe.title,
    pitch,
    cuisine: recipe.cuisine,
    components: {
      protein: firstOfComponent("protein"),
      fat: firstOfComponent("fat"),
      carb: firstOfComponent("carb"),
      veg,
    },
    flavour_layer: flavourLayerItems.length ? flavourLayerItems.join(" + ") : null,
    total_minutes: recipe.total_minutes,
    difficulty: recipe.difficulty,
    ingredients_not_in_bank: recipe.ingredients.filter((i) => !i.in_bank).map((i) => i.item),
    uses_named_ingredients: [],
    from_book: { recipe_id: id, payload: recipe },
  };
}

export async function POST(request: NextRequest) {
  const prepared = await prepareGeneration();
  if (!prepared.ok) return prepared.response;

  const { caller } = prepared;

  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const body = parsed.data;
  const supabase = await createClient();
  const cutoff = recencyCutoff(caller.settings.recency_window_days);

  // How many of the three slots may hold something from the book, versus how
  // many must be genuinely new ideas (FR2.8).
  const eligibleRepeatCount = await countEligibleRepeats(
    supabase,
    caller.householdId,
    caller.mealType,
    cutoff,
    caller.settings.include_favourites,
  );

  const plan = planSuggestionSlots({
    variety: {
      only_new: caller.settings.only_new,
      recency_weighting: caller.settings.recency_weighting,
      recency_window_days: caller.settings.recency_window_days,
      include_favourites: caller.settings.include_favourites,
    },
    eligibleRepeatCount,
    constraintsAreNarrow: Boolean(body.needs_using_up?.trim()),
  });

  try {
    const bookRows =
      plan.repeatSlots > 0
        ? await fetchEligibleRepeats(
            supabase,
            caller.householdId,
            caller.mealType,
            cutoff,
            caller.settings.include_favourites,
            plan.repeatSlots,
          )
        : [];

    const bookSuggestions = bookRows.map((row) =>
      suggestionFromRecipe(row.id, row.payload as Recipe),
    );

    let generated: SuggestionWithBook[] = [];
    let infeasibleReason: string | null = null;
    let wouldUnlock: string[] = [];
    let generationId: string | null = null;
    // Only decremented when a call is actually made — a repeat slot filled
    // entirely from the book costs nothing (FR2.9).
    let remaining = caller.remaining;

    if (plan.newIdeaSlots > 0) {
      const result = await generateSuggestions(caller, {
        needsUsingUp: body.needs_using_up,
        cuisine: body.cuisine,
        tasteProfile: body.taste_profile,
        protein: body.protein,
        fat: body.fat,
        carb: body.carb,
        veg: body.veg,
        flavourLayers: body.flavour_layers,
        timeLimit: body.time_limit ?? caller.settings.meal_defaults?.dinner?.default_time_limit,
        servings: body.servings ?? caller.settings.meal_defaults?.dinner?.default_servings,
        batchCooking: body.batch_cooking,
        feedback: body.feedback,
        avoidTitles: body.avoid_titles,
        newIdeaSlots: plan.newIdeaSlots,
      });

      generated = result.suggestions.map((s) => ({ ...s, from_book: null }));
      infeasibleReason = result.infeasibleReason;
      wouldUnlock = result.wouldUnlock;
      generationId = result.generationId;
      remaining = caller.remaining - 1;
    }

    // "Nothing to buy" sorts first across the merged set too (FR11.3).
    const suggestions = [...bookSuggestions, ...generated].sort((a, b) => {
      const aClean = needsNothingExtra(a) ? 0 : 1;
      const bClean = needsNothingExtra(b) ? 0 : 1;
      return aClean - bClean;
    });

    return NextResponse.json({
      suggestions,
      infeasible_reason: infeasibleReason,
      would_unlock: wouldUnlock,
      generation_id: generationId,
      // Shown as the cap gets close (PRD 7.4).
      remaining_today: remaining,
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
