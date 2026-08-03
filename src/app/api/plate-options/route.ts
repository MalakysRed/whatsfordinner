import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { generatePlateOptions } from "@/lib/ai/generate";
import { prepareGeneration, toErrorResponse } from "@/lib/api/handler";

const bodySchema = z.object({
  protein: z.string().max(80).nullish(),
  taste_profile: z.array(z.string().max(40)).max(8).nullish(),
  cuisine: z.string().max(80).nullish(),
  dish_type: z.string().max(80).nullish(),
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
    const { carbs, fats, veg, generationId } = await generatePlateOptions(caller, {
      protein: parsed.data.protein,
      tasteProfile: parsed.data.taste_profile,
      cuisine: parsed.data.cuisine,
      dishType: parsed.data.dish_type,
      batchCooking: parsed.data.batch_cooking,
    });

    return NextResponse.json({
      carbs,
      fats,
      veg,
      generation_id: generationId,
      remaining_today: caller.remaining - 1,
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
