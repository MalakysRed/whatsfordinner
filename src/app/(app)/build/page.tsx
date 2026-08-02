import { requireHouseholdSession } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import type { SettingsRow } from "@/lib/db/types";
import type { UnitPrefs } from "@/lib/recipe/scale";
import { Builder, type BankIngredient } from "./builder";

type BuildSettings = Pick<SettingsRow, "meal_defaults"> & UnitPrefs;

/**
 * "Use it up" is not a separate screen (PRD 7.3). It deep-links here with the
 * "needs using up" field open and focused — one screen, one endpoint, one code
 * path.
 */
export default async function BuildPage({
  searchParams,
}: {
  searchParams: Promise<{ "use-it-up"?: string }>;
}) {
  const session = await requireHouseholdSession();
  const { "use-it-up": useItUp } = await searchParams;

  const supabase = await createClient();

  const [{ data: settings }, { data: ingredients }] = await Promise.all([
    supabase
      .from("settings")
      .select("meal_defaults, units_weight, units_volume, units_temp, units_length, show_gas_mark")
      .eq("household_id", session.householdId)
      .single(),
    supabase
      .from("ingredients")
      .select("id, name, category, disliked, allergen")
      .eq("household_id", session.householdId),
  ]);

  const typedSettings = settings as BuildSettings | null;
  const defaults = typedSettings?.meal_defaults?.dinner;

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold tracking-tight">Build a meal</h1>
      <p className="text-sm leading-relaxed text-muted">
        Everything here is optional. Leave it all alone and it works like
        Surprise us.
      </p>

      <Builder
        bankIngredients={(ingredients ?? []) as BankIngredient[]}
        defaultServings={defaults?.default_servings ?? 2}
        defaultTimeLimit={defaults?.default_time_limit ?? null}
        focusUseItUp={useItUp === "1"}
        unitPrefs={typedSettings ?? undefined}
      />
    </div>
  );
}
