"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Card, Pill } from "@/components/ui";
import { RecipeCard } from "@/components/recipe-card";
import { formatMinutes } from "@/lib/recipe/render";
import type { Recipe } from "@/lib/schemas/recipe";
import type { Suggestion } from "@/lib/schemas/suggestion";

export interface Constraints {
  needs_using_up?: string | null;
  cuisine?: string | null;
  protein?: string | null;
  fat?: string | null;
  carb?: string | null;
  veg?: string[] | null;
  flavour_layers?: string[] | null;
  time_limit?: number | null;
  servings?: number | null;
}

type Phase = "idle" | "suggesting" | "suggestions" | "cooking" | "recipe" | "error";

/**
 * The funnel: constraints in, three suggestions, one card.
 *
 * Deliberately kept on a single screen with no navigation between the steps.
 * The product exists to get from "what's for dinner" to "right, that one" in
 * under ninety seconds, and every screen added to the front of that works
 * against it.
 */
export function SuggestionFlow({
  constraints,
  autoStart = false,
  defaultServings,
}: {
  constraints: Constraints;
  autoStart?: boolean;
  defaultServings: number;
}) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [infeasible, setInfeasible] = useState<{
    reason: string;
    wouldUnlock: string[];
  } | null>(null);
  const [chosen, setChosen] = useState<Suggestion | null>(null);
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [feedback, setFeedback] = useState("");

  // Every title shown and turned down, so the next call does not repeat itself.
  const rejected = useRef<string[]>([]);

  const generate = useCallback(
    async (comment?: string) => {
      setPhase("suggesting");
      setError(null);
      setInfeasible(null);

      try {
        const response = await fetch("/api/suggestions", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            ...constraints,
            feedback: comment ?? null,
            avoid_titles: rejected.current.slice(-30),
          }),
        });

        const body = await response.json();

        if (!response.ok) {
          setError(body.error ?? "Could not get suggestions.");
          setPhase("error");
          return;
        }

        if (typeof body.remaining_today === "number") {
          setRemaining(body.remaining_today);
        }

        if (body.infeasible_reason) {
          setInfeasible({
            reason: body.infeasible_reason,
            wouldUnlock: body.would_unlock ?? [],
          });
        }

        setSuggestions(body.suggestions ?? []);
        rejected.current.push(
          ...(body.suggestions ?? []).map((s: Suggestion) => s.title),
        );
        setFeedback("");
        setPhase("suggestions");
      } catch {
        setError("Could not reach the app. Check your connection.");
        setPhase("error");
      }
    },
    [constraints],
  );

  const choose = useCallback(
    async (suggestion: Suggestion) => {
      setChosen(suggestion);
      setPhase("cooking");
      setError(null);

      try {
        const response = await fetch("/api/recipe", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            suggestion,
            servings: constraints.servings ?? defaultServings,
          }),
        });

        const body = await response.json();

        if (!response.ok) {
          setError(body.error ?? "Could not write the recipe.");
          setPhase("error");
          return;
        }

        if (typeof body.remaining_today === "number") {
          setRemaining(body.remaining_today);
        }

        setRecipe(body.recipe);
        setPhase("recipe");
      } catch {
        setError("Could not reach the app. Check your connection.");
        setPhase("error");
      }
    },
    [constraints, defaultServings],
  );

  const started = useRef(false);
  useEffect(() => {
    if (autoStart && !started.current) {
      started.current = true;
      void generate();
    }
  }, [autoStart, generate]);

  if (phase === "idle") return null;

  if (phase === "suggesting" || phase === "cooking") {
    return <Working kind={phase} />;
  }

  if (phase === "error") {
    return (
      <Card className="space-y-4 p-5">
        <p role="alert" className="text-base leading-relaxed">
          {error}
        </p>
        <button
          type="button"
          onClick={() => (chosen ? void choose(chosen) : void generate())}
          className="min-h-11 w-full rounded-xl bg-accent px-4 py-3 text-base font-medium text-on-accent"
        >
          Try again
        </button>
      </Card>
    );
  }

  if (phase === "recipe" && recipe) {
    return (
      <div className="space-y-4">
        <button
          type="button"
          onClick={() => setPhase("suggestions")}
          className="min-h-11 text-sm text-muted underline"
        >
          Back to the other two
        </button>
        <RecipeCard recipe={recipe} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {infeasible && (
        <Card className="space-y-2 p-5">
          <p className="text-base leading-relaxed">{infeasible.reason}</p>
          {infeasible.wouldUnlock.length > 0 && (
            <p className="text-sm text-muted">
              Pick up {infeasible.wouldUnlock.join(", ")} and this opens up.
            </p>
          )}
        </Card>
      )}

      <ul className="space-y-3">
        {suggestions.map((suggestion) => (
          <li key={suggestion.id}>
            <SuggestionCard suggestion={suggestion} onChoose={() => void choose(suggestion)} />
          </li>
        ))}
      </ul>

      <Card className="space-y-3 p-4">
        <label htmlFor="feedback" className="block text-sm font-medium">
          Not quite?
        </label>
        <input
          id="feedback"
          value={feedback}
          onChange={(e) => setFeedback(e.target.value)}
          placeholder="we had rice last night"
          className="w-full rounded-xl border border-line bg-background px-4 py-3 text-base outline-none focus:border-accent"
        />
        <button
          type="button"
          onClick={() => void generate(feedback || undefined)}
          className="min-h-11 w-full rounded-xl border border-line bg-background px-4 py-2.5 text-base font-medium"
        >
          Three more
        </button>
        {remaining !== null && remaining <= 5 && (
          <p className="text-sm text-muted">
            {remaining} generation{remaining === 1 ? "" : "s"} left today.
          </p>
        )}
      </Card>
    </div>
  );
}

function SuggestionCard({
  suggestion,
  onChoose,
}: {
  suggestion: Suggestion;
  onChoose: () => void;
}) {
  const nothingToBuy = suggestion.ingredients_not_in_bank.length === 0;

  return (
    <Card className="overflow-hidden">
      <button
        type="button"
        onClick={onChoose}
        className="w-full space-y-2 p-5 text-left"
      >
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-lg font-semibold leading-tight">{suggestion.title}</h3>
          {nothingToBuy && <Pill tone="success">Nothing to buy</Pill>}
        </div>

        <p className="text-base leading-relaxed text-muted">{suggestion.pitch}</p>

        <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted">
          <span>{suggestion.cuisine}</span>
          <span>{formatMinutes(suggestion.total_minutes)}</span>
          <span>{suggestion.difficulty}</span>
        </div>

        {suggestion.uses_named_ingredients.length > 0 && (
          <p className="text-sm text-muted">
            Uses {suggestion.uses_named_ingredients.join(", ")}
          </p>
        )}

        {!nothingToBuy && (
          <p className="text-sm text-muted">
            Needs {suggestion.ingredients_not_in_bank.join(", ")}
          </p>
        )}
      </button>
    </Card>
  );
}

const SUGGESTING_STAGES = [
  "Reading your bank…",
  "Ruling out the obvious…",
  "Picking three…",
];

const COOKING_STAGES = [
  "Working out the method…",
  "Weighing everything…",
  "Writing the steps…",
];

/**
 * Staged progress rather than a bare spinner. A blank screen for eight seconds
 * feels broken (FR4.5).
 */
function Working({ kind }: { kind: "suggesting" | "cooking" }) {
  const stages = kind === "suggesting" ? SUGGESTING_STAGES : COOKING_STAGES;
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(
      () => setIndex((i) => Math.min(i + 1, stages.length - 1)),
      2600,
    );
    return () => clearInterval(timer);
  }, [stages.length]);

  return (
    <Card className="space-y-3 p-6">
      <p role="status" aria-live="polite" className="text-base">
        {stages[index]}
      </p>
      <div className="h-1 overflow-hidden rounded-full bg-line">
        <div
          className="h-full rounded-full bg-accent transition-all duration-700"
          style={{ width: `${((index + 1) / stages.length) * 100}%` }}
        />
      </div>
    </Card>
  );
}
