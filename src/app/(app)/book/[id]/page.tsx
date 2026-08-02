import Link from "next/link";
import { notFound } from "next/navigation";
import { requireHouseholdSession } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui";
import { RecipeCard } from "@/components/recipe-card";
import type { UnitPrefs } from "@/lib/recipe/scale";
import type { Recipe } from "@/lib/schemas/recipe";
import { RecipeBookControls } from "./controls";

interface Member {
  user_id: string;
  users: { display_name: string | null } | null;
}

export default async function BookRecipePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireHouseholdSession();
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: recipeRow }, { data: settings }, { data: favourites }, { data: cookLog }, { data: members }] =
    await Promise.all([
      supabase
        .from("recipes")
        .select("id, payload, created_by")
        .eq("id", id)
        .eq("household_id", session.householdId)
        .maybeSingle(),
      supabase
        .from("settings")
        .select("units_weight, units_volume, units_temp, units_length, show_gas_mark")
        .eq("household_id", session.householdId)
        .single(),
      supabase.from("favourites").select("user_id").eq("recipe_id", id),
      supabase
        .from("cook_log")
        .select("cooked_at, note")
        .eq("recipe_id", id)
        .order("cooked_at", { ascending: false })
        .limit(1),
      supabase
        .from("memberships")
        .select("user_id, users(display_name)")
        .eq("household_id", session.householdId),
    ]);

  if (!recipeRow) notFound();

  const recipe = recipeRow.payload as Recipe;
  const isFavourited = (favourites ?? []).some((f) => f.user_id === session.userId);
  const lastNote = cookLog?.[0]?.note ?? null;

  const memberMap = new Map(
    ((members ?? []) as unknown as Member[]).map((m) => [m.user_id, m.users?.display_name]),
  );
  const addedBy = memberMap.get(recipeRow.created_by) ?? "someone";

  return (
    <div className="space-y-5">
      <Link href="/book" className="min-h-11 text-sm text-muted underline">
        Back to the book
      </Link>

      <p className="text-sm text-muted">Added by {addedBy}</p>

      {lastNote && (
        <Card className="p-4">
          <p className="text-sm leading-relaxed">
            <span className="font-medium">Last time: </span>
            {lastNote}
          </p>
        </Card>
      )}

      <RecipeBookControls
        recipe={recipe}
        recipeId={recipeRow.id}
        initialFavourited={isFavourited}
        defaultServings={recipe.base_servings}
      />

      <RecipeCard recipe={recipe} unitPrefs={(settings as UnitPrefs) ?? undefined} />
    </div>
  );
}
