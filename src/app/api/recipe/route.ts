import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { generateRecipe } from "@/lib/ai/generate";
import { prepareGeneration, toErrorResponse } from "@/lib/api/handler";
import { optionSchema } from "@/lib/schemas/option";

const bodySchema = z.object({
  option: optionSchema,
  servings: z.number().int().min(1).max(12),
  /** Chosen values from the committed option's own `swaps` array, keyed by slot. */
  swap_selections: z.record(z.string(), z.string()).nullish(),
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
      swapSelections: parsed.data.swap_selections,
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
