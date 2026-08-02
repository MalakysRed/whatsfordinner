"use client";

import { useMemo, useState } from "react";
import { Card, Pill } from "@/components/ui";
import { formatMinutes, formatQuantity, renderStepText } from "@/lib/recipe/render";
import {
  METRIC_PREFS,
  convertForDisplay,
  convertTemperature,
  needsRecheck,
  scaleIngredients,
  type UnitPrefs,
} from "@/lib/recipe/scale";
import type { Recipe } from "@/lib/schemas/recipe";
import type { Suggestion } from "@/lib/schemas/suggestion";

/**
 * Metric/imperial for the on-card toggle, folded into one flip rather than
 * four independent family toggles. Settings still stores per-family
 * preferences (PRD FR2.2) — this is the quick "just show me the other one"
 * override for someone standing in a kitchen, not a replacement for that
 * screen. UK pints unless the household opted into US cups in settings, which
 * this toggle preserves rather than overrides.
 */
function effectivePrefs(base: UnitPrefs, useImperial: boolean): UnitPrefs {
  if (!useImperial) return METRIC_PREFS;
  return {
    units_weight: "imperial",
    units_volume: base.units_volume === "us_cups" ? "us_cups" : "imperial",
    units_temp: "f",
    units_length: "inches",
    show_gas_mark: base.show_gas_mark,
  };
}

/**
 * The recipe card.
 *
 * `recipe` is the starting point, not the only thing ever shown: an
 * accepted "re-check this recipe" offer (FR5.4) replaces it with a revised
 * version from `/api/recipe/revise`, kept as local state. `suggestion` is
 * only present in the live generation flow — it's what the revise call needs
 * — so it's optional and the re-check offer simply doesn't appear when the
 * card is opened from the saved recipe book instead.
 */
export function RecipeCard({
  recipe: initialRecipe,
  suggestion = null,
  unitPrefs = METRIC_PREFS,
}: {
  recipe: Recipe;
  suggestion?: Suggestion | null;
  unitPrefs?: UnitPrefs;
}) {
  const [recipe, setRecipe] = useState(initialRecipe);
  const [servings, setServings] = useState(initialRecipe.base_servings);
  const [useImperial, setUseImperial] = useState(unitPrefs.units_weight === "imperial");
  const [showRecheck, setShowRecheck] = useState(false);
  const [revising, setRevising] = useState(false);
  const [reviseError, setReviseError] = useState<string | null>(null);

  const prefs = effectivePrefs(unitPrefs, useImperial);
  const notInBank = recipe.ingredients.filter((i) => !i.in_bank);

  // Scale first, then convert for display — scaling operates on the
  // canonical metric amount (FR5.1); conversion is purely cosmetic and never
  // touches what gets sent to /api/recipe/revise.
  const displayIngredients = useMemo(() => {
    const scaled = scaleIngredients(recipe.ingredients, recipe.base_servings, servings);
    return scaled.map((ingredient) => {
      if (ingredient.amount === null || !ingredient.unit) return ingredient;
      const converted = convertForDisplay(ingredient.amount, ingredient.unit, prefs);
      return { ...ingredient, amount: converted.amount, unit: converted.unit };
    });
  }, [recipe, servings, prefs]);

  function adjustServings(next: number) {
    const clamped = Math.min(12, Math.max(1, next));
    setServings(clamped);
    setShowRecheck(needsRecheck(recipe.base_servings, clamped));
  }

  async function recheck() {
    if (!suggestion) return;
    setRevising(true);
    setReviseError(null);

    try {
      const response = await fetch("/api/recipe/revise", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ suggestion, previous: recipe, servings, feedback: null }),
      });
      const body = await response.json();

      if (!response.ok) {
        setReviseError(body.error ?? "Could not re-check the recipe.");
        return;
      }

      setRecipe(body.recipe);
      setServings(body.recipe.base_servings);
      setShowRecheck(false);
    } catch {
      setReviseError("Could not reach the app. Check your connection.");
    } finally {
      setRevising(false);
    }
  }

  return (
    <article className="space-y-6">
      <header className="space-y-3">
        <div className="space-y-2">
          <h2 className="text-2xl font-semibold leading-tight tracking-tight">
            {recipe.title}
          </h2>
          <p className="text-base leading-relaxed text-muted">{recipe.description}</p>

          <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted">
            <span>{recipe.cuisine}</span>
            <span>{formatMinutes(recipe.total_minutes)} total</span>
            <span>{formatMinutes(recipe.active_minutes)} hands on</span>
            <span>{recipe.difficulty}</span>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 rounded-xl border border-line px-3 py-2">
          <span className="text-sm font-medium">Servings</span>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => adjustServings(servings - 1)}
              aria-label="Fewer servings"
              className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-line text-lg"
            >
              −
            </button>
            <span className="w-6 text-center text-base font-medium tabular-nums">
              {servings}
            </span>
            <button
              type="button"
              onClick={() => adjustServings(servings + 1)}
              aria-label="More servings"
              className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-line text-lg"
            >
              +
            </button>
          </div>
          <button
            type="button"
            onClick={() => setUseImperial((v) => !v)}
            className="shrink-0 text-sm font-medium text-accent underline"
          >
            {useImperial ? "Imperial" : "Metric"}
          </button>
        </div>

        {showRecheck && suggestion && (
          <Card className="space-y-3 p-4">
            <p className="text-sm leading-relaxed">
              That&rsquo;s a big change in servings — pan sizes and seasoning may
              not scale evenly from here. Want the recipe rechecked at{" "}
              {servings}?
            </p>
            {reviseError && (
              <p role="alert" className="text-sm text-danger">
                {reviseError}
              </p>
            )}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => void recheck()}
                disabled={revising}
                className="min-h-11 flex-1 rounded-xl bg-accent px-4 py-2.5 text-sm font-medium text-on-accent disabled:opacity-60"
              >
                {revising ? "Checking…" : "Re-check recipe"}
              </button>
              <button
                type="button"
                onClick={() => setShowRecheck(false)}
                className="min-h-11 rounded-xl border border-line px-4 py-2.5 text-sm font-medium"
              >
                No thanks
              </button>
            </div>
          </Card>
        )}
      </header>

      {recipe.equipment.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-muted">
            You will need
          </h3>
          <p className="text-base">{recipe.equipment.join(", ")}</p>
        </section>
      )}

      <section className="space-y-3">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted">
          Ingredients
        </h3>

        <Card className="divide-y divide-line">
          {displayIngredients.map((ingredient) => (
            <div key={ingredient.id} className="flex items-baseline gap-3 px-4 py-3">
              <span className="text-base">
                {formatQuantity(ingredient)}
                {ingredient.prep && (
                  <span className="text-muted">, {ingredient.prep}</span>
                )}
                {ingredient.optional && (
                  <span className="text-muted"> (optional)</span>
                )}
              </span>
              {!ingredient.in_bank && (
                <span className="ml-auto shrink-0">
                  <Pill>New</Pill>
                </span>
              )}
            </div>
          ))}
        </Card>

        {notInBank.length > 0 && (
          <p className="text-sm text-muted">
            {notInBank.length === 1 ? "One thing is" : `${notInBank.length} things are`}{" "}
            not in your bank yet.
          </p>
        )}
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted">
          Method
        </h3>

        <ol className="space-y-4">
          {recipe.steps.map((step) => (
            <li key={step.n} className="flex gap-3">
              <span
                aria-hidden
                className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full border border-line text-sm font-medium"
              >
                {step.n}
              </span>
              <div className="space-y-1">
                <p className="text-base leading-relaxed">
                  {renderStepText(step.text, displayIngredients)}
                </p>
                {(step.duration_seconds || step.temperature_c !== null) && (
                  <p className="text-sm text-muted">
                    {[
                      step.duration_seconds
                        ? formatMinutes(Math.round(step.duration_seconds / 60))
                        : null,
                      step.temperature_c !== null
                        ? convertTemperature(step.temperature_c, prefs)
                        : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                )}
              </div>
            </li>
          ))}
        </ol>
      </section>

      {recipe.serving_suggestion && (
        <section className="space-y-2">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-muted">
            To serve
          </h3>
          <p className="text-base leading-relaxed">{recipe.serving_suggestion}</p>
        </section>
      )}

      {(recipe.make_ahead || recipe.leftovers) && (
        <section className="space-y-2">
          {recipe.make_ahead && (
            <p className="text-base leading-relaxed">
              <span className="font-medium">Ahead of time: </span>
              {recipe.make_ahead}
            </p>
          )}
          {recipe.leftovers && (
            <p className="text-base leading-relaxed">
              <span className="font-medium">Leftovers: </span>
              {recipe.leftovers}
            </p>
          )}
        </section>
      )}
    </article>
  );
}
