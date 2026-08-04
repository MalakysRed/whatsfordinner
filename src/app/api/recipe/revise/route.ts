import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { generateRecipe } from "@/lib/ai/generate";
import { prepareGeneration, toErrorResponse } from "@/lib/api/handler";
import { recipeSchema } from "@/lib/schemas/recipe";
import { optionSchema } from "@/lib/schemas/option";

/**
 * Re-checks a card at a new serving count when it moves by more than a
 * factor of two (FR5.4). This is a recalculation, not a mutation of the
 * dish — the spec's "no free-text mutation at stage 3" rule is about
 * changing what the dish *is*, not about servings, which stage 3 explicitly
 * permits.
 */
const bodySchema = z.object({
  option: optionSchema,
  previous: recipeSchema,
  servings: z.number().int().min(1).max(12),
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
      previous: parsed.data.previous,
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
