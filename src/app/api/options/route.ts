import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { generateOptionSummaries, OPTION_COUNT } from "@/lib/ai/generate";
import { prepareGeneration, toErrorResponse } from "@/lib/api/handler";
import { drawSeedSet } from "@/lib/generation/variance-engine";
import { fetchActiveSeedPool, recentSeedNames } from "@/lib/generation/seed-draw";
import { createClient } from "@/lib/supabase/server";

const categoryPickSchema = z.object({
  axis: z.enum(["cuisine", "format", "hero"]),
  value: z.string().max(80),
});

const bodySchema = z.object({
  effort_band: z.enum(["quick", "standard", "project"]),
  /** Pinned at stage 1 — 0-2 entries, each a hard constraint applied to all eight options. */
  category_picks: z.array(categoryPickSchema).max(2).nullish(),
  /** Free text from stage 1, "anything to use up?" — a soft preference, never persisted. */
  needs_using_up: z.string().max(500).nullish(),
  /** Stage-1 toggle — biases every downstream call toward freezer-friendly dishes. */
  batch_cooking: z.boolean().nullish(),
  /** Directions rejected this session. */
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
  const categoryPicks = body.category_picks ?? [];

  try {
    const [pool, excludedSeedNames] = await Promise.all([
      fetchActiveSeedPool(supabase),
      recentSeedNames(supabase, caller.householdId),
    ]);

    // A pinned axis already fixes that part of the dish — drawing a random
    // seed for it would just compete rather than add inspiration.
    const pinnedAxes = new Set(categoryPicks.map((p) => p.axis));
    const seedAxes = (["cuisine", "format", "hero"] as const).filter(
      (axis) => !pinnedAxes.has(axis),
    );

    const seeds = drawSeedSet(
      pool,
      caller.context.season,
      body.effort_band,
      excludedSeedNames,
      OPTION_COUNT,
      Math.random,
      seedAxes,
    );

    const result = await generateOptionSummaries(caller, {
      effortBand: body.effort_band,
      categoryPicks,
      needsUsingUp: body.needs_using_up,
      batchCooking: body.batch_cooking,
      avoidDirections: body.avoid_directions,
      previousDirections: body.previous_directions,
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
