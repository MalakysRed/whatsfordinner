"use client";

import { useState } from "react";
import { EffortGate } from "@/components/effort-gate";
import { OptionFlow, type EffortInput } from "@/components/option-flow";
import type { UnitPrefs } from "@/lib/recipe/scale";

/**
 * The home screen.
 *
 * "Surprise us" is one tap and takes no input: it skips stage 1 entirely with
 * a default effort band and goes straight to eight options generated from
 * silent context alone. Guard that in review — it is the whole reason the
 * app exists, and anything added in front of it is a regression however good
 * it looks. "Choose your effort" is the one-question stage-1 gate for when
 * the household wants to say how much cooking they're up for.
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
        onClick={() => {
          setInput({ effortBand: "standard", needsUsingUp: null });
          setMode("running");
        }}
        className="min-h-32 w-full rounded-3xl bg-accent px-6 py-8 text-left text-on-accent"
      >
        <span className="block text-2xl font-semibold tracking-tight">Surprise us</span>
        <span className="mt-1 block text-base opacity-90">
          Eight directions from what you like. No questions.
        </span>
      </button>

      <button
        type="button"
        onClick={() => setMode("gate")}
        className="flex min-h-24 w-full flex-col justify-center rounded-2xl border border-line bg-raised px-5 py-4 text-left"
      >
        <span className="text-lg font-medium">Choose your effort</span>
        <span className="mt-0.5 text-sm text-muted">Quick, standard, or a project</span>
      </button>
    </div>
  );
}
