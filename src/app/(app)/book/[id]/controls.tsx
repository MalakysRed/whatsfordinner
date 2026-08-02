"use client";

import { useState } from "react";
import { Button, Card, Pill, Textarea } from "@/components/ui";
import { downloadRecipeMarkdown } from "@/lib/recipe/export";
import type { Recipe } from "@/lib/schemas/recipe";
import { toggleFavourite, markAsCooked } from "../actions";
import { addRecipeToList } from "../../shop/actions";

export function RecipeBookControls({
  recipe,
  recipeId,
  initialFavourited,
  defaultServings,
}: {
  recipe: Recipe;
  recipeId: string;
  initialFavourited: boolean;
  defaultServings: number;
}) {
  const [favourited, setFavourited] = useState(initialFavourited);
  const [togglingFav, setTogglingFav] = useState(false);
  const [showCookForm, setShowCookForm] = useState(false);
  const [rating, setRating] = useState<number | null>(null);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [cookedJustNow, setCookedJustNow] = useState(false);
  const [addingToList, setAddingToList] = useState(false);
  const [addedToList, setAddedToList] = useState(false);

  async function onToggleFavourite() {
    setTogglingFav(true);
    try {
      const result = await toggleFavourite(recipeId);
      if (result.ok) setFavourited(result.favourited);
    } finally {
      setTogglingFav(false);
    }
  }

  async function onMarkCooked() {
    setSaving(true);
    try {
      const result = await markAsCooked(recipeId, defaultServings, rating, note.trim() || null);
      if (result.ok) {
        setCookedJustNow(true);
        setShowCookForm(false);
        setNote("");
        setRating(null);
      }
    } finally {
      setSaving(false);
    }
  }

  async function onAddToList() {
    setAddingToList(true);
    try {
      const result = await addRecipeToList(recipeId, defaultServings);
      if (result.ok) setAddedToList(true);
    } finally {
      setAddingToList(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Button
          type="button"
          variant={favourited ? "primary" : "secondary"}
          onClick={() => void onToggleFavourite()}
          disabled={togglingFav}
          className="flex-1"
        >
          {favourited ? "Favourited" : "Favourite"}
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={() => setShowCookForm((v) => !v)}
          className="flex-1"
        >
          Mark as cooked
        </Button>
      </div>

      <div className="flex gap-2">
        <Button
          type="button"
          variant="secondary"
          onClick={() => void onAddToList()}
          disabled={addingToList}
          className="flex-1"
        >
          {addingToList ? "Adding…" : addedToList ? "Added to list" : "Add to shopping list"}
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={() => downloadRecipeMarkdown(recipe)}
        >
          Export
        </Button>
      </div>

      {cookedJustNow && <Pill tone="success">Logged — thanks</Pill>}

      {showCookForm && (
        <Card className="space-y-3 p-4">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">Rating</span>
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setRating(rating === n ? null : n)}
                  aria-label={`${n} star${n === 1 ? "" : "s"}`}
                  className={`size-8 rounded-lg border text-sm ${
                    rating !== null && n <= rating
                      ? "border-accent bg-accent text-on-accent"
                      : "border-line"
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Anything worth remembering for next time?"
            rows={3}
          />
          <Button
            type="button"
            onClick={() => void onMarkCooked()}
            disabled={saving}
            className="w-full"
          >
            {saving ? "Saving…" : "Save"}
          </Button>
        </Card>
      )}
    </div>
  );
}
