import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getHouseholdSession } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { recordExclusion } from "@/lib/generation/exclusions";

/**
 * "Not this" (feature spec §5.4) — the one per-card reaction that is
 * permanent. Recorded at dish level: the household rejected this specific
 * title, not "chicken" or "Thai" forever, which a coarser axis exclusion
 * would risk over-applying. "More like this" has no endpoint of its own — it
 * only steers the immediate Call 2 refinement, via /api/options's `refine`.
 */
const bodySchema = z.object({
  title: z.string().min(1).max(200),
});

export async function POST(request: NextRequest) {
  const session = await getHouseholdSession();
  if (!session) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const supabase = await createClient();
  await recordExclusion(supabase, session.householdId, "dish", parsed.data.title);

  return NextResponse.json({ ok: true });
}
