import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { generateOptions, refineOptions } from "@/lib/ai/generate";
import { prepareGeneration, toErrorResponse } from "@/lib/api/handler";
import { drawSeeds } from "@/lib/generation/variance-engine";
import { fetchActiveSeedPool, recentSeedNames } from "@/lib/generation/seed-draw";
import { fetchExcludedAxes } from "@/lib/generation/exclusions";
import { createClient } from "@/lib/supabase/server";

const bodySchema = z.object({
  effort_band: z.enum(["quick", "standard", "project"]),
  /** Free text from stage 1, "anything to use up?" — a soft preference, never persisted. */
  needs_using_up: z.string().max(500).nullish(),
  /** Titles rejected this session (not the permanent "not this" list). */
  avoid_titles: z.array(z.string().max(200)).max(60).nullish(),
  /** Present for Call 2 — refining the previous set rather than starting fresh. */
  refine: z
    .object({
      reaction: z.string().max(300),
      previous_titles: z.array(z.string().max(200)).max(6),
    })
    .nullish(),
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

    const seeds = drawSeeds(pool, caller.context.season, body.effort_band, excludedSeedNames);

    const optionsInput = {
      effortBand: body.effort_band,
      needsUsingUp: body.needs_using_up,
      avoidTitles: body.avoid_titles,
      excludedAxes,
      // Phase 1 has no persistent "preferred" writer yet — "more like this"
      // steers only the immediate refinement, via `refine.reaction` below.
      preferredAxes: [],
      seeds,
    };

    const result = body.refine
      ? await refineOptions(caller, {
          ...optionsInput,
          reaction: body.refine.reaction,
          previousTitles: body.refine.previous_titles,
        })
      : await generateOptions(caller, optionsInput);

    return NextResponse.json({
      options: result.options,
      generation_id: result.generationId,
      remaining_today: caller.remaining - 1,
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
