"use server";

import { revalidatePath } from "next/cache";
import { requireHouseholdSession } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import {
  generationSchema,
  householdDefaultsSchema,
  measurementsSchema,
  shoppingSchema,
  varietySchema,
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

/** FR2.7 — suggestion variety. */
export async function saveVariety(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const session = await requireHouseholdSession();

  const parsed = varietySchema.safeParse({
    only_new: checked(formData, "only_new"),
    recency_weighting: formData.get("recency_weighting"),
    recency_window_days: Number(formData.get("recency_window_days")),
    include_favourites: checked(formData, "include_favourites"),
  });

  if (!parsed.success) {
    return { status: "error", message: "The window must be between 1 and 90 days." };
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

/** FR1.3 — a 7 day invite link. Owner only. */
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
  const { error } = await supabase.rpc("create_invite", { invite_email: email });

  if (error) {
    if (error.message.includes("invalid_email")) {
      return { status: "error", message: "That does not look like an email address." };
    }
    return { status: "error", message: "Could not create the invite." };
  }

  revalidatePath("/settings");
  return { status: "saved" };
}
