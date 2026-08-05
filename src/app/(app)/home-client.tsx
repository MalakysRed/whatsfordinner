"use client";

import { useState } from "react";
import { EffortGate } from "@/components/effort-gate";
import { OptionFlow, type EffortInput } from "@/components/option-flow";
import type { UnitPrefs } from "@/lib/recipe/scale";

/**
 * The home screen.
 *
 * "Surprise me" is one tap and takes no input: it skips stage 1 entirely with
 * a default effort band and goes straight to eight options generated from
 * silent context alone. Guard that in review — it is the whole reason the
 * app exists, and anything added in front of it is a regression however good
 * it looks. "Craft a recipe" is the entry point into the full build-your-own
 * flow (time band, eight directions, tailoring, three variations, the
 * recipe) for when the household wants to steer rather than be surprised.
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
        onClick={() => {
          setInput({ effortBand: "standard", needsUsingUp: null });
          setMode("running");
        }}
        className="min-h-32 w-full rounded-3xl bg-accent px-6 py-8 text-left text-on-accent"
      >
        <span className="block text-2xl font-semibold tracking-tight">Surprise me</span>
        <span className="mt-1 block text-base opacity-90">
          Eight directions from what you like. No questions.
        </span>
      </button>
    </div>
  );
}
