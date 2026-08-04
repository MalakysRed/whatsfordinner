"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { requireHouseholdSession } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  displayNameSchema,
  generationSchema,
  householdDefaultsSchema,
  householdNameSchema,
  measurementsSchema,
  shoppingSchema,
} from "@/lib/schemas/settings";
import type { MealDefaults, MealType } from "@/lib/db/types";

export interface ActionResult {
  status: "idle" | "saved" | "error";
  message?: string;
}

const V1_MEAL_TYPE: MealType = "dinner";

function text(formData: FormData, key: string): string | null {
  const value = String(formData.get(key) ?? "").trim();
  return value === "" ? null : value;
}

function checked(formData: FormData, key: string): boolean {
  return formData.get(key) === "on";
}

/** FR2.2 — measurement families toggle independently. */
export async function saveMeasurements(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const session = await requireHouseholdSession();

  const parsed = measurementsSchema.safeParse({
    units_weight: formData.get("units_weight"),
    units_volume: formData.get("units_volume"),
    units_temp: formData.get("units_temp"),
    units_length: formData.get("units_length"),
    show_gas_mark: checked(formData, "show_gas_mark"),
  });

  if (!parsed.success) return { status: "error", message: "Those settings did not look right." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("settings")
    .update(parsed.data)
    .eq("household_id", session.householdId);

  if (error) return { status: "error", message: "Could not save. Try again." };

  revalidatePath("/settings");
  return { status: "saved" };
}

/** FR2.3 — defaults, spice tolerance, and how you eat. */
export async function saveHouseholdDefaults(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const session = await requireHouseholdSession();

  const rawTimeLimit = text(formData, "default_time_limit");

  const parsed = householdDefaultsSchema.safeParse({
    default_servings: Number(formData.get("default_servings")),
    default_time_limit: rawTimeLimit === null ? null : Number(rawTimeLimit),
    spice_tolerance: formData.get("spice_tolerance"),
    eating_notes: text(formData, "eating_notes"),
  });

  if (!parsed.success) return { status: "error", message: "Those settings did not look right." };

  const supabase = await createClient();

  // Servings and time limit live under a meal_type key so that adding breakfast
  // later needs no migration. Read-modify-write to leave other keys alone.
  const { data: current } = await supabase
    .from("settings")
    .select("meal_defaults")
    .eq("household_id", session.householdId)
    .single();

  const mealDefaults = {
    ...((current?.meal_defaults ?? {}) as Partial<Record<MealType, MealDefaults>>),
    [V1_MEAL_TYPE]: {
      default_servings: parsed.data.default_servings,
      default_time_limit: parsed.data.default_time_limit,
    },
  };

  const { error } = await supabase
    .from("settings")
    .update({
      spice_tolerance: parsed.data.spice_tolerance,
      eating_notes: parsed.data.eating_notes,
      meal_defaults: mealDefaults,
    })
    .eq("household_id", session.householdId);

  if (error) return { status: "error", message: "Could not save. Try again." };

  revalidatePath("/settings");
  return { status: "saved" };
}

/** FR2.5 — used only by the Cowork export. */
export async function saveShopping(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const session = await requireHouseholdSession();

  const parsed = shoppingSchema.safeParse({
    supermarket: text(formData, "supermarket"),
    delivery_day: text(formData, "delivery_day"),
    shopping_notes: text(formData, "shopping_notes"),
  });

  if (!parsed.success) return { status: "error", message: "Those settings did not look right." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("settings")
    .update(parsed.data)
    .eq("household_id", session.householdId);

  if (error) return { status: "error", message: "Could not save. Try again." };

  revalidatePath("/settings");
  return { status: "saved" };
}

/**
 * FR2.6 — the daily cap. Owner only: it is the household's API budget, and the
 * whole point of a cap is that the person paying sets it.
 */
export async function saveGenerationSettings(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const session = await requireHouseholdSession();

  if (session.role !== "owner") {
    return { status: "error", message: "Only the household owner can change the cap." };
  }

  const parsed = generationSchema.safeParse({
    daily_generation_cap: Number(formData.get("daily_generation_cap")),
  });

  if (!parsed.success) {
    return { status: "error", message: "The cap must be between 1 and 500." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("settings")
    .update(parsed.data)
    .eq("household_id", session.householdId);

  if (error) return { status: "error", message: "Could not save. Try again." };

  revalidatePath("/settings");
  return { status: "saved" };
}

/**
 * FR2.1 — equipment. Every generation is constrained to what is available, so
 * an unticked box is a real constraint rather than a missing answer.
 */
export async function saveEquipment(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const session = await requireHouseholdSession();
  const supabase = await createClient();

  const availableIds = new Set(formData.getAll("equipment").map(String));

  const { data: rows } = await supabase
    .from("equipment")
    .select("id")
    .eq("household_id", session.householdId);

  const turnOn = (rows ?? []).filter((r) => availableIds.has(r.id)).map((r) => r.id);
  const turnOff = (rows ?? []).filter((r) => !availableIds.has(r.id)).map((r) => r.id);

  if (turnOn.length) {
    await supabase.from("equipment").update({ available: true }).in("id", turnOn);
  }
  if (turnOff.length) {
    await supabase.from("equipment").update({ available: false }).in("id", turnOff);
  }

  // Free text for anything the checklist does not cover.
  const extra = text(formData, "extra_equipment");
  if (extra) {
    const names = extra
      .split(",")
      .map((n) => n.trim())
      .filter(Boolean);

    if (names.length) {
      await supabase.from("equipment").upsert(
        names.map((name) => ({
          household_id: session.householdId,
          name,
          available: true,
        })),
        { onConflict: "household_id,name" },
      );
    }
  }

  revalidatePath("/settings");
  return { status: "saved" };
}

/**
 * FR2.4 — dietary rules are per member, but unioned across the household and
 * applied to every generation. You may only edit your own.
 */
export async function addDietaryRule(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const session = await requireHouseholdSession();

  const type = String(formData.get("type") ?? "");
  const value = String(formData.get("value") ?? "").trim();

  if (!["allergen", "avoid", "diet"].includes(type) || !value) {
    return { status: "error", message: "Pick a type and enter a value." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("dietary_rules").insert({
    user_id: session.userId,
    household_id: session.householdId,
    type,
    value,
  });

  if (error) {
    if (error.code === "23505") return { status: "saved" }; // Already there.
    return { status: "error", message: "Could not save that rule." };
  }

  revalidatePath("/settings");
  return { status: "saved" };
}

export async function removeDietaryRule(formData: FormData): Promise<void> {
  const session = await requireHouseholdSession();
  const id = String(formData.get("id") ?? "");

  const supabase = await createClient();
  // The policy already restricts this to your own rules; the filter makes the
  // intent obvious at the call site rather than implicit in the database.
  await supabase.from("dietary_rules").delete().eq("id", id).eq("user_id", session.userId);

  revalidatePath("/settings");
}

/**
 * FR1.4 — your own name, as the rest of the household sees it. Anyone may set
 * their own; there is nothing here for a role check to gate.
 */
export async function saveDisplayName(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const session = await requireHouseholdSession();

  const parsed = displayNameSchema.safeParse({
    display_name: text(formData, "display_name"),
  });

  if (!parsed.success) return { status: "error", message: "Enter a name." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("users")
    .update({ display_name: parsed.data.display_name })
    .eq("id", session.userId);

  if (error) return { status: "error", message: "Could not save. Try again." };

  revalidatePath("/settings");
  return { status: "saved" };
}

/** FR1.3 — the household's own name. Owner only, same as renaming any shared thing. */
export async function saveHouseholdName(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const session = await requireHouseholdSession();

  if (session.role !== "owner") {
    return { status: "error", message: "Only the household owner can rename it." };
  }

  const parsed = householdNameSchema.safeParse({
    name: text(formData, "name"),
  });

  if (!parsed.success) return { status: "error", message: "Enter a name." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("households")
    .update({ name: parsed.data.name })
    .eq("id", session.householdId);

  if (error) return { status: "error", message: "Could not save. Try again." };

  revalidatePath("/settings");
  return { status: "saved" };
}

/**
 * FR1.3 — a 7 day invite link, emailed to the invitee.
 *
 * `create_invite` only writes the database row and allowlists the email; it
 * has no way to send mail itself. Delivery happens here, via the same
 * Supabase project that already emails magic links, so no separate email
 * provider is needed. A brand new address gets Supabase's "invite" template
 * (`inviteUserByEmail`, which also creates their `auth.users` row up front);
 * an address that already has an account can't be invited that way — Supabase
 * refuses with `email_exists` — so that case falls back to an ordinary
 * sign-in link, same as the login form sends.
 *
 * Owner only.
 */
export async function createInvite(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const session = await requireHouseholdSession();

  if (session.role !== "owner") {
    return { status: "error", message: "Only the household owner can invite people." };
  }

  const email = String(formData.get("email") ?? "").trim().toLowerCase();

  const supabase = await createClient();
  const { data: token, error } = await supabase.rpc("create_invite", { invite_email: email });

  if (error) {
    if (error.message.includes("invalid_email")) {
      return { status: "error", message: "That does not look like an email address." };
    }
    return { status: "error", message: "Could not create the invite." };
  }

  const origin = (await headers()).get("origin") ?? "";
  const redirectTo = `${origin}/invite/${token}`;

  const admin = createAdminClient();
  const { error: inviteEmailError } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo,
  });

  if (inviteEmailError) {
    if (inviteEmailError.code !== "email_exists") {
      console.error(
        `createInvite: inviteUserByEmail failed (code=${inviteEmailError.code}, status=${inviteEmailError.status}): ${inviteEmailError.message}`,
      );
      return {
        status: "error",
        message: "The invite was created but the email could not be sent. Try again.",
      };
    }

    // Already has an account — Supabase won't send an "invite" email to an
    // existing user, but a normal sign-in link lands them on the same
    // acceptance page just as well.
    const { error: otpError } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: redirectTo },
    });

    if (otpError) {
      console.error(
        `createInvite: signInWithOtp fallback failed (code=${otpError.code}, status=${otpError.status}): ${otpError.message}`,
      );
      return {
        status: "error",
        message: "The invite was created but the email could not be sent. Try again.",
      };
    }
  }

  revalidatePath("/settings");
  return { status: "saved" };
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
