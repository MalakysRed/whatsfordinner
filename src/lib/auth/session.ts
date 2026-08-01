import "server-only";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { MembershipRole } from "@/lib/db/types";

export interface HouseholdSession {
  userId: string;
  email: string;
  householdId: string;
  role: MembershipRole;
}

/** The signed-in user, or null. Does not redirect. */
export async function getUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

/**
 * The caller's household context, or null if they are signed out or have not
 * created/joined a household yet.
 *
 * Route handlers and server actions call this rather than trusting a household
 * id from the request — a household id in a request body is a claim, not a fact.
 */
export async function getHouseholdSession(): Promise<HouseholdSession | null> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) return null;

  const { data: membership } = await supabase
    .from("memberships")
    .select("household_id, role")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!membership) return null;

  return {
    userId: user.id,
    email: user.email,
    householdId: membership.household_id,
    role: membership.role,
  };
}

/**
 * For pages. Sends a signed-out visitor to login and a user without a household
 * to onboarding, rather than rendering an empty shell.
 */
export async function requireHouseholdSession(): Promise<HouseholdSession> {
  const session = await getHouseholdSession();

  if (!session) {
    const user = await getUser();
    redirect(user ? "/welcome" : "/login");
  }

  return session;
}
