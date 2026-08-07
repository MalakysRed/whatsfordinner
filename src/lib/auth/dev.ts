import "server-only";

import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireHouseholdSession, type HouseholdSession } from "./session";

/**
 * Gate for the hidden /dev tools — a single-developer utility, not a
 * household-level permission. `is_dev` is DB-enforced (unwritable from the
 * app; see the 20260807120000_dev_tools.sql migration), so this check is
 * belt-and-suspenders on top of that, not the real gate.
 *
 * 404s rather than redirecting: a non-dev user who finds their way here sees
 * a page that does not exist, not one that exists and says no.
 */
export async function requireDevSession(): Promise<HouseholdSession> {
  const session = await requireHouseholdSession();
  const supabase = await createClient();

  const { data } = await supabase
    .from("users")
    .select("is_dev")
    .eq("id", session.userId)
    .single();

  if (!data?.is_dev) notFound();

  return session;
}
