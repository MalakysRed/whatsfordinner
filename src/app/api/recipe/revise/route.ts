import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { generateRecipe } from "@/lib/ai/generate";
import { prepareGeneration, toErrorResponse } from "@/lib/api/handler";
import { recipeSchema } from "@/lib/schemas/recipe";
import { suggestionSchema } from "@/lib/schemas/suggestion";

/**
 * Regenerate a card with a comment ("too much faff", "we do not have a pestle
 * and mortar", "make the sauce sharper"). Also serves the re-check offered when
 * the serving count moves by more than a factor of two (FR5.4).
 */
const bodySchema = z.object({
  suggestion: suggestionSchema,
  previous: recipeSchema,
  servings: z.number().int().min(1).max(12),
  feedback: z.string().max(500).nullish(),
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
      suggestion: parsed.data.suggestion,
      servings: parsed.data.servings,
      feedback: parsed.data.feedback,
      previous: parsed.data.previous,
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
