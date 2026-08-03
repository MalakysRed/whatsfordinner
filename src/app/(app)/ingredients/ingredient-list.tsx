"use client";

import { useMemo, useState } from "react";
import { Card, Pill } from "@/components/ui";
import { CATEGORY_LABELS, INGREDIENT_CATEGORIES } from "@/lib/db/types";
import type { IngredientCategory, IngredientRow } from "@/lib/db/types";
import { deleteIngredient, renameIngredient, updateIngredientFlags } from "./actions";

type SortBy = "name" | "most_used";

/**
 * The bank, with search, category filter and sort (FR3.5).
 *
 * Filtering happens in the browser over the household's own list — a couple of
 * hundred rows at most — so typing stays instant and costs no round trip.
 */
export function IngredientList({ ingredients }: { ingredients: IngredientRow[] }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<IngredientCategory | "all">("all");
  const [sortBy, setSortBy] = useState<SortBy>("name");
  const [expanded, setExpanded] = useState<string | null>(null);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();

    return ingredients
      .filter((i) => (category === "all" ? true : i.category === category))
      .filter((i) => (needle ? i.name.toLowerCase().includes(needle) : true))
      .sort((a, b) =>
        sortBy === "most_used"
          ? b.use_count - a.use_count || a.name.localeCompare(b.name)
          : a.name.localeCompare(b.name),
      );
  }, [ingredients, query, category, sortBy]);

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search the bank"
          aria-label="Search ingredients"
          className="w-full rounded-xl border border-line bg-raised px-4 py-3 text-base outline-none focus:border-accent"
        />

        <div className="flex gap-2">
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as IngredientCategory | "all")}
            aria-label="Filter by category"
            className="min-h-11 flex-1 appearance-none rounded-xl border border-line bg-raised px-3 py-2 text-sm outline-none focus:border-accent"
          >
            <option value="all">All categories</option>
            {INGREDIENT_CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>

          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortBy)}
            aria-label="Sort"
            className="min-h-11 appearance-none rounded-xl border border-line bg-raised px-3 py-2 text-sm outline-none focus:border-accent"
          >
            <option value="name">A–Z</option>
            <option value="most_used">Most used</option>
          </select>
        </div>
      </div>

      <p className="text-sm text-muted">
        {visible.length} of {ingredients.length}
      </p>

      <Card className="divide-y divide-line">
        {visible.map((ingredient) => {
          const isOpen = expanded === ingredient.id;

          return (
            <div key={ingredient.id}>
              <button
                type="button"
                onClick={() => setExpanded(isOpen ? null : ingredient.id)}
                aria-expanded={isOpen}
                className="flex min-h-12 w-full items-center justify-between gap-3 px-4 py-3 text-left"
              >
                <span className="text-base">{ingredient.name}</span>
                <span className="flex shrink-0 gap-1">
                  {ingredient.allergen && <Pill tone="danger">Allergen</Pill>}
                  {ingredient.disliked && <Pill tone="danger">No</Pill>}
                  {ingredient.loved && <Pill tone="accent">Loved</Pill>}
                  {ingredient.staple && <Pill>Staple</Pill>}
                </span>
              </button>

              {isOpen && (
                <div className="space-y-3 border-t border-line px-4 py-4">
                  <p className="text-sm text-muted">
                    {CATEGORY_LABELS[ingredient.category]}
                    {ingredient.typical_unit && ` · usually in ${ingredient.typical_unit}`}
                  </p>

                  <form action={renameIngredient} className="flex gap-2">
                    <input type="hidden" name="id" value={ingredient.id} />
                    <input
                      name="name"
                      defaultValue={ingredient.name}
                      maxLength={80}
                      aria-label={`Rename ${ingredient.name}`}
                      className="min-h-11 flex-1 rounded-xl border border-line bg-background px-3 py-2 text-base outline-none focus:border-accent"
                    />
                    <button
                      type="submit"
                      className="min-h-11 shrink-0 rounded-xl border border-line px-4 py-2 text-sm font-medium"
                    >
                      Rename
                    </button>
                  </form>

                  <form action={updateIngredientFlags} className="space-y-3">
                    <input type="hidden" name="id" value={ingredient.id} />

                    <FlagBox
                      name="loved"
                      label="Loved"
                      hint="Comes up more often."
                      defaultChecked={ingredient.loved}
                    />
                    <FlagBox
                      name="staple"
                      label="Staple"
                      hint="Assumed to be in the cupboard, so it stays off shopping lists."
                      defaultChecked={ingredient.staple}
                    />
                    <FlagBox
                      name="disliked"
                      label="Never suggest"
                      hint="Excluded from everything."
                      defaultChecked={ingredient.disliked}
                    />
                    <FlagBox
                      name="allergen"
                      label="Allergen"
                      hint="Hard exclusion, checked in code after every generation."
                      defaultChecked={ingredient.allergen}
                    />

                    <button
                      type="submit"
                      className="min-h-11 rounded-xl bg-accent px-4 py-2.5 text-sm font-medium text-on-accent"
                    >
                      Save
                    </button>
                  </form>

                  <form action={deleteIngredient}>
                    <input type="hidden" name="id" value={ingredient.id} />
                    <button
                      type="submit"
                      className="min-h-11 text-sm text-danger underline"
                    >
                      Remove from bank
                    </button>
                  </form>
                </div>
              )}
            </div>
          );
        })}

        {visible.length === 0 && (
          <p className="p-6 text-center text-sm text-muted">
            Nothing matches that.
          </p>
        )}
      </Card>
    </div>
  );
}

function FlagBox({
  name,
  label,
  hint,
  defaultChecked,
}: {
  name: string;
  label: string;
  hint: string;
  defaultChecked: boolean;
}) {
  return (
    <label className="flex items-start gap-3">
      <input
        type="checkbox"
        name={name}
        defaultChecked={defaultChecked}
        className="mt-0.5 size-5 shrink-0 accent-[var(--accent)]"
      />
      <span className="text-base leading-6">
        {label}
        <span className="block text-sm text-muted">{hint}</span>
      </span>
    </label>
  );
}
