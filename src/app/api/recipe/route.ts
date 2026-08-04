import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { generateRecipe } from "@/lib/ai/generate";
import { prepareGeneration, toErrorResponse } from "@/lib/api/handler";
import { refinedOptionSchema } from "@/lib/schemas/dish-variations";

const bodySchema = z.object({
  option: refinedOptionSchema,
  servings: z.number().int().min(1).max(12),
  /** The stage-3 tailoring choices that shaped the chosen variation. */
  component_selections: z.record(z.string(), z.string()).nullish(),
  main_ingredient: z.string().max(80).nullish(),
  needs_using_up: z.string().max(500).nullish(),
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
      mainIngredient: parsed.data.main_ingredient,
      needsUsingUp: parsed.data.needs_using_up,
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
