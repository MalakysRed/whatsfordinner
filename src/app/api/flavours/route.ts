import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { generateFlavours } from "@/lib/ai/generate";
import { prepareGeneration, toErrorResponse } from "@/lib/api/handler";

const bodySchema = z.object({
  cuisine: z.string().max(80).nullish(),
  dish_type: z.string().max(80).nullish(),
  taste_profile: z.array(z.string().max(40)).max(8).nullish(),
  /** Whatever of the plate has been chosen so far. */
  components: z.array(z.string().max(80)).max(10).default([]),
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
    const { flavours, generationId } = await generateFlavours(caller, {
      cuisine: parsed.data.cuisine,
      dishType: parsed.data.dish_type,
      tasteProfile: parsed.data.taste_profile,
      components: parsed.data.components,
      batchCooking: parsed.data.batch_cooking,
    });

    return NextResponse.json({
      flavours,
      generation_id: generationId,
      remaining_today: caller.remaining - 1,
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
