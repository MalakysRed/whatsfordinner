"use server";

import { revalidatePath } from "next/cache";
import { requireHouseholdSession } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import type { IngredientCategory } from "@/lib/db/types";

export interface BankResult {
  status: "idle" | "saved" | "error";
  message?: string;
}

const CATEGORIES: IngredientCategory[] = [
  "animal_protein",
  "plant_protein",
  "healthy_fat",
  "complex_carb",
  "vegetable",
  "fruit",
  "dairy",
  "herb_and_spice",
  "pantry",
  "condiment",
];

/**
 * Flags drive generation: disliked and allergen are exclusions, loved raises
 * weighting, staple keeps it off shopping lists (FR3.2).
 */
export async function updateIngredientFlags(formData: FormData): Promise<void> {
  const session = await requireHouseholdSession();
  const id = String(formData.get("id") ?? "");

  const supabase = await createClient();
  await supabase
    .from("ingredients")
    .update({
      loved: formData.get("loved") === "on",
      disliked: formData.get("disliked") === "on",
      staple: formData.get("staple") === "on",
      allergen: formData.get("allergen") === "on",
    })
    .eq("id", id)
    .eq("household_id", session.householdId);

  revalidatePath("/ingredients");
}

/**
 * FR3.7 — deleting an ingredient must not break saved recipes. It cannot:
 * recipes keep their own ingredient text in the payload rather than pointing at
 * rows in this table.
 */
export async function deleteIngredient(formData: FormData): Promise<void> {
  const session = await requireHouseholdSession();
  const id = String(formData.get("id") ?? "");

  const supabase = await createClient();
  await supabase
    .from("ingredients")
    .delete()
    .eq("id", id)
    .eq("household_id", session.householdId);

  revalidatePath("/ingredients");
}

export async function addIngredient(
  _prev: BankResult,
  formData: FormData,
): Promise<BankResult> {
  const session = await requireHouseholdSession();

  const name = String(formData.get("name") ?? "").trim();
  const category = String(formData.get("category") ?? "") as IngredientCategory;

  if (!name) return { status: "error", message: "Give it a name." };
  if (!CATEGORIES.includes(category)) {
    return { status: "error", message: "Pick a category." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("ingredients").insert({
    household_id: session.householdId,
    name,
    category,
  });

  if (error) {
    if (error.code === "23505") {
      return { status: "error", message: `${name} is already in the bank.` };
    }
    return { status: "error", message: "Could not add that." };
  }

  revalidatePath("/ingredients");
  return { status: "saved" };
}

/**
 * FR3.4 — paste a list. One per line, or comma separated.
 *
 * Everything lands in one category rather than being guessed at, because a
 * wrong guess is more annoying to fix than picking once up front. No API call:
 * categorising a shopping list is not worth a token.
 */
export async function bulkAddIngredients(
  _prev: BankResult,
  formData: FormData,
): Promise<BankResult> {
  const session = await requireHouseholdSession();

  const category = String(formData.get("category") ?? "") as IngredientCategory;
  const raw = String(formData.get("names") ?? "");

  if (!CATEGORIES.includes(category)) {
    return { status: "error", message: "Pick a category." };
  }

  const names = Array.from(
    new Set(
      raw
        .split(/[\n,]/)
        .map((n) => n.trim())
        .filter(Boolean),
    ),
  );

  if (names.length === 0) {
    return { status: "error", message: "Nothing to add." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("ingredients").upsert(
    names.map((name) => ({
      household_id: session.householdId,
      name,
      category,
    })),
    { onConflict: "household_id,name", ignoreDuplicates: true },
  );

  if (error) return { status: "error", message: "Could not add those." };

  revalidatePath("/ingredients");
  return {
    status: "saved",
    message: `Added ${names.length} ${names.length === 1 ? "ingredient" : "ingredients"}.`,
  };
}

/** Top up from the starter catalogue. Existing names are left alone. */
export async function adoptStarters(_prev: BankResult): Promise<BankResult> {
  await requireHouseholdSession();

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("adopt_starter_ingredients", {
    names: null,
  });

  if (error) return { status: "error", message: "Could not load the starter set." };

  revalidatePath("/ingredients");
  return {
    status: "saved",
    message: data === 0 ? "You already have all of them." : `Added ${data}.`,
  };
}
