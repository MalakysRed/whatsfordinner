import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { DietaryRuleRow, EquipmentRow, MealType, SettingsRow } from "@/lib/db/types";

/**
 * Everything the generator needs to know about a household — the spec's
 * "stage 0, silent context" object (feature spec §3). Assembled once per
 * request with no user input beyond the effort band and the optional "anything
 * to use up?" text, both supplied separately by the caller.
 *
 * There is deliberately no ingredient-bank/pantry field here: the variance
 * engine (src/lib/generation/variance-engine.ts) is what injects variety, not
 * a standing list of what the household owns.
 */
export interface HouseholdContext {
  settings: SettingsRow;
  equipment: EquipmentRow[];
  dietaryRules: DietaryRuleRow[];
  /** Last 20 titles cooked, newest first — feeds the exclusion rules (spec §5.1b). */
  recentMeals: { title: string; cookedAt: string }[];
  /** Every member's allergens, unioned. Drives the code-level guardrail. */
  allergens: string[];
  /** Default diners for dinner — reuses the existing meal_defaults, not a new field. */
  householdSize: number;
  season: Season;
  dayContext: string;
  /** 0..3. Stubbed at 1 (median) until Phase 4 lands proficiency onboarding. */
  proficiencyLevel: number;
  /** Stubbed empty until Phase 4 lands the technique state machine. */
  knownTechniques: string[];
}

export type Season = "spring" | "summer" | "autumn" | "winter";

/** UK meteorological seasons, not astronomical — March through May is spring. */
export function currentSeason(now: Date = new Date()): Season {
  const month = now.getMonth(); // 0-indexed
  if (month >= 2 && month <= 4) return "spring";
  if (month >= 5 && month <= 7) return "summer";
  if (month >= 8 && month <= 10) return "autumn";
  return "winter";
}

/** "Weekday evening", "Weekend afternoon" — cheap situational colour for the prompt. */
export function currentDayContext(now: Date = new Date()): string {
  const isWeekend = now.getDay() === 0 || now.getDay() === 6;
  const hour = now.getHours();
  const timeOfDay =
    hour < 11 ? "morning" : hour < 17 ? "afternoon" : hour < 21 ? "evening" : "night";
  return `${isWeekend ? "Weekend" : "Weekday"} ${timeOfDay}`;
}

export async function loadHouseholdContext(
  supabase: SupabaseClient,
  householdId: string,
  mealType: MealType = "dinner",
): Promise<HouseholdContext> {
  const [{ data: settings }, { data: equipment }, { data: dietaryRules }] = await Promise.all([
    supabase.from("settings").select("*").eq("household_id", householdId).single(),
    supabase.from("equipment").select("*").eq("household_id", householdId),
    supabase.from("dietary_rules").select("*").eq("household_id", householdId),
  ]);

  if (!settings) throw new Error("Household has no settings row");

  const typedSettings = settings as SettingsRow;
  const rules = (dietaryRules ?? []) as DietaryRuleRow[];

  const { data: cookLog } = await supabase
    .from("cook_log")
    .select("cooked_at, recipes(title)")
    .eq("household_id", householdId)
    .eq("meal_type", mealType)
    .order("cooked_at", { ascending: false })
    .limit(20);

  const recentMeals = ((cookLog ?? []) as unknown as {
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

  // Allergens come solely from what a member typed in settings — there is no
  // ingredient bank to union against anymore.
  const allergens = Array.from(
    new Set(rules.filter((r) => r.type === "allergen").map((r) => r.value)),
  );

  return {
    settings: typedSettings,
    equipment: (equipment ?? []) as EquipmentRow[],
    dietaryRules: rules,
    recentMeals,
    allergens,
    householdSize: typedSettings.meal_defaults?.dinner?.default_servings ?? 2,
    season: currentSeason(),
    dayContext: currentDayContext(),
    proficiencyLevel: 1,
    knownTechniques: [],
  };
}
