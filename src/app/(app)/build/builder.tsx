"use client";

import { useMemo, useState } from "react";
import { Card } from "@/components/ui";
import { SuggestionFlow, type Constraints } from "@/components/suggestion-flow";
import type { FlavourOption } from "@/lib/schemas/suggestion";

const CUISINES = [
  "Mexican", "Indian", "Japanese", "Thai", "Italian", "Greek",
  "Middle Eastern", "Chinese", "Korean", "French", "British", "Spanish",
  "Vietnamese",
];

/**
 * The meal builder (PRD 7.2).
 *
 * One scrolling screen, not a wizard. Every section is optional and collapsed
 * with a summary of what it currently says, so the length of the page does not
 * imply the length of the job. "Needs using up" sits first because it is the
 * strongest constraint when it applies and invisible when it does not.
 */
export function Builder({
  bankNames,
  defaultServings,
  defaultTimeLimit,
  focusUseItUp,
}: {
  bankNames: string[];
  defaultServings: number;
  defaultTimeLimit: number | null;
  focusUseItUp: boolean;
}) {
  const [needsUsingUp, setNeedsUsingUp] = useState("");
  const [cuisine, setCuisine] = useState<string | null>(null);
  const [protein, setProtein] = useState("");
  const [carb, setCarb] = useState("");
  const [veg, setVeg] = useState("");
  const [timeLimit, setTimeLimit] = useState<number | null>(defaultTimeLimit);
  const [servings, setServings] = useState(defaultServings);
  const [flavours, setFlavours] = useState<FlavourOption[] | null>(null);
  const [loadingFlavours, setLoadingFlavours] = useState(false);
  const [chosenFlavours, setChosenFlavours] = useState<string[]>([]);
  const [submitted, setSubmitted] = useState<Constraints | null>(null);

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

  async function loadFlavours() {
    setLoadingFlavours(true);
    try {
      const response = await fetch("/api/flavours", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          cuisine,
          components: [protein, carb, veg].filter(Boolean),
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
        />
      </div>
    );
  }

  const canPickFlavour = Boolean(cuisine) && Boolean(protein || carb || veg);

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

      <Section
        title="The plate"
        summary={
          [protein, carb, veg].filter(Boolean).join(", ") || "You choose"
        }
      >
        <Field label="Protein" value={protein} onChange={setProtein} placeholder="you choose" />
        <Field label="Carb" value={carb} onChange={setCarb} placeholder="you choose" />
        <Field label="Vegetables" value={veg} onChange={setVeg} placeholder="you choose" />
      </Section>

      <Section title="Cuisine" summary={cuisine ?? "You choose"}>
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
      </Section>

      <Section
        title="Flavour layer"
        summary={chosenFlavours.join(", ") || "You choose"}
      >
        {!canPickFlavour ? (
          <p className="text-sm text-muted">
            Pick a cuisine and at least one part of the plate, and some options
            will show up here.
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

      {/* Sticky, because the page scrolls and the action should not. */}
      <div className="fixed inset-x-0 bottom-14 border-t border-line bg-raised/95 px-5 py-3 backdrop-blur">
        <div className="mx-auto w-full max-w-md">
          <button
            type="button"
            onClick={() =>
              setSubmitted({
                needs_using_up: needsUsingUp || null,
                cuisine,
                protein: protein || null,
                carb: carb || null,
                veg: veg ? [veg] : null,
                flavour_layers: chosenFlavours.length ? chosenFlavours : null,
                time_limit: timeLimit,
                servings,
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

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-medium">{label}</label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-xl border border-line bg-background px-4 py-3 text-base outline-none focus:border-accent"
      />
    </div>
  );
}
