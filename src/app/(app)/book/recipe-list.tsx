"use client";

import { useState } from "react";
import Link from "next/link";
import { Avatar, Button, Card, Pill } from "@/components/ui";
import { formatMinutes } from "@/lib/recipe/render";
import type { Difficulty } from "@/lib/db/types";
import { addRecipesToList } from "../shop/actions";

export interface BookRecipeRow {
  id: string;
  title: string;
  description: string | null;
  cuisine: string | null;
  total_minutes: number | null;
  difficulty: Difficulty | null;
  addedByName: string;
  addedByColour: string | null;
  favouriteCount: number;
}

/**
 * "Build a list from these five" (FR9.2) — a lightweight select mode over the
 * same cards used for normal browsing, rather than a separate screen.
 */
export function RecipeList({ recipes }: { recipes: BookRecipeRow[] }) {
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [adding, setAdding] = useState(false);
  const [added, setAdded] = useState(false);

  function toggle(id: string) {
    setSelected((current) =>
      current.includes(id) ? current.filter((i) => i !== id) : [...current, id],
    );
  }

  async function onAddSelected() {
    if (selected.length === 0) return;
    setAdding(true);
    try {
      const result = await addRecipesToList(selected);
      if (result.ok) {
        setAdded(true);
        setSelected([]);
        setSelecting(false);
      }
    } finally {
      setAdding(false);
    }
  }

  return (
    <div className="space-y-3 pb-16">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => {
            setSelecting((v) => !v);
            setSelected([]);
          }}
          className="min-h-11 text-sm font-medium text-accent underline"
        >
          {selecting ? "Cancel" : "Select recipes for a list"}
        </button>
        {added && <Pill tone="success">Added to your list</Pill>}
      </div>

      <ul className="space-y-3">
        {recipes.map((recipe) => {
          const card = (
            <Card className="space-y-2 p-4">
              <div className="flex items-start justify-between gap-3">
                <h2 className="text-base font-semibold leading-tight">{recipe.title}</h2>
                <div className="flex shrink-0 items-center gap-2">
                  {selecting && (
                    <input
                      type="checkbox"
                      checked={selected.includes(recipe.id)}
                      onChange={() => toggle(recipe.id)}
                      aria-label={`Select ${recipe.title}`}
                      className="size-5 accent-[var(--accent)]"
                    />
                  )}
                  <Avatar name={recipe.addedByName} colour={recipe.addedByColour} />
                </div>
              </div>

              {recipe.description && (
                <p className="line-clamp-2 text-sm leading-relaxed text-muted">
                  {recipe.description}
                </p>
              )}

              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
                {recipe.cuisine && <span>{recipe.cuisine}</span>}
                {recipe.total_minutes !== null && <span>{formatMinutes(recipe.total_minutes)}</span>}
                {recipe.difficulty && <span>{recipe.difficulty}</span>}
                {recipe.favouriteCount > 0 && (
                  <Pill tone="accent">
                    {recipe.favouriteCount === 1 ? "Favourited" : "Favourited by both"}
                  </Pill>
                )}
              </div>
            </Card>
          );

          return (
            <li key={recipe.id}>
              {selecting ? (
                <button type="button" onClick={() => toggle(recipe.id)} className="block w-full text-left">
                  {card}
                </button>
              ) : (
                <Link href={`/book/${recipe.id}`}>{card}</Link>
              )}
            </li>
          );
        })}
      </ul>

      {selecting && selected.length > 0 && (
        <div className="fixed inset-x-0 bottom-14 border-t border-line bg-raised/95 px-5 py-3 backdrop-blur">
          <div className="mx-auto w-full max-w-md">
            <Button
              type="button"
              onClick={() => void onAddSelected()}
              disabled={adding}
              className="w-full"
            >
              {adding ? "Adding…" : `Add ${selected.length} to shopping list`}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
