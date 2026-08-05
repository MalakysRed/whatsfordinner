import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { generateOptionSummaries, OPTION_COUNT } from "@/lib/ai/generate";
import { prepareGeneration, toErrorResponse } from "@/lib/api/handler";
import { drawSeedSet } from "@/lib/generation/variance-engine";
import { fetchActiveSeedPool, recentSeedNames } from "@/lib/generation/seed-draw";
import { fetchExcludedAxes } from "@/lib/generation/exclusions";
import { createClient } from "@/lib/supabase/server";

const bodySchema = z.object({
  effort_band: z.enum(["quick", "standard", "project"]),
  /** Pinned at stage 1 — a hard constraint applied to all eight options. */
  main_ingredient: z.string().max(80).nullish(),
  /** Free text from stage 1, "anything to use up?" — a soft preference, never persisted. */
  needs_using_up: z.string().max(500).nullish(),
  /** Directions rejected this session (not the permanent "not this" list). */
  avoid_directions: z.array(z.string().max(80)).max(80).nullish(),
  /** Present on a "Refresh" call — the eight directions just shown, to avoid repeating. */
  previous_directions: z.array(z.string().max(80)).max(8).nullish(),
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
  const supabase = await createClient();

  try {
    const [pool, excludedSeedNames, excludedAxes] = await Promise.all([
      fetchActiveSeedPool(supabase),
      recentSeedNames(supabase, caller.householdId),
      fetchExcludedAxes(supabase, caller.householdId),
    ]);

    // A pinned main ingredient already fixes the hero — drawing a seed for it
    // would just compete rather than add inspiration.
    const seedAxes = body.main_ingredient?.trim()
      ? (["cuisine", "format"] as const)
      : (["cuisine", "format", "hero"] as const);

    const seeds = drawSeedSet(
      pool,
      caller.context.season,
      body.effort_band,
      excludedSeedNames,
      OPTION_COUNT,
      Math.random,
      [...seedAxes],
    );

    const result = await generateOptionSummaries(caller, {
      effortBand: body.effort_band,
      mainIngredient: body.main_ingredient,
      needsUsingUp: body.needs_using_up,
      avoidDirections: body.avoid_directions,
      previousDirections: body.previous_directions,
      excludedAxes,
      seeds,
    });

    return NextResponse.json({
      options: result.options,
      generation_id: result.generationId,
      remaining_today: caller.remaining - 1,
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
