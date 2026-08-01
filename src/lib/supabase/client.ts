"use client";

import { createBrowserClient } from "@supabase/ssr";
import { getPublicEnv } from "@/lib/env";

/**
 * Browser client. Carries the anon key, which is safe to ship — RLS is what
 * protects the data, not the key. Anything needing the service role belongs in
 * a route handler or server action.
 */
export function createClient() {
  const { supabaseUrl, supabaseAnonKey } = getPublicEnv();
  return createBrowserClient(supabaseUrl, supabaseAnonKey);
}
