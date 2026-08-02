import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { MealType } from "@/lib/db/types";

/**
 * The pool behind FR2.8/FR2.9 — recipes eligible to fill a "repeat" slot.
 *
 * Eligibility is simple: a `cook_log` entry inside the recency window. That is
 * what "repeat" means here — something recently cooked, offered again — and it
 * is independently narrowed to exclude favourites when the household has
 * turned that off. Two sequential queries (recent cook_log, then the matching
 * recipes) rather than one clever join, matching how the rest of this codebase
 * reads.
 */

async function eligibleRecipeIds(
  supabase: SupabaseClient,
  householdId: string,
  mealType: MealType,
  cutoff: Date,
  includeFavourites: boolean,
): Promise<string[]> {
  const { data: cookLog } = await supabase
    .from("cook_log")
    .select("recipe_id")
    .eq("household_id", householdId)
    .eq("meal_type", mealType)
    .gte("cooked_at", cutoff.toISOString());

  const recentIds = Array.from(
    new Set((cookLog ?? []).map((row) => row.recipe_id as string)),
  );

  if (recentIds.length === 0 || includeFavourites) return recentIds;

  const { data: favourites } = await supabase
    .from("favourites")
    .select("recipe_id")
    .in("recipe_id", recentIds);

  const favourited = new Set((favourites ?? []).map((row) => row.recipe_id as string));

  return recentIds.filter((id) => !favourited.has(id));
}

export async function countEligibleRepeats(
  supabase: SupabaseClient,
  householdId: string,
  mealType: MealType,
  cutoff: Date,
  includeFavourites: boolean,
): Promise<number> {
  const ids = await eligibleRecipeIds(supabase, householdId, mealType, cutoff, includeFavourites);
  return ids.length;
}

export interface EligibleRecipeRow {
  id: string;
  payload: unknown;
}

/**
 * Picked at random from the eligible pool rather than always the same ones —
 * a repeat slot should not offer an identical set of "recently cooked" cards
 * on every call.
 */
export async function fetchEligibleRepeats(
  supabase: SupabaseClient,
  householdId: string,
  mealType: MealType,
  cutoff: Date,
  includeFavourites: boolean,
  limit: number,
): Promise<EligibleRecipeRow[]> {
  const ids = await eligibleRecipeIds(supabase, householdId, mealType, cutoff, includeFavourites);
  if (ids.length === 0 || limit <= 0) return [];

  const chosen = [...ids].sort(() => Math.random() - 0.5).slice(0, limit);

  const { data } = await supabase.from("recipes").select("id, payload").in("id", chosen);

  return (data ?? []) as EligibleRecipeRow[];
}
