"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireHouseholdSession } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { recipeSchema, type Recipe } from "@/lib/schemas/recipe";
import type { MealType } from "@/lib/db/types";

const V1_MEAL_TYPE: MealType = "dinner";

export interface ActionResult {
  ok: boolean;
  recipeId?: string;
  error?: string;
}

/**
 * Writes the generated card as an immutable artefact (PRD 8) — `payload` holds
 * the full recipe JSON and is never rewritten by later changes to the
 * ingredient bank. Denormalized columns exist purely for listing, filtering
 * and search; `payload` is what actually renders.
 */
export async function saveRecipe(
  recipe: Recipe,
  sourceSuggestionId: string | null,
  generationId: string | null,
  favouriteNow: boolean,
): Promise<ActionResult> {
  const parsed = recipeSchema.safeParse(recipe);
  if (!parsed.success) return { ok: false, error: "That recipe did not look right." };

  const session = await requireHouseholdSession();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("recipes")
    .insert({
      household_id: session.householdId,
      created_by: session.userId,
      meal_type: V1_MEAL_TYPE,
      title: parsed.data.title,
      description: parsed.data.description,
      cuisine: parsed.data.cuisine,
      base_servings: parsed.data.base_servings,
      total_minutes: parsed.data.total_minutes,
      active_minutes: parsed.data.active_minutes,
      difficulty: parsed.data.difficulty,
      payload: parsed.data,
      source_suggestion_id: sourceSuggestionId,
      generation_id: generationId,
    })
    .select("id")
    .single();

  if (error || !data) return { ok: false, error: "Could not save. Try again." };

  if (favouriteNow) {
    await supabase.from("favourites").insert({ recipe_id: data.id, user_id: session.userId });
  }

  revalidatePath("/book");
  return { ok: true, recipeId: data.id };
}

/**
 * Per-user (FR8's "favourited by X and Y" attribution) — a recipe can be
 * favourited by one, both or neither member independently.
 */
export async function toggleFavourite(
  recipeId: string,
): Promise<{ ok: boolean; favourited: boolean }> {
  const session = await requireHouseholdSession();
  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("favourites")
    .select("recipe_id")
    .eq("recipe_id", recipeId)
    .eq("user_id", session.userId)
    .maybeSingle();

  if (existing) {
    await supabase
      .from("favourites")
      .delete()
      .eq("recipe_id", recipeId)
      .eq("user_id", session.userId);

    revalidatePath("/book");
    revalidatePath(`/book/${recipeId}`);
    return { ok: true, favourited: false };
  }

  await supabase.from("favourites").insert({ recipe_id: recipeId, user_id: session.userId });

  revalidatePath("/book");
  revalidatePath(`/book/${recipeId}`);
  return { ok: true, favourited: true };
}

const editSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional(),
  ingredients: z
    .array(
      z.object({
        id: z.string(),
        amount: z.number().nullable(),
        unit: z.string().nullable(),
      }),
    )
    .optional(),
});

export type RecipeEditPatch = z.infer<typeof editSchema>;

/**
 * Scoped to the fields most likely to need correcting after the fact — title,
 * description, an ingredient amount that came out wrong — not a full recipe
 * editor.
 */
export async function editRecipe(
  recipeId: string,
  patch: RecipeEditPatch,
): Promise<ActionResult> {
  const parsed = editSchema.safeParse(patch);
  if (!parsed.success) return { ok: false, error: "That edit did not look right." };

  const session = await requireHouseholdSession();
  const supabase = await createClient();

  const { data: current } = await supabase
    .from("recipes")
    .select("payload")
    .eq("id", recipeId)
    .single();

  if (!current) return { ok: false, error: "Recipe not found." };

  const payload = current.payload as Recipe;
  const nextPayload: Recipe = {
    ...payload,
    title: parsed.data.title ?? payload.title,
    description: parsed.data.description ?? payload.description,
    ingredients: payload.ingredients.map((ingredient) => {
      const override = parsed.data.ingredients?.find((i) => i.id === ingredient.id);
      return override
        ? { ...ingredient, amount: override.amount, unit: override.unit }
        : ingredient;
    }),
  };

  const { error } = await supabase
    .from("recipes")
    .update({
      title: nextPayload.title,
      description: nextPayload.description,
      payload: nextPayload,
      edited_by: session.userId,
      edited_at: new Date().toISOString(),
    })
    .eq("id", recipeId);

  if (error) return { ok: false, error: "Could not save the edit." };

  revalidatePath(`/book/${recipeId}`);
  revalidatePath("/book");
  return { ok: true, recipeId };
}

const cookedSchema = z.object({
  servings: z.number().int().min(1).max(12).nullable(),
  rating: z.number().int().min(1).max(5).nullable(),
  note: z.string().max(1000).nullable(),
});

/** Household-wide: cooked by either member counts as cooked for both (FR2.10). */
export async function markAsCooked(
  recipeId: string,
  servings: number | null,
  rating: number | null,
  note: string | null,
): Promise<ActionResult> {
  const parsed = cookedSchema.safeParse({ servings, rating, note });
  if (!parsed.success) return { ok: false, error: "That did not look right." };

  const session = await requireHouseholdSession();
  const supabase = await createClient();

  const { error } = await supabase.from("cook_log").insert({
    recipe_id: recipeId,
    household_id: session.householdId,
    meal_type: V1_MEAL_TYPE,
    cooked_by: session.userId,
    servings: parsed.data.servings,
    rating: parsed.data.rating,
    note: parsed.data.note,
  });

  if (error) return { ok: false, error: "Could not log this. Try again." };

  revalidatePath(`/book/${recipeId}`);
  revalidatePath("/book");
  return { ok: true, recipeId };
}
