"use client";

import { useMemo, useState } from "react";
import { Card } from "@/components/ui";
import { SuggestionFlow, type Constraints } from "@/components/suggestion-flow";
import type { FlavourOption, PlateOption } from "@/lib/schemas/suggestion";
import type { IngredientCategory } from "@/lib/db/types";
import type { UnitPrefs } from "@/lib/recipe/scale";

export const CUISINES = [
  "Mexican", "Indian", "Japanese", "Thai", "Italian", "Greek",
  "Middle Eastern", "Chinese", "Korean", "French", "British", "Spanish",
  "Vietnamese",
];

const TASTE_PROFILES = ["Sweet", "Salty", "Sour", "Bitter", "Umami", "Spicy"];

const PROTEIN_CATEGORIES: IngredientCategory[] = ["animal_protein", "plant_protein"];

export interface BankIngredient {
  id: string;
  name: string;
  category: IngredientCategory;
  disliked: boolean;
  allergen: boolean;
}

/**
 * The meal builder (PRD 7.2).
 *
 * One scrolling screen, not a wizard. Every section is optional and collapsed
 * with a summary of what it currently says, so the length of the page does not
 * imply the length of the job. "Needs using up" sits first because it is the
 * strongest constraint when it applies and invisible when it does not.
 *
 * Order: needs using up, protein, flavour profile (taste + cuisine), a Haiku
 * call for the rest of the plate, the plate itself, a second Haiku call for
 * flavour layers, then time and servings before the Sonnet suggestions call.
 * Protein, taste profile and cuisine all carry through as real constraints on
 * that final call, not just scaffolding for the plate step.
 */
export function Builder({
  bankIngredients,
  defaultServings,
  defaultTimeLimit,
  focusUseItUp,
  unitPrefs,
}: {
  bankIngredients: BankIngredient[];
  defaultServings: number;
  defaultTimeLimit: number | null;
  focusUseItUp: boolean;
  unitPrefs?: UnitPrefs;
}) {
  const [needsUsingUp, setNeedsUsingUp] = useState("");
  const [protein, setProtein] = useState("");
  const [tasteProfile, setTasteProfile] = useState<string[]>([]);
  const [tasteProfileOther, setTasteProfileOther] = useState("");
  const [cuisine, setCuisine] = useState<string | null>(null);

  const [carbOptions, setCarbOptions] = useState<PlateOption[] | null>(null);
  const [fatOptions, setFatOptions] = useState<PlateOption[] | null>(null);
  const [vegOptions, setVegOptions] = useState<PlateOption[] | null>(null);
  const [loadingPlate, setLoadingPlate] = useState(false);
  const [carb, setCarb] = useState("");
  const [fat, setFat] = useState("");
  const [veg, setVeg] = useState<string[]>([]);

  const [timeLimit, setTimeLimit] = useState<number | null>(defaultTimeLimit);
  const [servings, setServings] = useState(defaultServings);
  const [batchCooking, setBatchCooking] = useState(false);
  const [flavours, setFlavours] = useState<FlavourOption[] | null>(null);
  const [loadingFlavours, setLoadingFlavours] = useState(false);
  const [chosenFlavours, setChosenFlavours] = useState<string[]>([]);
  const [submitted, setSubmitted] = useState<Constraints | null>(null);

  const bankNames = useMemo(
    () => bankIngredients.map((i) => i.name),
    [bankIngredients],
  );

  /** Never-show items (disliked or allergen) are excluded, same as the prompt's bank block. */
  const proteinCandidates = useMemo(
    () =>
      bankIngredients
        .filter(
          (i) =>
            PROTEIN_CATEGORIES.includes(i.category) && !i.disliked && !i.allergen,
        )
        .map((i) => i.name)
        .sort(),
    [bankIngredients],
  );

  /** Chip picks plus whatever was typed in the "other" box, comma-separated. */
  const effectiveTasteProfile = useMemo(() => {
    const typed = tasteProfileOther
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);
    return [...tasteProfile, ...typed];
  }, [tasteProfile, tasteProfileOther]);

  /**
   * Matches against the bank as you type (FR11.2a), so you can see it has
   * understood you. A local string comparison — categorising a handful of words
   * is not worth a round trip, let alone a token.
   */
  const matched = useMemo(() => {
    const typed = needsUsingUp
      .split(",")
      .map((part) => part.trim().toLowerCase())
      .filter(Boolean);

    if (typed.length === 0) return [];

    return bankNames.filter((name) => {
      const lower = name.toLowerCase();
      return typed.some((part) => lower.includes(part) || part.includes(lower));
    });
  }, [needsUsingUp, bankNames]);

  const canPickPlate =
    Boolean(protein) || Boolean(cuisine) || effectiveTasteProfile.length > 0;

  const canPickFlavour =
    canPickPlate && Boolean(carb || fat || veg.length);

  async function loadPlateOptions() {
    setLoadingPlate(true);
    try {
      const response = await fetch("/api/plate-options", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          protein: protein || null,
          taste_profile: effectiveTasteProfile.length ? effectiveTasteProfile : null,
          cuisine,
        }),
      });
      const body = await response.json();
      if (response.ok) {
        setCarbOptions(body.carbs ?? []);
        setFatOptions(body.fats ?? []);
        setVegOptions(body.veg ?? []);
      }
    } finally {
      setLoadingPlate(false);
    }
  }

  async function loadFlavours() {
    setLoadingFlavours(true);
    try {
      const response = await fetch("/api/flavours", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          cuisine,
          taste_profile: effectiveTasteProfile.length ? effectiveTasteProfile : null,
          components: [protein, carb, fat, ...veg].filter(Boolean),
        }),
      });
      const body = await response.json();
      if (response.ok) setFlavours(body.flavours ?? []);
    } finally {
      setLoadingFlavours(false);
    }
  }

  if (submitted) {
    return (
      <div className="space-y-5">
        <button
          type="button"
          onClick={() => setSubmitted(null)}
          className="min-h-11 text-sm text-muted underline"
        >
          Change what you asked for
        </button>
        <SuggestionFlow
          constraints={submitted}
          autoStart
          defaultServings={defaultServings}
          unitPrefs={unitPrefs}
        />
      </div>
    );
  }

  const flavourProfileSummary =
    [effectiveTasteProfile.join(", "), cuisine].filter(Boolean).join(" · ") ||
    "You choose";

  const plateSummary = [carb, fat, ...veg].filter(Boolean).join(", ") || "You choose";

  return (
    <div className="space-y-4 pb-24">
      {/* Needs using up — first, because it is the strongest constraint. */}
      <Section title="Needs using up" summary={needsUsingUp || "Nothing in particular"} open={focusUseItUp}>
        <input
          value={needsUsingUp}
          onChange={(e) => setNeedsUsingUp(e.target.value)}
          autoFocus={focusUseItUp}
          placeholder="chicken breast, tenderstem"
          className="w-full rounded-xl border border-line bg-background px-4 py-3 text-base outline-none focus:border-accent"
        />
        {matched.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {matched.slice(0, 8).map((name) => (
              <span
                key={name}
                className="rounded-full border border-accent px-2.5 py-0.5 text-xs font-medium text-accent"
              >
                {name}
              </span>
            ))}
          </div>
        )}
        <p className="text-sm text-muted">
          Whatever you type here has to be used. Nuance is fine — &ldquo;chicken
          must go, tenderstem if it fits&rdquo; is understood.
        </p>
      </Section>

      <Section title="Protein" summary={protein || "You choose"}>
        <div className="flex flex-wrap gap-2">
          {proteinCandidates.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setProtein(protein === option ? "" : option)}
              className={`min-h-11 rounded-full border px-3.5 py-2 text-sm font-medium ${
                protein === option
                  ? "border-accent bg-accent text-on-accent"
                  : "border-line bg-background"
              }`}
            >
              {option}
            </button>
          ))}
        </div>
        {proteinCandidates.length === 0 && (
          <p className="text-sm text-muted">Nothing in your bank yet — type one in below.</p>
        )}
        <input
          value={proteinCandidates.includes(protein) ? "" : protein}
          onChange={(e) => setProtein(e.target.value)}
          placeholder="or type another"
          className="w-full rounded-xl border border-line bg-background px-4 py-3 text-base outline-none focus:border-accent"
        />
      </Section>

      <Section title="Flavour profile" summary={flavourProfileSummary}>
        <div className="space-y-4">
          <div className="space-y-2">
            <p className="text-sm font-medium">Taste profile</p>
            <div className="flex flex-wrap gap-2">
              {TASTE_PROFILES.map((option) => {
                const picked = tasteProfile.includes(option);
                return (
                  <button
                    key={option}
                    type="button"
                    onClick={() =>
                      setTasteProfile((current) =>
                        picked
                          ? current.filter((t) => t !== option)
                          : [...current, option],
                      )
                    }
                    className={`min-h-11 rounded-full border px-3.5 py-2 text-sm font-medium ${
                      picked
                        ? "border-accent bg-accent text-on-accent"
                        : "border-line bg-background"
                    }`}
                  >
                    {option}
                  </button>
                );
              })}
            </div>
            <input
              value={tasteProfileOther}
              onChange={(e) => setTasteProfileOther(e.target.value)}
              placeholder="or type more, comma separated"
              className="w-full rounded-xl border border-line bg-background px-4 py-3 text-base outline-none focus:border-accent"
            />
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium">Cultural profile</p>
            <div className="flex flex-wrap gap-2">
              {CUISINES.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setCuisine(cuisine === option ? null : option)}
                  className={`min-h-11 rounded-full border px-3.5 py-2 text-sm font-medium ${
                    cuisine === option
                      ? "border-accent bg-accent text-on-accent"
                      : "border-line bg-background"
                  }`}
                >
                  {option}
                </button>
              ))}
            </div>
            <input
              value={CUISINES.includes(cuisine ?? "") ? "" : (cuisine ?? "")}
              onChange={(e) => setCuisine(e.target.value || null)}
              placeholder="or type another"
              className="w-full rounded-xl border border-line bg-background px-4 py-3 text-base outline-none focus:border-accent"
            />
          </div>
        </div>
      </Section>

      <Section title="The plate" summary={plateSummary}>
        {!canPickPlate ? (
          <p className="text-sm text-muted">
            Pick a protein or a flavour profile first, and options will show up
            here.
          </p>
        ) : (
          <div className="space-y-4">
            <button
              type="button"
              onClick={() => void loadPlateOptions()}
              disabled={loadingPlate}
              className="min-h-11 w-full rounded-xl border border-line bg-background px-4 py-2.5 text-base font-medium disabled:opacity-60"
            >
              {loadingPlate
                ? "Thinking…"
                : carbOptions
                  ? "Show me different ones"
                  : "Suggest the plate"}
            </button>

            {carbOptions && (
              <PlateOptionGroup
                label="Carb"
                options={carbOptions}
                selected={carb ? [carb] : []}
                onToggle={(name) => setCarb(carb === name ? "" : name)}
              />
            )}
            {fatOptions && (
              <PlateOptionGroup
                label="Fat"
                options={fatOptions}
                selected={fat ? [fat] : []}
                onToggle={(name) => setFat(fat === name ? "" : name)}
              />
            )}
            {vegOptions && (
              <PlateOptionGroup
                label="Vegetables & fruit"
                options={vegOptions}
                selected={veg}
                onToggle={(name) =>
                  setVeg((current) =>
                    current.includes(name)
                      ? current.filter((v) => v !== name)
                      : [...current, name],
                  )
                }
              />
            )}
          </div>
        )}
      </Section>

      <Section
        title="Flavour layer"
        summary={chosenFlavours.join(", ") || "You choose"}
      >
        {!canPickFlavour ? (
          <p className="text-sm text-muted">
            Pick a protein or flavour profile, and something from the plate, and
            some options will show up here.
          </p>
        ) : (
          <div className="space-y-3">
            <button
              type="button"
              onClick={() => void loadFlavours()}
              disabled={loadingFlavours}
              className="min-h-11 w-full rounded-xl border border-line bg-background px-4 py-2.5 text-base font-medium disabled:opacity-60"
            >
              {loadingFlavours
                ? "Thinking…"
                : flavours
                  ? "Show me different ones"
                  : "Suggest flavour layers"}
            </button>

            {flavours?.map((flavour) => {
              const picked = chosenFlavours.includes(flavour.name);
              return (
                <button
                  key={flavour.name}
                  type="button"
                  onClick={() =>
                    setChosenFlavours((current) =>
                      picked
                        ? current.filter((f) => f !== flavour.name)
                        : current.length >= 2
                          ? current
                          : [...current, flavour.name],
                    )
                  }
                  className={`w-full rounded-xl border p-4 text-left ${
                    picked ? "border-accent" : "border-line"
                  }`}
                >
                  <span className="block font-medium">{flavour.name}</span>
                  <span className="mt-0.5 block text-sm text-muted">
                    {flavour.description}
                  </span>
                </button>
              );
            })}

            {flavours && <p className="text-sm text-muted">Pick up to two.</p>}
          </div>
        )}
      </Section>

      <Section
        title="Time"
        summary={timeLimit ? `Under ${timeLimit} minutes` : "No limit"}
      >
        <div className="flex flex-wrap gap-2">
          {[
            { label: "No limit", value: null },
            { label: "Under 30 min", value: 30 },
            { label: "Under 60 min", value: 60 },
          ].map((option) => (
            <button
              key={option.label}
              type="button"
              onClick={() => setTimeLimit(option.value)}
              className={`min-h-11 rounded-full border px-3.5 py-2 text-sm font-medium ${
                timeLimit === option.value
                  ? "border-accent bg-accent text-on-accent"
                  : "border-line bg-background"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </Section>

      <Section title="Servings" summary={`${servings}`}>
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => setServings((s) => Math.max(1, s - 1))}
            aria-label="Fewer servings"
            className="size-12 rounded-xl border border-line text-xl"
          >
            −
          </button>
          <span className="text-xl font-medium tabular-nums">{servings}</span>
          <button
            type="button"
            onClick={() => setServings((s) => Math.min(12, s + 1))}
            aria-label="More servings"
            className="size-12 rounded-xl border border-line text-xl"
          >
            +
          </button>
        </div>
      </Section>

      <Section title="Batch cooking" summary={batchCooking ? "On" : "Off"}>
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={batchCooking}
            onChange={(e) => setBatchCooking(e.target.checked)}
            className="mt-0.5 size-5 shrink-0 accent-[var(--accent)]"
          />
          <span className="text-base">
            Cooking in bulk to freeze portions
            <span className="mt-0.5 block text-sm text-muted">
              Rules out anything that freezes or reheats badly — fresh salads,
              mayonnaise or cream sauces that split, soggy fried coatings.
            </span>
          </span>
        </label>
      </Section>

      {/* Sticky, because the page scrolls and the action should not. */}
      <div className="fixed inset-x-0 bottom-14 border-t border-line bg-raised/95 px-5 py-3 backdrop-blur">
        <div className="mx-auto w-full max-w-md">
          <button
            type="button"
            onClick={() =>
              setSubmitted({
                needs_using_up: needsUsingUp || null,
                cuisine,
                taste_profile: effectiveTasteProfile.length ? effectiveTasteProfile : null,
                protein: protein || null,
                carb: carb || null,
                fat: fat || null,
                veg: veg.length ? veg : null,
                flavour_layers: chosenFlavours.length ? chosenFlavours : null,
                time_limit: timeLimit,
                servings,
                batch_cooking: batchCooking || null,
              })
            }
            className="min-h-12 w-full rounded-xl bg-accent px-4 py-3 text-base font-medium text-on-accent"
          >
            Get suggestions
          </button>
        </div>
      </div>
    </div>
  );
}

/** One row of chip-select options for a part of the plate, single or multi. */
function PlateOptionGroup({
  label,
  options,
  selected,
  onToggle,
}: {
  label: string;
  options: PlateOption[];
  selected: string[];
  onToggle: (name: string) => void;
}) {
  if (options.length === 0) return null;

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">{label}</p>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => {
          const picked = selected.includes(option.name);
          return (
            <button
              key={option.name}
              type="button"
              onClick={() => onToggle(option.name)}
              className={`min-h-11 rounded-full border px-3.5 py-2 text-sm font-medium ${
                picked
                  ? "border-accent bg-accent text-on-accent"
                  : "border-line bg-background"
              }`}
            >
              {option.name}
              {!option.in_bank && (
                <span className="ml-1 text-xs opacity-70">(not in bank)</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Section({
  title,
  summary,
  children,
  open = false,
}: {
  title: string;
  summary: string;
  children: React.ReactNode;
  open?: boolean;
}) {
  const [expanded, setExpanded] = useState(open);

  return (
    <Card>
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
        className="flex min-h-14 w-full items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <span className="font-medium">{title}</span>
        <span className="truncate text-sm text-muted">{summary}</span>
      </button>

      {expanded && (
        <div className="space-y-3 border-t border-line px-4 py-4">{children}</div>
      )}
    </Card>
  );
}
