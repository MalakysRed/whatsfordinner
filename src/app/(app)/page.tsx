import { requireHouseholdSession } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import type { SettingsRow } from "@/lib/db/types";
import type { UnitPrefs } from "@/lib/recipe/scale";
import { HomeClient } from "./home-client";

type HomeSettings = Pick<SettingsRow, "meal_defaults"> & UnitPrefs;

export default async function HomePage() {
  const session = await requireHouseholdSession();
  const supabase = await createClient();

  const { data } = await supabase
    .from("settings")
    .select("meal_defaults, units_weight, units_volume, units_temp, units_length, show_gas_mark")
    .eq("household_id", session.householdId)
    .single();

  const settings = data as HomeSettings | null;

  const defaultServings = settings?.meal_defaults?.dinner?.default_servings ?? 2;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">
        What&rsquo;s for dinner?
      </h1>

      <HomeClient defaultServings={defaultServings} unitPrefs={settings ?? undefined} />
    </div>
  );
}
