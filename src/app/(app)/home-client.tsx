"use client";

import { useState } from "react";
import { EffortGate } from "@/components/effort-gate";
import { OptionFlow, type EffortInput } from "@/components/option-flow";
import type { UnitPrefs } from "@/lib/recipe/scale";

/**
 * The home screen.
 *
 * "Craft a recipe" is the sole entry point into the flow (time band, eight
 * directions, tailoring, three variations, the recipe) — the zero-input
 * "Surprise us/me" tap the PRD opened with has been deliberately removed;
 * see CLAUDE.md D5. "Planner" is a placeholder for a not-yet-built feature.
 */
export function HomeClient({
  defaultServings,
  unitPrefs,
}: {
  defaultServings: number;
  unitPrefs?: UnitPrefs;
}) {
  const [mode, setMode] = useState<"idle" | "gate" | "running">("idle");
  const [input, setInput] = useState<EffortInput | null>(null);

  if (mode === "running" && input) {
    return (
      <div className="space-y-5">
        <button
          type="button"
          onClick={() => {
            setMode("idle");
            setInput(null);
          }}
          className="min-h-11 text-sm text-muted underline"
        >
          Start over
        </button>
        <OptionFlow input={input} defaultServings={defaultServings} unitPrefs={unitPrefs} />
      </div>
    );
  }

  if (mode === "gate") {
    return (
      <div className="space-y-5">
        <button
          type="button"
          onClick={() => setMode("idle")}
          className="min-h-11 text-sm text-muted underline"
        >
          Back
        </button>
        <EffortGate
          onSubmit={(gateInput) => {
            setInput(gateInput);
            setMode("running");
          }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={() => setMode("gate")}
        className="min-h-32 w-full rounded-3xl bg-accent px-6 py-8 text-left text-on-accent"
      >
        <span className="block text-2xl font-semibold tracking-tight">Craft a recipe</span>
        <span className="mt-1 block text-base opacity-90">Guided recipe design</span>
      </button>

      <button
        type="button"
        disabled
        aria-disabled="true"
        className="flex min-h-24 w-full flex-col justify-center rounded-2xl border border-line bg-raised px-5 py-4 text-left opacity-60"
      >
        <span className="text-lg font-medium">Planner</span>
        <span className="mt-0.5 text-sm text-muted">Coming soon</span>
      </button>
    </div>
  );
}
