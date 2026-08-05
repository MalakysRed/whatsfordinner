import { requireHouseholdSession } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import type { SeedAxis, SettingsRow } from "@/lib/db/types";
import type { UnitPrefs } from "@/lib/recipe/scale";
import { HomeClient } from "./home-client";

type HomeSettings = Pick<SettingsRow, "meal_defaults"> & UnitPrefs;

export default async function HomePage() {
  const session = await requireHouseholdSession();
  const supabase = await createClient();

  const [{ data }, { data: seedRows }] = await Promise.all([
    supabase
      .from("settings")
      .select("meal_defaults, units_weight, units_volume, units_temp, units_length, show_gas_mark")
      .eq("household_id", session.householdId)
      .single(),
    // Stage-1 category picker autocomplete (item 2) — read-only, RLS grants
    // select to any authenticated user. Not effort-band-filtered: this is
    // just autocomplete hints, not a hard constraint, so format rows for
    // every band are all offered regardless of what's picked elsewhere.
    supabase.from("seed_pool").select("axis, name").eq("status", "active").order("name"),
  ]);

  const settings = data as HomeSettings | null;

  const defaultServings = settings?.meal_defaults?.dinner?.default_servings ?? 2;

  const seedPoolNames: Record<SeedAxis, string[]> = { cuisine: [], format: [], hero: [] };
  for (const row of (seedRows ?? []) as { axis: SeedAxis; name: string }[]) {
    seedPoolNames[row.axis].push(row.name);
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">
        What&rsquo;s for dinner?
      </h1>

      <HomeClient
        defaultServings={defaultServings}
        unitPrefs={settings ?? undefined}
        seedPoolNames={seedPoolNames}
      />
    </div>
  );
}
