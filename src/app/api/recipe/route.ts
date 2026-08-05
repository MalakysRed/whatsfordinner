import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { generateRecipe } from "@/lib/ai/generate";
import { prepareGeneration, toErrorResponse } from "@/lib/api/handler";
import { refinedOptionSchema } from "@/lib/schemas/dish-variations";

const categoryPickSchema = z.object({
  axis: z.enum(["cuisine", "format", "hero"]),
  value: z.string().max(80),
});

const bodySchema = z.object({
  option: refinedOptionSchema,
  servings: z.number().int().min(1).max(12),
  /** The stage-3 tailoring choices that shaped the chosen variation. */
  component_selections: z.record(z.string(), z.string()).nullish(),
  category_picks: z.array(categoryPickSchema).max(2).nullish(),
  needs_using_up: z.string().max(500).nullish(),
  batch_cooking: z.boolean().nullish(),
});

export async function POST(request: NextRequest) {
  const prepared = await prepareGeneration();
  if (!prepared.ok) return prepared.response;

  const { caller } = prepared;

  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  try {
    const { recipe, generationId } = await generateRecipe(caller, {
      option: parsed.data.option,
      servings: parsed.data.servings,
      componentSelections: parsed.data.component_selections,
      categoryPicks: parsed.data.category_picks,
      needsUsingUp: parsed.data.needs_using_up,
      batchCooking: parsed.data.batch_cooking,
    });

    return NextResponse.json({
      recipe,
      generation_id: generationId,
      remaining_today: caller.remaining - 1,
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
