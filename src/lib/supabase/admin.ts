import "server-only";

import { createClient } from "@supabase/supabase-js";
import { getPublicEnv, getSupabaseServiceRoleKey } from "@/lib/env";

/**
 * Service role client. Bypasses RLS entirely.
 *
 * Use it only where the user's own credentials genuinely cannot do the job:
 * writing to `generations` (the browser must not be able to invent token counts
 * and costs, or the daily cap and spend figures become fiction) and reading
 * `signup_allowlist` (which has no client-facing grants at all).
 *
 * Never pass a household id from the request body to a query made with this
 * client — resolve the caller's household from their session first.
 */
export function createAdminClient() {
  const { supabaseUrl } = getPublicEnv();

  return createClient(supabaseUrl, getSupabaseServiceRoleKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
