"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireHouseholdSession } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { scaleIngredients } from "@/lib/recipe/scale";
import { canMerge, mergeAmounts, type MergeableLine } from "@/lib/shopping/merge";
import type { Recipe } from "@/lib/schemas/recipe";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

interface ActiveList {
  id: string;
}

/** One active list per household (FR9.1) — created on first use, not eagerly. */
async function activeList(supabase: SupabaseClient, householdId: string): Promise<ActiveList> {
  const { data: existing } = await supabase
    .from("shopping_lists")
    .select("id")
    .eq("household_id", householdId)
    .eq("status", "active")
    .maybeSingle();

  if (existing) return existing;

  const { data: created } = await supabase
    .from("shopping_lists")
    .insert({ household_id: householdId })
    .select("id")
    .single();

  return created!;
}

export async function ensureActiveList(): Promise<string> {
  const session = await requireHouseholdSession();
  const supabase = await createClient();
  return (await activeList(supabase, session.householdId)).id;
}

interface WorkingItem extends MergeableLine {
  id: string;
  source_recipe_ids: string[];
}

/**
 * Folds a set of ingredient lines into the list, merging into an existing
 * line where safe (FR9.3) and otherwise inserting a new one. `items` is
 * mutated in place so multiple calls in the same request see each other's
 * inserts — the common case is adding several recipes in one bulk action.
 */
async function foldIntoList(
  supabase: SupabaseClient,
  listId: string,
  userId: string,
  recipeId: string,
  ingredients: { item: string; amount: number | null; unit: string | null }[],
  items: WorkingItem[],
): Promise<void> {
  for (const ingredient of ingredients) {
    const candidate: MergeableLine = {
      item: ingredient.item,
      amount: ingredient.amount,
      unit: ingredient.unit,
    };

    const matchIndex = items.findIndex((row) => canMerge(candidate, row));

    if (matchIndex >= 0) {
      const match = items[matchIndex];
      const merged = mergeAmounts(candidate, match);
      const sourceIds = match.source_recipe_ids.includes(recipeId)
        ? match.source_recipe_ids
        : [...match.source_recipe_ids, recipeId];

      await supabase
        .from("list_items")
        .update({ amount: merged.amount, unit: merged.unit, source_recipe_ids: sourceIds })
        .eq("id", match.id);

      items[matchIndex] = { ...match, amount: merged.amount, unit: merged.unit, source_recipe_ids: sourceIds };
      continue;
    }

    const { data: created } = await supabase
      .from("list_items")
      .insert({
        list_id: listId,
        item: ingredient.item,
        amount: ingredient.amount,
        unit: ingredient.unit,
        source_recipe_ids: [recipeId],
        added_by: userId,
        is_manual: false,
      })
      .select("id, item, amount, unit, source_recipe_ids")
      .single();

    if (created) {
      items.push({ ...created, source_recipe_ids: created.source_recipe_ids ?? [] });
    }
  }
}

async function loadWorkingState(
  supabase: SupabaseClient,
  listId: string,
): Promise<{ items: WorkingItem[] }> {
  const { data: existingItems } = await supabase
    .from("list_items")
    .select("id, item, amount, unit, source_recipe_ids")
    .eq("list_id", listId);

  const items: WorkingItem[] = (existingItems ?? []).map((row) => ({
    ...row,
    source_recipe_ids: row.source_recipe_ids ?? [],
  }));

  return { items };
}

/** Add a recipe at a chosen serving count (FR9.2). */
export async function addRecipeToList(recipeId: string, servings: number): Promise<ActionResult> {
  const session = await requireHouseholdSession();
  const supabase = await createClient();

  const { data: recipeRow } = await supabase
    .from("recipes")
    .select("payload, base_servings")
    .eq("id", recipeId)
    .eq("household_id", session.householdId)
    .single();

  if (!recipeRow) return { ok: false, error: "Recipe not found." };

  const recipe = recipeRow.payload as Recipe;
  const scaled = scaleIngredients(recipe.ingredients, recipe.base_servings, servings);

  const list = await activeList(supabase, session.householdId);
  const { items } = await loadWorkingState(supabase, list.id);

  await foldIntoList(supabase, list.id, session.userId, recipeId, scaled, items);

  revalidatePath("/shop");
  return { ok: true };
}

/** Bulk add from selected recipes in the book — "build a list from these five" (FR9.2). */
export async function addRecipesToList(recipeIds: string[]): Promise<ActionResult> {
  const session = await requireHouseholdSession();
  const supabase = await createClient();

  const { data: recipeRows } = await supabase
    .from("recipes")
    .select("id, payload, base_servings")
    .eq("household_id", session.householdId)
    .in("id", recipeIds);

  if (!recipeRows || recipeRows.length === 0) return { ok: false, error: "Recipes not found." };

  const list = await activeList(supabase, session.householdId);
  const { items } = await loadWorkingState(supabase, list.id);

  for (const row of recipeRows) {
    const recipe = row.payload as Recipe;
    await foldIntoList(supabase, list.id, session.userId, row.id, recipe.ingredients, items);
  }

  revalidatePath("/shop");
  return { ok: true };
}

const manualItemSchema = z.object({
  item: z.string().min(1).max(120),
  amount: z.number().positive().nullable(),
  unit: z.string().max(40).nullable(),
});

/** Free-standing items with no recipe behind them (FR9.6). */
export async function addManualItem(
  item: string,
  amount: number | null,
  unit: string | null,
): Promise<ActionResult> {
  const parsed = manualItemSchema.safeParse({ item, amount, unit });
  if (!parsed.success) return { ok: false, error: "That item did not look right." };

  const session = await requireHouseholdSession();
  const supabase = await createClient();
  const list = await activeList(supabase, session.householdId);

  const { error } = await supabase.from("list_items").insert({
    list_id: list.id,
    item: parsed.data.item.trim(),
    amount: parsed.data.amount,
    unit: parsed.data.unit,
    source_recipe_ids: [],
    added_by: session.userId,
    is_manual: true,
  });

  if (error) return { ok: false, error: "Could not add that item." };

  revalidatePath("/shop");
  return { ok: true };
}

/** Tick state syncs via Realtime (FR9.7); this just records who and when. */
export async function toggleItemTicked(itemId: string, ticked: boolean): Promise<ActionResult> {
  const session = await requireHouseholdSession();
  const supabase = await createClient();

  const { error } = await supabase
    .from("list_items")
    .update({
      ticked,
      ticked_by: ticked ? session.userId : null,
      ticked_at: ticked ? new Date().toISOString() : null,
    })
    .eq("id", itemId);

  if (error) return { ok: false, error: "Could not update that item." };

  revalidatePath("/shop");
  return { ok: true };
}

export async function removeListItem(itemId: string): Promise<ActionResult> {
  await requireHouseholdSession();
  const supabase = await createClient();

  const { error } = await supabase.from("list_items").delete().eq("id", itemId);
  if (error) return { ok: false, error: "Could not remove that item." };

  revalidatePath("/shop");
  return { ok: true };
}

/**
 * Removing a recipe removes the right amount (FR9.4) for lines it is the
 * sole source of — those are deleted outright. A line shared with another
 * recipe on the list keeps its merged amount and simply drops this recipe
 * from its attribution; splitting a merged amount back out per contributor
 * would need a second table recording each recipe's original contribution,
 * which is more machinery than a two-person household's shopping list has
 * ever needed in practice (the same call as decision D1's dropped aisle
 * table). The uncommon case — two recipes on the list both needing onions —
 * is left slightly over-counted rather than silently wrong.
 */
export async function removeRecipeFromList(recipeId: string): Promise<ActionResult> {
  const session = await requireHouseholdSession();
  const supabase = await createClient();

  const list = await activeList(supabase, session.householdId);

  const { data: rows } = await supabase
    .from("list_items")
    .select("id, source_recipe_ids")
    .eq("list_id", list.id)
    .contains("source_recipe_ids", [recipeId]);

  for (const row of rows ?? []) {
    const remaining = ((row.source_recipe_ids as string[]) ?? []).filter((id) => id !== recipeId);

    if (remaining.length === 0) {
      await supabase.from("list_items").delete().eq("id", row.id);
    } else {
      await supabase.from("list_items").update({ source_recipe_ids: remaining }).eq("id", row.id);
    }
  }

  revalidatePath("/shop");
  return { ok: true };
}

/** Completes the active list; the next add starts a fresh one (FR9.1). */
export async function archiveActiveList(listId: string): Promise<ActionResult> {
  await requireHouseholdSession();
  const supabase = await createClient();

  const { error } = await supabase
    .from("shopping_lists")
    .update({ status: "archived", archived_at: new Date().toISOString() })
    .eq("id", listId);

  if (error) return { ok: false, error: "Could not archive the list." };

  revalidatePath("/shop");
  return { ok: true };
}
