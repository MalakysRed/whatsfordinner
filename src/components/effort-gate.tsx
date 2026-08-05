"use client";

import { useState } from "react";
import { Card, Select } from "@/components/ui";
import type { CategoryPick, EffortInput } from "@/components/option-flow";
import type { SeedAxis } from "@/lib/db/types";

/**
 * Stage 1 — the input gate. One dropdown for effort band, a batch-cooking
 * toggle, up to two pinned categories (a real constraint on stage 2, not a
 * nudge — see generate.ts's `buildOptionsRequestBlock`), and an optional
 * "anything to use up?" field. Nothing else is asked before generation:
 * cuisine and ingredient filters live downstream, as reactions to what
 * comes back, not constraints on the request.
 */

const BANDS: { value: EffortInput["effortBand"]; label: string; detail: string }[] = [
  { value: "quick", label: "Quick (can't be arsed)", detail: "30 mins or less" },
  { value: "standard", label: "Standard (proper meal prep)", detail: "30-60 mins" },
  { value: "project", label: "Project (epic meal)", detail: "60 mins plus" },
];

const AXES: SeedAxis[] = ["cuisine", "format", "hero"];

const AXIS_LABEL: Record<SeedAxis, string> = {
  cuisine: "Cuisine",
  format: "Format",
  hero: "Hero ingredient",
};

const AXIS_PLACEHOLDER: Record<SeedAxis, string> = {
  cuisine: "Thai",
  format: "Traybake",
  hero: "chicken",
};

function emptyPicks(): Record<SeedAxis, string> {
  return { cuisine: "", format: "", hero: "" };
}

export function EffortGate({
  onSubmit,
  initialValues,
  seedPoolNames,
}: {
  onSubmit: (input: EffortInput) => void;
  /** Prefills every field from the household's last submission, so stage
   *  2's Back button returns to a gate they can tweak, not start over. */
  initialValues?: EffortInput | null;
  seedPoolNames: Record<SeedAxis, string[]>;
}) {
  const [band, setBand] = useState<EffortInput["effortBand"] | null>(
    initialValues?.effortBand ?? null,
  );
  const [picks, setPicks] = useState<Record<SeedAxis, string>>(() => {
    const base = emptyPicks();
    for (const pick of initialValues?.categoryPicks ?? []) base[pick.axis] = pick.value;
    return base;
  });
  const [needsUsingUp, setNeedsUsingUp] = useState(initialValues?.needsUsingUp ?? "");
  const [batchCooking, setBatchCooking] = useState(initialValues?.batchCooking ?? false);

  const filledCount = AXES.filter((axis) => picks[axis].trim()).length;

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold tracking-tight">What are we thinking?</h2>
        <p className="text-sm text-muted">Pick a pace — everything else is optional.</p>
      </div>

      <Card className="space-y-2 p-4">
        <label htmlFor="effort-band" className="block text-sm font-medium">
          Pace
        </label>
        <Select
          id="effort-band"
          value={band ?? ""}
          onChange={(e) => setBand((e.target.value || null) as EffortInput["effortBand"] | null)}
        >
          <option value="" disabled>
            Choose one
          </option>
          {BANDS.map((b) => (
            <option key={b.value} value={b.value}>
              {b.label} — {b.detail}
            </option>
          ))}
        </Select>
      </Card>

      <Card className="p-0">
        <label className="flex min-h-11 cursor-pointer items-start gap-3 px-4 py-3">
          <input
            type="checkbox"
            checked={batchCooking}
            onChange={(e) => setBatchCooking(e.target.checked)}
            className="mt-0.5 size-5 shrink-0 accent-[var(--accent)]"
          />
          <span className="text-base leading-6">
            Batch cooking
            <span className="mt-0.5 block text-sm text-muted">
              Cooking in bulk to freeze portions — rules out anything that freezes or
              reheats badly (fresh salads, mayonnaise or cream sauces that split, soggy
              fried coatings).
            </span>
          </span>
        </label>
      </Card>

      {AXES.map((axis) => {
        const disabled = filledCount >= 2 && !picks[axis].trim();
        return (
          <Card key={axis} className="space-y-2 p-4">
            <label htmlFor={`pick-${axis}`} className="block text-sm font-medium">
              {AXIS_LABEL[axis]} (optional)
            </label>
            <input
              id={`pick-${axis}`}
              list={`${axis}-options`}
              value={picks[axis]}
              disabled={disabled}
              onChange={(e) =>
                setPicks((current) => ({ ...current, [axis]: e.target.value }))
              }
              placeholder={AXIS_PLACEHOLDER[axis]}
              className="w-full rounded-xl border border-line bg-background px-4 py-3 text-base outline-none focus:border-accent disabled:opacity-50"
            />
            <datalist id={`${axis}-options`}>
              {seedPoolNames[axis].map((name) => (
                <option key={name} value={name} />
              ))}
            </datalist>
          </Card>
        );
      })}
      {filledCount >= 2 && (
        <p className="text-sm text-muted">Two picked — clear one to add a third.</p>
      )}

      <Card className="space-y-2 p-4">
        <label htmlFor="needs-using-up" className="block text-sm font-medium">
          Anything to use up? (optional)
        </label>
        <input
          id="needs-using-up"
          value={needsUsingUp}
          onChange={(e) => setNeedsUsingUp(e.target.value)}
          placeholder="half a bag of spinach"
          className="w-full rounded-xl border border-line bg-background px-4 py-3 text-base outline-none focus:border-accent"
        />
      </Card>

      <button
        type="button"
        disabled={!band}
        onClick={() => {
          if (!band) return;
          const categoryPicks: CategoryPick[] = AXES.filter((axis) =>
            picks[axis].trim(),
          ).map((axis) => ({ axis, value: picks[axis].trim() }));

          onSubmit({
            effortBand: band,
            categoryPicks,
            needsUsingUp: needsUsingUp.trim() || null,
            batchCooking,
          });
        }}
        className="min-h-12 w-full rounded-xl bg-accent px-4 py-3 text-base font-medium text-on-accent disabled:opacity-50"
      >
        Give me eight ideas
      </button>
    </div>
  );
}
