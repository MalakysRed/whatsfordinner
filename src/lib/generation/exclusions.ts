import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ExclusionAxis, PreferenceExclusionRow } from "@/lib/db/types";

/** The household's permanent "not this" reactions (feature spec §5.4). */
export async function fetchExcludedAxes(
  supabase: SupabaseClient,
  householdId: string,
): Promise<{ axis: string; value: string }[]> {
  const { data } = await supabase
    .from("preference_exclusions")
    .select("*")
    .eq("household_id", householdId)
    .eq("reaction", "excluded");

  return ((data ?? []) as PreferenceExclusionRow[]).map((row) => ({
    axis: row.axis,
    value: row.value,
  }));
}

/** Records a "not this" reaction. Permanent — there is no undo in the UI. */
export async function recordExclusion(
  supabase: SupabaseClient,
  householdId: string,
  axis: ExclusionAxis,
  value: string,
): Promise<void> {
  await supabase
    .from("preference_exclusions")
    .insert({ household_id: householdId, axis, value, reaction: "excluded" });
}
