import "server-only";

import { NextResponse } from "next/server";
import { getHouseholdSession } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { loadHouseholdContext, type HouseholdContext } from "@/lib/ai/prompts/context";
import { GenerationError, assertUnderDailyCap } from "@/lib/ai/client";
import type { MealType, SettingsRow } from "@/lib/db/types";

/** Hard-set to dinner throughout v1 (PRD section 11). */
export const V1_MEAL_TYPE: MealType = "dinner";

export interface GenerationCaller {
  householdId: string;
  userId: string;
  mealType: MealType;
  context: HouseholdContext;
  settings: SettingsRow;
  remaining: number;
}

/**
 * The preamble every generation route shares: authenticate, check the daily cap,
 * then load the household's constraints.
 *
 * The auth check here is not redundant with the proxy. Next.js warns that a
 * matcher change can silently remove proxy coverage, and these are the routes
 * that spend money.
 */
export async function prepareGeneration(): Promise<
  { ok: true; caller: GenerationCaller } | { ok: false; response: NextResponse }
> {
  const session = await getHouseholdSession();

  if (!session) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Not signed in." }, { status: 401 }),
    };
  }

  const context = await loadHouseholdContext(
    await createClient(),
    session.householdId,
    V1_MEAL_TYPE,
  );

  try {
    const { remaining } = await assertUnderDailyCap(
      session.userId,
      context.settings.daily_generation_cap,
    );

    return {
      ok: true,
      caller: {
        householdId: session.householdId,
        userId: session.userId,
        mealType: V1_MEAL_TYPE,
        context,
        settings: context.settings,
        remaining,
      },
    };
  } catch (error) {
    return { ok: false, response: toErrorResponse(error) };
  }
}

/** Maps a generation failure to a status the client can act on. */
export function toErrorResponse(error: unknown): NextResponse {
  if (error instanceof GenerationError) {
    const status = {
      capped: 429,
      unavailable: 503,
      invalid: 502,
      allergen: 502,
    }[error.reason];

    return NextResponse.json(
      { error: error.message, reason: error.reason },
      { status },
    );
  }

  console.error("Unexpected generation failure", error);

  return NextResponse.json(
    { error: "Something went wrong. Try again." },
    { status: 500 },
  );
}
