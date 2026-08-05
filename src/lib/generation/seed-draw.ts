import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { SeedPoolRow } from "@/lib/db/types";

/**
 * Seeds used in a household's last three options generations (either the
 * fresh call or a refinement), read back from the `generations` audit log
 * rather than a dedicated table — see client.ts's `requestMeta` doc for why
 * that's where they end up.
 */
export async function recentSeedNames(
  supabase: SupabaseClient,
  householdId: string,
  limit = 3,
): Promise<Set<string>> {
  const { data } = await supabase
    .from("generations")
    .select("request")
    .eq("household_id", householdId)
    .in("type", ["options", "options_refine"])
    .order("created_at", { ascending: false })
    .limit(limit);

  const names = new Set<string>();
  for (const row of data ?? []) {
    const seeds = (row.request as { seeds?: string[] } | null)?.seeds ?? [];
    for (const name of seeds) names.add(name);
  }
  return names;
}

export async function fetchActiveSeedPool(supabase: SupabaseClient): Promise<SeedPoolRow[]> {
  const { data } = await supabase.from("seed_pool").select("*").eq("status", "active");
  return (data ?? []) as SeedPoolRow[];
}
