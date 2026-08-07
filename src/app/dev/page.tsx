import { createClient } from "@/lib/supabase/server";
import { requireDevSession } from "@/lib/auth/dev";
import { fetchActiveSeedPool } from "@/lib/generation/seed-draw";
import type { SeedAxis } from "@/lib/db/types";
import { DevClient } from "./dev-client";

export default async function DevPage() {
  await requireDevSession();

  const supabase = await createClient();
  const pool = await fetchActiveSeedPool(supabase);

  const seedNames: Record<SeedAxis, string[]> = { cuisine: [], format: [], hero: [] };
  for (const row of pool) seedNames[row.axis].push(row.name);
  for (const axis of Object.keys(seedNames) as SeedAxis[]) seedNames[axis].sort();

  return (
    <div className="space-y-10">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Dev tools</h1>
        <p className="text-sm text-muted">Visible only to your account.</p>
      </header>

      <DevClient seedNames={seedNames} />
    </div>
  );
}
