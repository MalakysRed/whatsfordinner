import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { generateDishVariations } from "@/lib/ai/generate";
import { prepareGeneration, toErrorResponse } from "@/lib/api/handler";
import { optionSchema } from "@/lib/schemas/option";

/** Stage 4 — three richer variations of the picked dish, informed by the stage-3 tailoring choices. */
const bodySchema = z.object({
  option: optionSchema,
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
    const result = await generateDishVariations(caller, {
      option: parsed.data.option,
      componentSelections: parsed.data.component_selections,
      mainIngredient: parsed.data.main_ingredient,
      needsUsingUp: parsed.data.needs_using_up,
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
