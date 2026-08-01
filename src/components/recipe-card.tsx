"use client";

import { Card, Pill } from "@/components/ui";
import { formatMinutes, formatQuantity, renderStepText } from "@/lib/recipe/render";
import type { Recipe } from "@/lib/schemas/recipe";

/**
 * The recipe card.
 *
 * Static for now: the servings stepper, unit toggle, cooking mode and timers are
 * later milestones. What it does prove is the placeholder contract — every
 * quantity in the steps below is resolved from the ingredient list at render
 * time, not baked into the text by the model.
 */
export function RecipeCard({ recipe }: { recipe: Recipe }) {
  const notInBank = recipe.ingredients.filter((i) => !i.in_bank);

  return (
    <article className="space-y-6">
      <header className="space-y-2">
        <h2 className="text-2xl font-semibold leading-tight tracking-tight">
          {recipe.title}
        </h2>
        <p className="text-base leading-relaxed text-muted">{recipe.description}</p>

        <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted">
          <span>{recipe.cuisine}</span>
          <span>{formatMinutes(recipe.total_minutes)} total</span>
          <span>{formatMinutes(recipe.active_minutes)} hands on</span>
          <span>{recipe.difficulty}</span>
          <span>serves {recipe.base_servings}</span>
        </div>
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
          {recipe.ingredients.map((ingredient) => (
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
                  {renderStepText(step.text, recipe.ingredients)}
                </p>
                {(step.duration_seconds || step.temperature_c) && (
                  <p className="text-sm text-muted">
                    {[
                      step.duration_seconds
                        ? formatMinutes(Math.round(step.duration_seconds / 60))
                        : null,
                      step.temperature_c ? `${step.temperature_c}°C` : null,
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
