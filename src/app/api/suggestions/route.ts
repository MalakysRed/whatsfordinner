import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { generateSuggestions } from "@/lib/ai/generate";
import { prepareGeneration, toErrorResponse } from "@/lib/api/handler";
import { planSuggestionSlots } from "@/lib/generation/quota";

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
  /** Free text from the refresh box. Treated as data, never as instruction. */
  feedback: z.string().max(500).nullish(),
  /** Titles rejected this session. */
  avoid_titles: z.array(z.string().max(200)).max(30).nullish(),
});

export async function POST(request: NextRequest) {
  const prepared = await prepareGeneration();
  if (!prepared.ok) return prepared.response;

  const { caller } = prepared;

  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const body = parsed.data;

  // How many of the three slots may hold something from the book, versus how
  // many must be genuinely new ideas (FR2.8). Filling the repeat slots with
  // stored cards lands with the cook log; until then the book contributes
  // nothing and all three slots are generated.
  const plan = planSuggestionSlots({
    variety: {
      only_new: caller.settings.only_new,
      recency_weighting: caller.settings.recency_weighting,
      recency_window_days: caller.settings.recency_window_days,
      include_favourites: caller.settings.include_favourites,
    },
    eligibleRepeatCount: 0,
    constraintsAreNarrow: Boolean(body.needs_using_up?.trim()),
  });

  try {
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
      feedback: body.feedback,
      avoidTitles: body.avoid_titles,
      newIdeaSlots: plan.newIdeaSlots,
    });

    return NextResponse.json({
      suggestions: result.suggestions,
      infeasible_reason: result.infeasibleReason,
      would_unlock: result.wouldUnlock,
      generation_id: result.generationId,
      // Shown as the cap gets close (PRD 7.4).
      remaining_today: caller.remaining - 1,
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
