import { requireHouseholdSession } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { EmptyState } from "@/components/ui";
import type { Difficulty } from "@/lib/db/types";
import { BookFilters } from "./filters";
import { RecipeList, type BookRecipeRow } from "./recipe-list";

interface RecipeListRow {
  id: string;
  title: string;
  description: string | null;
  cuisine: string | null;
  total_minutes: number | null;
  difficulty: Difficulty | null;
  created_by: string;
  favourites: { user_id: string }[];
}

interface Member {
  user_id: string;
  users: { display_name: string | null; avatar_colour: string | null } | null;
}

/**
 * The recipe book (PRD 8). Filters live in the URL and drive a server-side
 * query — the new `search` column carries the free-text box, everything else
 * is a plain column filter. Favourited-by is resolved in application code
 * after the fetch: PostgREST can filter *that* a related row exists, but not
 * cleanly express "favourited by both of exactly these two users" as a
 * single query, and a household's saved recipes are never large enough for
 * that to matter.
 */
export default async function BookPage({
  searchParams,
}: {
  searchParams: Promise<{
    favourited?: string;
    cuisine?: string;
    time?: string;
    added_by?: string;
    q?: string;
  }>;
}) {
  const session = await requireHouseholdSession();
  const params = await searchParams;
  const supabase = await createClient();

  let query = supabase
    .from("recipes")
    .select(
      "id, title, description, cuisine, total_minutes, difficulty, created_by, favourites(user_id)",
    )
    .eq("household_id", session.householdId)
    .order("created_at", { ascending: false });

  if (params.cuisine) query = query.eq("cuisine", params.cuisine);
  if (params.time) query = query.lte("total_minutes", Number(params.time));
  if (params.added_by === "me") query = query.eq("created_by", session.userId);
  if (params.added_by === "other") query = query.neq("created_by", session.userId);
  if (params.q?.trim()) {
    query = query.textSearch("search", params.q.trim(), { type: "websearch" });
  }

  const [{ data }, { data: members }] = await Promise.all([
    query,
    supabase
      .from("memberships")
      .select("user_id, users(display_name, avatar_colour)")
      .eq("household_id", session.householdId),
  ]);

  let recipes = (data ?? []) as unknown as RecipeListRow[];

  if (params.favourited === "me") {
    recipes = recipes.filter((r) => r.favourites.some((f) => f.user_id === session.userId));
  } else if (params.favourited === "other") {
    recipes = recipes.filter((r) => r.favourites.some((f) => f.user_id !== session.userId));
  } else if (params.favourited === "both") {
    recipes = recipes.filter((r) => new Set(r.favourites.map((f) => f.user_id)).size >= 2);
  }

  const memberMap = new Map(
    ((members ?? []) as unknown as Member[]).map((m) => [m.user_id, m.users]),
  );

  const rows: BookRecipeRow[] = recipes.map((recipe) => {
    const addedBy = memberMap.get(recipe.created_by);
    return {
      id: recipe.id,
      title: recipe.title,
      description: recipe.description,
      cuisine: recipe.cuisine,
      total_minutes: recipe.total_minutes,
      difficulty: recipe.difficulty,
      addedByName: addedBy?.display_name ?? "?",
      addedByColour: addedBy?.avatar_colour ?? null,
      favouriteCount: recipe.favourites.length,
    };
  });

  return (
    <div className="space-y-5">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Recipe book</h1>
        <p className="text-sm leading-relaxed text-muted">Everything you&rsquo;ve saved.</p>
      </header>

      <BookFilters
        favourited={params.favourited ?? ""}
        cuisine={params.cuisine ?? ""}
        addedBy={params.added_by ?? ""}
        time={params.time ?? ""}
        q={params.q ?? ""}
      />

      {rows.length === 0 ? (
        <EmptyState title="Nothing saved yet">
          Save a recipe card from a suggestion and it turns up here.
        </EmptyState>
      ) : (
        <RecipeList recipes={rows} />
      )}
    </div>
  );
}
