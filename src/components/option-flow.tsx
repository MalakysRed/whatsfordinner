"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui";
import { RecipeCard } from "@/components/recipe-card";
import { saveRecipe } from "@/app/(app)/book/actions";
import { formatMinutes } from "@/lib/recipe/render";
import type { UnitPrefs } from "@/lib/recipe/scale";
import type { Recipe } from "@/lib/schemas/recipe";
import type { Option } from "@/lib/schemas/option";
import type { ComponentSlot } from "@/lib/schemas/dish-components";
import type { RefinedOption } from "@/lib/schemas/dish-variations";

export interface EffortInput {
  effortBand: "quick" | "standard" | "project";
  /** Pinned at stage 1 — a hard constraint on stage 2, not a nudge. */
  mainIngredient?: string | null;
  /** Free text from stage 1, "anything to use up?" — never persisted. */
  needsUsingUp?: string | null;
}

type Phase =
  | "loading-options"
  | "options"
  | "loading-tailor"
  | "tailor"
  | "loading-variations"
  | "variations"
  | "cooking"
  | "recipe"
  | "error";

/**
 * Stages 2 through 5: eight lightweight directions, tailor the chosen one,
 * three richer variations informed by that tailoring, then the recipe card.
 * No free-text mutation path once a dish is committed — everything offered
 * on the way there is either the household's own tap or something the model
 * generated in response to it.
 */
export function OptionFlow({
  input,
  defaultServings,
  unitPrefs,
}: {
  input: EffortInput;
  defaultServings: number;
  unitPrefs?: UnitPrefs;
}) {
  const [phase, setPhase] = useState<Phase>("loading-options");
  const [error, setError] = useState<string | null>(null);
  const [remaining, setRemaining] = useState<number | null>(null);

  const [options, setOptions] = useState<Option[]>([]);
  const [chosenOption, setChosenOption] = useState<Option | null>(null);

  const [slots, setSlots] = useState<ComponentSlot[]>([]);
  const [selections, setSelections] = useState<Record<string, string>>({});
  const [lastChangedSlot, setLastChangedSlot] = useState<string | null>(null);

  const [variations, setVariations] = useState<RefinedOption[]>([]);
  const [chosenVariation, setChosenVariation] = useState<RefinedOption | null>(null);
  const [servings, setServings] = useState(defaultServings);

  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [generationId, setGenerationId] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [savedId, setSavedId] = useState<string | null>(null);

  // Every direction shown this session, so a stage-2 refresh does not repeat itself.
  const shownDirections = useRef<string[]>([]);
  // Whatever async call most recently failed, so "Try again" retries the
  // right thing rather than guessing from state which stage was in flight.
  // Set at each call site via `retry()` below, not inside the callbacks
  // themselves — a memoized callback referencing its own name in its body
  // is a React Compiler safety violation, even though it's fine at runtime.
  const retryRef = useRef<() => void>(() => {});
  const retry = useCallback((fn: () => void) => {
    retryRef.current = fn;
    fn();
  }, []);

  // ---------------------------------------------------------------------
  // Stage 2 — eight options
  // ---------------------------------------------------------------------

  const generateOptions = useCallback(
    async (refresh = false) => {
      setPhase("loading-options");
      setError(null);

      try {
        const response = await fetch("/api/options", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            effort_band: input.effortBand,
            main_ingredient: input.mainIngredient ?? null,
            needs_using_up: input.needsUsingUp ?? null,
            avoid_directions: shownDirections.current.slice(-40),
            previous_directions: refresh ? options.map((o) => o.direction) : null,
          }),
        });

        const body = await response.json();

        if (!response.ok) {
          setError(body.error ?? "Could not get options.");
          setPhase("error");
          return;
        }

        if (typeof body.remaining_today === "number") setRemaining(body.remaining_today);

        const next: Option[] = body.options ?? [];
        setOptions(next);
        shownDirections.current.push(...next.map((o) => o.direction));
        setPhase("options");
      } catch {
        setError("Could not reach the app. Check your connection.");
        setPhase("error");
      }
    },
    [input, options],
  );

  const started = useRef(false);
  useEffect(() => {
    if (!started.current) {
      started.current = true;
      retry(() => void generateOptions());
    }
  }, [retry, generateOptions]);

  /** Permanent — the one per-card reaction the app commits to storing. */
  const reactNotThis = useCallback(async (option: Option) => {
    setOptions((current) => current.filter((o) => o.id !== option.id));
    try {
      await fetch("/api/options/react", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ direction: option.direction }),
      });
    } catch {
      // Best effort — the card is already gone from view either way.
    }
  }, []);

  // ---------------------------------------------------------------------
  // Stage 3 — tailor the chosen dish
  // ---------------------------------------------------------------------

  const generateComponents = useCallback(
    async (option: Option, locked?: { slot: string; value: string } | null) => {
      setPhase("loading-tailor");
      setError(null);

      try {
        const response = await fetch("/api/dish-components", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            option,
            main_ingredient: input.mainIngredient ?? null,
            needs_using_up: input.needsUsingUp ?? null,
            locked: locked ?? null,
          }),
        });

        const body = await response.json();

        if (!response.ok) {
          setError(body.error ?? "Could not tailor that dish.");
          setPhase("error");
          return;
        }

        if (typeof body.remaining_today === "number") setRemaining(body.remaining_today);

        setSlots(body.slots ?? []);
        setPhase("tailor");
      } catch {
        setError("Could not reach the app. Check your connection.");
        setPhase("error");
      }
    },
    [input],
  );

  const pickOption = useCallback(
    (option: Option) => {
      setChosenOption(option);
      setSelections({});
      setLastChangedSlot(null);
      retry(() => void generateComponents(option));
    },
    [generateComponents, retry],
  );

  const chooseSlotValue = useCallback((slot: string, value: string) => {
    setSelections((current) => {
      const next = { ...current };
      if (next[slot] === value) {
        delete next[slot]; // tap again to deselect back to "chef's choice"
      } else {
        next[slot] = value;
      }
      return next;
    });
    setLastChangedSlot(slot);
  }, []);

  const refreshToMatch = useCallback(() => {
    if (!chosenOption || !lastChangedSlot || !selections[lastChangedSlot]) return;
    const locked = { slot: lastChangedSlot, value: selections[lastChangedSlot] };
    retry(() => void generateComponents(chosenOption, locked));
  }, [chosenOption, lastChangedSlot, selections, generateComponents, retry]);

  // ---------------------------------------------------------------------
  // Stage 4 — three richer variations
  // ---------------------------------------------------------------------

  const generateVariations = useCallback(async () => {
    if (!chosenOption) return;
    setPhase("loading-variations");
    setError(null);
    setChosenVariation(null);

    try {
      const response = await fetch("/api/dish-variations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          option: chosenOption,
          component_selections: Object.keys(selections).length > 0 ? selections : null,
          main_ingredient: input.mainIngredient ?? null,
          needs_using_up: input.needsUsingUp ?? null,
        }),
      });

      const body = await response.json();

      if (!response.ok) {
        setError(body.error ?? "Could not put those variations together.");
        setPhase("error");
        return;
      }

      if (typeof body.remaining_today === "number") setRemaining(body.remaining_today);

      setVariations(body.options ?? []);
      setPhase("variations");
    } catch {
      setError("Could not reach the app. Check your connection.");
      setPhase("error");
    }
  }, [chosenOption, selections, input]);

  // ---------------------------------------------------------------------
  // Stage 5 — the recipe
  // ---------------------------------------------------------------------

  const getRecipe = useCallback(async () => {
    if (!chosenVariation) return;
    setPhase("cooking");
    setError(null);

    try {
      const response = await fetch("/api/recipe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          option: chosenVariation,
          servings,
          component_selections: Object.keys(selections).length > 0 ? selections : null,
          main_ingredient: input.mainIngredient ?? null,
          needs_using_up: input.needsUsingUp ?? null,
        }),
      });

      const body = await response.json();

      if (!response.ok) {
        setError(body.error ?? "Could not write the recipe.");
        setPhase("error");
        return;
      }

      if (typeof body.remaining_today === "number") setRemaining(body.remaining_today);

      setRecipe(body.recipe);
      setGenerationId(body.generation_id ?? null);
      setPhase("recipe");
    } catch {
      setError("Could not reach the app. Check your connection.");
      setPhase("error");
    }
  }, [chosenVariation, servings, selections, input]);

  const save = useCallback(async () => {
    if (!recipe) return;
    setSaveState("saving");

    try {
      const result = await saveRecipe(recipe, chosenVariation?.id ?? null, generationId, false);
      if (result.ok && result.recipeId) {
        setSaveState("saved");
        setSavedId(result.recipeId);
      } else {
        setSaveState("error");
      }
    } catch {
      setSaveState("error");
    }
  }, [recipe, chosenVariation, generationId]);

  // ---------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------

  if (phase === "loading-options" || phase === "loading-tailor" || phase === "loading-variations" || phase === "cooking") {
    return <Working phase={phase} />;
  }

  if (phase === "error") {
    return (
      <Card className="space-y-4 p-5">
        <p role="alert" className="text-base leading-relaxed">
          {error}
        </p>
        <button
          type="button"
          onClick={() => retryRef.current()}
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
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setPhase("variations")}
            className="min-h-11 text-sm text-muted underline"
          >
            Back
          </button>

          {saveState === "saved" && savedId ? (
            <Link href={`/book/${savedId}`} className="min-h-11 text-sm font-medium text-accent underline">
              Saved — view in book
            </Link>
          ) : (
            <button
              type="button"
              onClick={() => void save()}
              disabled={saveState === "saving"}
              className="min-h-11 text-sm font-medium text-accent underline disabled:opacity-60"
            >
              {saveState === "saving" ? "Saving…" : "Save to book"}
            </button>
          )}
        </div>

        {saveState === "error" && (
          <p role="alert" className="text-sm text-danger">
            Could not save. Try again.
          </p>
        )}

        <RecipeCard
          recipe={recipe}
          option={chosenVariation}
          unitPrefs={unitPrefs}
          recipeId={savedId ?? undefined}
          onSaved={(id) => {
            setSaveState("saved");
            setSavedId(id);
          }}
        />
      </div>
    );
  }

  if (phase === "variations") {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setPhase("tailor")}
            className="min-h-11 text-sm text-muted underline"
          >
            Back
          </button>
          <button
            type="button"
            onClick={() => retry(() => void generateVariations())}
            className="min-h-9 rounded-full border border-line px-3 py-1.5 text-sm font-medium"
          >
            Refresh
          </button>
        </div>

        <ul className="space-y-3">
          {variations.map((variation) => (
            <li key={variation.id}>
              <VariationCard
                variation={variation}
                selected={chosenVariation?.id === variation.id}
                onSelect={() => setChosenVariation(variation)}
              />
            </li>
          ))}
        </ul>

        {chosenVariation && (
          <Card className="space-y-3 p-4">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-medium">Servings</span>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setServings((s) => Math.max(1, s - 1))}
                  aria-label="Fewer servings"
                  className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-line text-lg"
                >
                  −
                </button>
                <span className="w-6 text-center text-base font-medium tabular-nums">{servings}</span>
                <button
                  type="button"
                  onClick={() => setServings((s) => Math.min(12, s + 1))}
                  aria-label="More servings"
                  className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-line text-lg"
                >
                  +
                </button>
              </div>
            </div>
            <button
              type="button"
              onClick={() => retry(() => void getRecipe())}
              className="min-h-12 w-full rounded-xl bg-accent px-4 py-3 text-base font-medium text-on-accent"
            >
              Generate recipe
            </button>
          </Card>
        )}
      </div>
    );
  }

  if (phase === "tailor" && chosenOption) {
    const hasSelections = Object.keys(selections).length > 0;

    return (
      <div className="space-y-4">
        <button
          type="button"
          onClick={() => {
            setChosenOption(null);
            setPhase("options");
          }}
          className="min-h-11 text-sm text-muted underline"
        >
          Back to the options
        </button>

        <Card className="space-y-2 p-5">
          <h3 className="text-lg font-semibold leading-tight">{chosenOption.direction}</h3>
          <p className="text-base leading-relaxed text-muted">
            {chosenOption.flavours.join(" · ")}
            {chosenOption.textures.length > 0 ? ` — ${chosenOption.textures.join(", ")}` : ""}
          </p>
          <p className="text-sm text-muted">{chosenOption.hero_ingredients.join(", ")}</p>
        </Card>

        {slots.map((slot) => (
          <Card key={slot.slot} className="space-y-2 p-4">
            <label className="block text-sm font-medium">{slot.label}</label>
            <div className="flex flex-wrap gap-2">
              {slot.options.map((option) => {
                const active = selections[slot.slot] === option.name;
                return (
                  <button
                    key={option.name}
                    type="button"
                    onClick={() => chooseSlotValue(slot.slot, option.name)}
                    className={`min-h-9 rounded-full border px-3 py-1.5 text-sm ${
                      active ? "border-accent bg-accent text-on-accent" : "border-line"
                    }`}
                  >
                    {option.name}
                  </button>
                );
              })}
            </div>
            {selections[slot.slot] &&
              slot.options.find((o) => o.name === selections[slot.slot])?.note && (
                <p className="text-sm text-muted">
                  {slot.options.find((o) => o.name === selections[slot.slot])?.note}
                </p>
              )}
          </Card>
        ))}

        {hasSelections && (
          <button
            type="button"
            onClick={refreshToMatch}
            className="min-h-9 w-full rounded-full border border-line px-3 py-1.5 text-sm font-medium"
          >
            Refresh to match
          </button>
        )}

        <button
          type="button"
          onClick={() => retry(() => void generateVariations())}
          className="min-h-12 w-full rounded-xl bg-accent px-4 py-3 text-base font-medium text-on-accent"
        >
          Continue
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => retry(() => void generateOptions(true))}
          className="min-h-9 rounded-full border border-line px-3 py-1.5 text-sm font-medium"
        >
          Refresh
        </button>
      </div>

      <ul className="space-y-3">
        {options.map((option) => (
          <li key={option.id}>
            <OptionCard
              option={option}
              onCommit={() => pickOption(option)}
              onNotThis={() => void reactNotThis(option)}
            />
          </li>
        ))}
      </ul>

      {remaining !== null && remaining <= 5 && (
        <p className="text-sm text-muted">
          {remaining} generation{remaining === 1 ? "" : "s"} left today.
        </p>
      )}
    </div>
  );
}

function OptionCard({
  option,
  onCommit,
  onNotThis,
}: {
  option: Option;
  onCommit: () => void;
  onNotThis: () => void;
}) {
  return (
    <Card className="space-y-2 overflow-hidden p-5">
      <button type="button" onClick={onCommit} className="w-full space-y-2 text-left">
        <h3 className="text-lg font-semibold leading-tight">{option.direction}</h3>
        <div className="flex flex-wrap gap-1.5">
          {[...option.flavours, ...option.textures].map((tag) => (
            <span
              key={tag}
              className="rounded-full border border-line px-2.5 py-0.5 text-xs text-muted"
            >
              {tag}
            </span>
          ))}
        </div>
        <p className="text-sm text-muted">{option.hero_ingredients.join(", ")}</p>
        <p className="text-sm text-muted">
          {option.cuisine} · {formatMinutes(option.effort_minutes)}
        </p>
        {option.uses_named_ingredients.length > 0 && (
          <p className="text-sm text-accent">Uses: {option.uses_named_ingredients.join(", ")}</p>
        )}
      </button>
      <button
        type="button"
        onClick={onNotThis}
        className="min-h-9 w-full rounded-lg border border-line text-sm font-medium"
      >
        Not this
      </button>
    </Card>
  );
}

function VariationCard({
  variation,
  selected,
  onSelect,
}: {
  variation: RefinedOption;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <Card className={`overflow-hidden ${selected ? "border-accent" : ""}`}>
      <button type="button" onClick={onSelect} className="w-full space-y-2 p-5 text-left">
        <h3 className="text-lg font-semibold leading-tight">{variation.title}</h3>
        <p className="text-base leading-relaxed text-muted">{variation.description}</p>
        <p className="text-sm text-muted">
          {variation.cuisine} · {formatMinutes(variation.effort_minutes)}
        </p>
        <p className="text-sm text-muted">{variation.hero_ingredients.join(", ")}</p>
        {variation.flavours.length > 0 && (
          <p className="text-sm text-muted">{variation.flavours.join(" · ")}</p>
        )}
        {variation.uses_named_ingredients.length > 0 && (
          <p className="text-sm text-accent">Uses: {variation.uses_named_ingredients.join(", ")}</p>
        )}
      </button>
    </Card>
  );
}

const STAGE_LABELS: Record<string, string[]> = {
  "loading-options": ["Drawing inspiration…", "Ruling out repeats…", "Picking directions…"],
  "loading-tailor": ["Reading the dish…", "Working out what fits…"],
  "loading-variations": ["Weighing the options…", "Writing three ways to go…"],
  cooking: ["Working out the method…", "Weighing everything…", "Writing the steps…"],
};

/** Staged progress rather than a bare spinner. A blank screen feels broken (FR4.5). */
function Working({ phase }: { phase: string }) {
  const stages = STAGE_LABELS[phase] ?? ["Working…"];
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setIndex((i) => Math.min(i + 1, stages.length - 1)), 2600);
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
