import { requireHouseholdSession } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { ensureActiveList } from "./actions";
import { ShoppingList } from "./shopping-list";

export interface ShopListItem {
  id: string;
  item: string;
  amount: number | null;
  unit: string | null;
  source_recipe_ids: string[];
  added_by: string;
  ticked: boolean;
  ticked_by: string | null;
  is_manual: boolean;
}

/**
 * The shopping list (PRD 8.9). One active list per household, created lazily
 * on first visit or first add — a household that has never used it should
 * not find an empty row sitting in the database.
 */
export default async function ShopPage() {
  const session = await requireHouseholdSession();
  const listId = await ensureActiveList();
  const supabase = await createClient();

  const [{ data: items }, { data: settings }, { data: recipes }] = await Promise.all([
    supabase
      .from("list_items")
      .select("id, item, amount, unit, source_recipe_ids, added_by, ticked, ticked_by, is_manual")
      .eq("list_id", listId)
      .order("created_at"),
    supabase
      .from("settings")
      .select("supermarket, delivery_day, shopping_notes")
      .eq("household_id", session.householdId)
      .single(),
    supabase.from("recipes").select("id, title").eq("household_id", session.householdId),
  ]);

  const recipeTitles = Object.fromEntries((recipes ?? []).map((r) => [r.id as string, r.title as string]));

  return (
    <div className="space-y-5">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Shopping list</h1>
        <p className="text-sm leading-relaxed text-muted">
          Synced between you both, live — tick something off in the shop and it
          ticks off at home too.
        </p>
      </header>

      <ShoppingList
        listId={listId}
        initialItems={(items ?? []) as ShopListItem[]}
        settings={settings ?? { supermarket: null, delivery_day: null, shopping_notes: null }}
        recipeTitles={recipeTitles}
      />
    </div>
  );
}
