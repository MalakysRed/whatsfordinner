"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui";
import { RecipeCard } from "@/components/recipe-card";
import { saveRecipe } from "@/app/(app)/book/actions";
import { formatMinutes } from "@/lib/recipe/render";
import { CUISINES } from "@/lib/cuisines";
import type { UnitPrefs } from "@/lib/recipe/scale";
import type { Recipe } from "@/lib/schemas/recipe";
import type { Option } from "@/lib/schemas/option";

export interface EffortInput {
  effortBand: "quick" | "standard" | "project";
  /** Free text from stage 1, "anything to use up?" — never persisted. */
  needsUsingUp?: string | null;
}

type Phase = "generating" | "options" | "commit" | "cooking" | "recipe" | "error";

/**
 * Stages 2–4 of the feature spec: six options, react or commit, tailor with
 * pre-validated swaps, then the recipe card. No free-text mutation path once
 * a dish is committed — everything offered on the commit screen comes
 * straight from that option's own `swaps` array (spec §6).
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
  const [phase, setPhase] = useState<Phase>("generating");
  const [options, setOptions] = useState<Option[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [cuisineFilter, setCuisineFilter] = useState<string | null>(null);

  const [committed, setCommitted] = useState<Option | null>(null);
  const [servings, setServings] = useState(defaultServings);
  const [swapSelections, setSwapSelections] = useState<Record<string, string>>({});

  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [generationId, setGenerationId] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [savedId, setSavedId] = useState<string | null>(null);

  // Every title shown this session, so a refresh does not repeat itself.
  const rejectedTitles = useRef<string[]>([]);

  const generate = useCallback(
    async (refine?: { reaction: string; previousTitles: string[] }) => {
      setPhase("generating");
      setError(null);

      try {
        const response = await fetch("/api/options", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            effort_band: input.effortBand,
            needs_using_up: input.needsUsingUp ?? null,
            avoid_titles: rejectedTitles.current.slice(-30),
            refine: refine
              ? { reaction: refine.reaction, previous_titles: refine.previousTitles }
              : null,
          }),
        });

        const body = await response.json();

        if (!response.ok) {
          setError(body.error ?? "Could not get options.");
          setPhase("error");
          return;
        }

        if (typeof body.remaining_today === "number") {
          setRemaining(body.remaining_today);
        }

        const next: Option[] = body.options ?? [];
        setOptions(next);
        rejectedTitles.current.push(...next.map((o) => o.title));
        setPhase("options");
      } catch {
        setError("Could not reach the app. Check your connection.");
        setPhase("error");
      }
    },
    [input],
  );

  const started = useRef(false);
  useEffect(() => {
    if (!started.current) {
      started.current = true;
      void generate();
    }
  }, [generate]);

  /** Permanent — the only per-card reaction the spec commits to storing. */
  const reactNotThis = useCallback(async (option: Option) => {
    setOptions((current) => current.filter((o) => o.id !== option.id));
    try {
      await fetch("/api/options/react", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: option.title }),
      });
    } catch {
      // Best effort — the card is already gone from view either way.
    }
  }, []);

  const reactMoreLikeThis = useCallback(
    (option: Option) => {
      void generate({
        reaction: `More like "${option.title}" — ${option.axes.richness} in richness, ${option.axes.cuisine}, built around ${option.axes.protein}, cooked by ${option.axes.method}. Preserve whatever made this one appealing and vary the rest.`,
        previousTitles: options.map((o) => o.title),
      });
    },
    [generate, options],
  );

  const globalControl = useCallback(
    (reaction: string) => {
      void generate({ reaction, previousTitles: options.map((o) => o.title) });
    },
    [generate, options],
  );

  const commit = useCallback(
    (option: Option) => {
      setCommitted(option);
      setServings(defaultServings);
      setSwapSelections({});
      setPhase("commit");
    },
    [defaultServings],
  );

  const getRecipe = useCallback(async () => {
    if (!committed) return;
    setPhase("cooking");
    setError(null);

    try {
      const response = await fetch("/api/recipe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          option: committed,
          servings,
          swap_selections: Object.keys(swapSelections).length > 0 ? swapSelections : null,
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
      setGenerationId(body.generation_id ?? null);
      setPhase("recipe");
    } catch {
      setError("Could not reach the app. Check your connection.");
      setPhase("error");
    }
  }, [committed, servings, swapSelections]);

  const save = useCallback(async () => {
    if (!recipe) return;
    setSaveState("saving");

    try {
      const result = await saveRecipe(recipe, committed?.id ?? null, generationId, false);
      if (result.ok && result.recipeId) {
        setSaveState("saved");
        setSavedId(result.recipeId);
      } else {
        setSaveState("error");
      }
    } catch {
      setSaveState("error");
    }
  }, [recipe, committed, generationId]);

  const filteredOptions = cuisineFilter
    ? options.filter((o) => o.axes.cuisine.toLowerCase().includes(cuisineFilter.toLowerCase()))
    : options;

  if (phase === "generating" || phase === "cooking") {
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
          onClick={() => (committed ? void getRecipe() : void generate())}
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
            onClick={() => setPhase("options")}
            className="min-h-11 text-sm text-muted underline"
          >
            Back to the six
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
          option={committed}
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

  if (phase === "commit" && committed) {
    return (
      <div className="space-y-4">
        <button
          type="button"
          onClick={() => setPhase("options")}
          className="min-h-11 text-sm text-muted underline"
        >
          Back to the six
        </button>

        <Card className="space-y-2 p-5">
          <h3 className="text-lg font-semibold leading-tight">{committed.title}</h3>
          <p className="text-base leading-relaxed text-muted">{committed.description}</p>
        </Card>

        <Card className="flex items-center justify-between gap-3 p-4">
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
        </Card>

        {committed.swaps.map((swap) => (
          <Card key={swap.slot} className="space-y-2 p-4">
            <label className="block text-sm font-medium capitalize">{swap.slot}</label>
            <select
              value={swapSelections[swap.slot] ?? ""}
              onChange={(e) =>
                setSwapSelections((current) => ({ ...current, [swap.slot]: e.target.value }))
              }
              className="w-full rounded-xl border border-line bg-background px-4 py-3 text-base outline-none focus:border-accent"
            >
              <option value="">As written</option>
              {swap.safe_options.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
            <p className="text-sm text-muted">{swap.note}</p>
          </Card>
        ))}

        <button
          type="button"
          onClick={() => void getRecipe()}
          className="min-h-12 w-full rounded-xl bg-accent px-4 py-3 text-base font-medium text-on-accent"
        >
          Get the recipe
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <ControlChip onClick={() => globalControl("Offer six that are meaningfully quicker and easier than this set.")}>
          Less effort
        </ControlChip>
        <ControlChip onClick={() => globalControl("Offer six that are lighter overall than this set.")}>
          Lighter
        </ControlChip>
        <ControlChip onClick={() => globalControl("Avoid the proteins used in this set; offer genuinely different ones.")}>
          Different protein
        </ControlChip>
        <ControlChip onClick={() => void generate()}>None of these</ControlChip>

        <select
          value={cuisineFilter ?? ""}
          onChange={(e) => setCuisineFilter(e.target.value || null)}
          aria-label="Filter by cuisine"
          className="min-h-9 rounded-full border border-line bg-background px-3 py-1.5 text-sm"
        >
          <option value="">Any cuisine</option>
          {CUISINES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      <ul className="space-y-3">
        {filteredOptions.map((option) => (
          <li key={option.id}>
            <OptionCard
              option={option}
              onCommit={() => commit(option)}
              onMoreLikeThis={() => reactMoreLikeThis(option)}
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

function ControlChip({ children, onClick }: { children: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="min-h-9 rounded-full border border-line px-3 py-1.5 text-sm font-medium"
    >
      {children}
    </button>
  );
}

function OptionCard({
  option,
  onCommit,
  onMoreLikeThis,
  onNotThis,
}: {
  option: Option;
  onCommit: () => void;
  onMoreLikeThis: () => void;
  onNotThis: () => void;
}) {
  return (
    <Card className="space-y-2 overflow-hidden p-5">
      <button type="button" onClick={onCommit} className="w-full space-y-2 text-left">
        <h3 className="text-lg font-semibold leading-tight">{option.title}</h3>
        <p className="text-base leading-relaxed text-muted">{option.description}</p>
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted">
          <span>{option.axes.cuisine}</span>
          <span>{formatMinutes(option.effort_minutes)}</span>
          <span className="capitalize">{option.axes.richness}</span>
        </div>
      </button>
      <div className="flex gap-2 pt-1">
        <button
          type="button"
          onClick={onMoreLikeThis}
          className="min-h-9 flex-1 rounded-lg border border-line text-sm font-medium"
        >
          More like this
        </button>
        <button
          type="button"
          onClick={onNotThis}
          className="min-h-9 flex-1 rounded-lg border border-line text-sm font-medium"
        >
          Not this
        </button>
      </div>
    </Card>
  );
}

const GENERATING_STAGES = ["Drawing inspiration…", "Ruling out repeats…", "Picking six…"];
const COOKING_STAGES = ["Working out the method…", "Weighing everything…", "Writing the steps…"];

/**
 * Staged progress rather than a bare spinner. A blank screen for eight seconds
 * feels broken (FR4.5).
 */
function Working({ kind }: { kind: "generating" | "cooking" }) {
  const stages = kind === "generating" ? GENERATING_STAGES : COOKING_STAGES;
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
