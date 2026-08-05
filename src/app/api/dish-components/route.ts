import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { generateDishComponents } from "@/lib/ai/generate";
import { prepareGeneration, toErrorResponse } from "@/lib/api/handler";
import { optionSchema } from "@/lib/schemas/option";

/** Stage 3 — tailoring suggestions (vegetables, hero herb/spice, sauce, ...) for the one dish picked at stage 2. */
const bodySchema = z.object({
  option: optionSchema,
  main_ingredient: z.string().max(80).nullish(),
  needs_using_up: z.string().max(500).nullish(),
  /** Present on the "refresh the rest to match" follow-up after a slot changes. */
  locked: z.object({ slot: z.string().max(60), value: z.string().max(200) }).nullish(),
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
    const result = await generateDishComponents(caller, {
      option: parsed.data.option,
      mainIngredient: parsed.data.main_ingredient,
      needsUsingUp: parsed.data.needs_using_up,
      locked: parsed.data.locked,
    });

    return NextResponse.json({
      slots: result.slots,
      generation_id: result.generationId,
      remaining_today: caller.remaining - 1,
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
