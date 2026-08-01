import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  DietaryRuleRow,
  EquipmentRow,
  IngredientRow,
  MealType,
  SettingsRow,
} from "@/lib/db/types";
import { recencyCutoff } from "@/lib/generation/quota";

/**
 * Everything the generator needs to know about a household.
 *
 * Assembled once per request and split by the prompt builder into the cacheable
 * block and the per-call block.
 */
export interface HouseholdContext {
  settings: SettingsRow;
  equipment: EquipmentRow[];
  dietaryRules: DietaryRuleRow[];
  ingredients: IngredientRow[];
  /** Cooked inside the recency window, newest first. */
  recentlyCooked: { title: string; cookedAt: string }[];
  /** Every member's allergens, unioned. Drives the code-level guardrail. */
  allergens: string[];
}

export async function loadHouseholdContext(
  supabase: SupabaseClient,
  householdId: string,
  mealType: MealType = "dinner",
): Promise<HouseholdContext> {
  const [
    { data: settings },
    { data: equipment },
    { data: dietaryRules },
    { data: ingredients },
  ] = await Promise.all([
    supabase.from("settings").select("*").eq("household_id", householdId).single(),
    supabase.from("equipment").select("*").eq("household_id", householdId),
    supabase.from("dietary_rules").select("*").eq("household_id", householdId),
    supabase.from("ingredients").select("*").eq("household_id", householdId),
  ]);

  if (!settings) throw new Error("Household has no settings row");

  const typedSettings = settings as SettingsRow;

  const cutoff = recencyCutoff(typedSettings.recency_window_days);

  const { data: cookLog } = await supabase
    .from("cook_log")
    .select("cooked_at, recipes(title)")
    .eq("household_id", householdId)
    .eq("meal_type", mealType)
    .gte("cooked_at", cutoff.toISOString())
    .order("cooked_at", { ascending: false });

  const rules = (dietaryRules ?? []) as DietaryRuleRow[];
  const bank = (ingredients ?? []) as IngredientRow[];

  // Allergens come from two places and both count: a rule someone typed in
  // settings, and an ingredient they flagged in the bank.
  const allergens = Array.from(
    new Set([
      ...rules.filter((r) => r.type === "allergen").map((r) => r.value),
      ...bank.filter((i) => i.allergen).map((i) => i.name),
    ]),
  );

  const recentlyCooked = ((cookLog ?? []) as unknown as {
    cooked_at: string;
    recipes: { title: string } | null;
  }[])
    .filter((entry) => entry.recipes)
    .map((entry) => ({
      title: entry.recipes!.title,
      // Absolute dates, never "3 days ago" — a relative date changes on every
      // call and would silently invalidate the prompt cache each time.
      cookedAt: entry.cooked_at.slice(0, 10),
    }));

  return {
    settings: typedSettings,
    equipment: (equipment ?? []) as EquipmentRow[],
    dietaryRules: rules,
    ingredients: bank,
    recentlyCooked,
    allergens,
  };
}
