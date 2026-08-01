"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export interface WelcomeState {
  status: "idle" | "error";
  message?: string;
}

/**
 * Creates the household, its settings row and its equipment list, then adopts
 * the starter ingredient set.
 *
 * All of it goes through SECURITY DEFINER functions, because at this moment the
 * caller is not yet a member of anything and so cannot satisfy the insert
 * policies. Those functions always use auth.uid() and refuse if the caller is
 * already in a household, so this is not a way into someone else's kitchen.
 */
export async function createHousehold(
  _prev: WelcomeState,
  formData: FormData,
): Promise<WelcomeState> {
  const name = String(formData.get("name") ?? "").trim();
  const adoptStarters = formData.get("adopt_starters") === "on";

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { status: "error", message: "You are not signed in." };

  const { error } = await supabase.rpc("create_household_for_current_user", {
    household_name: name,
  });

  if (error) {
    if (error.message.includes("already_in_household")) redirect("/");
    return { status: "error", message: "Could not create the household. Try again." };
  }

  if (adoptStarters) {
    // Not fatal if it fails — the bank must never be a blocker to generating,
    // and it can be filled in later from settings.
    await supabase.rpc("adopt_starter_ingredients", { names: null });
  }

  redirect("/");
}
