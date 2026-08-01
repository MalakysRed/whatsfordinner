import { requireHouseholdSession } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { EmptyState } from "@/components/ui";
import type { IngredientRow } from "@/lib/db/types";
import { AddForms } from "./add-forms";
import { IngredientList } from "./ingredient-list";

export default async function IngredientsPage() {
  const session = await requireHouseholdSession();
  const supabase = await createClient();

  const { data } = await supabase
    .from("ingredients")
    .select("*")
    .eq("household_id", session.householdId)
    .order("name");

  const ingredients = (data ?? []) as IngredientRow[];

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Ingredient bank</h1>
        <p className="text-sm leading-relaxed text-muted">
          What you actually like. Suggestions lean on this list but will reach
          outside it when a dish needs to — anything new is flagged on the card.
        </p>
      </header>

      <AddForms bankIsEmpty={ingredients.length === 0} />

      {ingredients.length === 0 ? (
        <EmptyState title="Nothing in the bank yet">
          Load the starter set to get going, or add things as you think of them.
          An empty bank never blocks a suggestion — it just makes them vaguer.
        </EmptyState>
      ) : (
        <IngredientList ingredients={ingredients} />
      )}
    </div>
  );
}
