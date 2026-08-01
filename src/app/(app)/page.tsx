import { requireHouseholdSession } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import type { SettingsRow } from "@/lib/db/types";
import { HomeClient } from "./home-client";

export default async function HomePage() {
  const session = await requireHouseholdSession();
  const supabase = await createClient();

  const { data } = await supabase
    .from("settings")
    .select("meal_defaults")
    .eq("household_id", session.householdId)
    .single();

  const defaultServings =
    (data as Pick<SettingsRow, "meal_defaults"> | null)?.meal_defaults?.dinner
      ?.default_servings ?? 2;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">
        What&rsquo;s for dinner?
      </h1>

      <HomeClient defaultServings={defaultServings} />
    </div>
  );
}
