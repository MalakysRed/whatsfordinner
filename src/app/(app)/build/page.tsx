import { requireHouseholdSession } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import type { SettingsRow } from "@/lib/db/types";
import { Builder } from "./builder";

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
      .select("meal_defaults")
      .eq("household_id", session.householdId)
      .single(),
    supabase.from("ingredients").select("name").eq("household_id", session.householdId),
  ]);

  const defaults = (settings as Pick<SettingsRow, "meal_defaults"> | null)
    ?.meal_defaults?.dinner;

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold tracking-tight">Build a meal</h1>
      <p className="text-sm leading-relaxed text-muted">
        Everything here is optional. Leave it all alone and it works like
        Surprise us.
      </p>

      <Builder
        bankNames={((ingredients ?? []) as { name: string }[]).map((i) => i.name)}
        defaultServings={defaults?.default_servings ?? 2}
        defaultTimeLimit={defaults?.default_time_limit ?? null}
        focusUseItUp={useItUp === "1"}
      />
    </div>
  );
}
