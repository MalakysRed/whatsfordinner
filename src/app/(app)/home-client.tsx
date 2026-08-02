"use client";

import { useState } from "react";
import Link from "next/link";
import { SuggestionFlow } from "@/components/suggestion-flow";
import type { UnitPrefs } from "@/lib/recipe/scale";

/**
 * The home screen.
 *
 * "Surprise us" is one tap and takes no input: it generates from the ingredient
 * bank, the settings and the dietary rules alone. Guard that in review — it is
 * the whole reason the app exists, and anything added in front of it is a
 * regression however good it looks.
 */
export function HomeClient({
  defaultServings,
  unitPrefs,
}: {
  defaultServings: number;
  unitPrefs?: UnitPrefs;
}) {
  const [surprising, setSurprising] = useState(false);

  if (surprising) {
    return (
      <div className="space-y-5">
        <button
          type="button"
          onClick={() => setSurprising(false)}
          className="min-h-11 text-sm text-muted underline"
        >
          Start over
        </button>
        <SuggestionFlow
          constraints={{}}
          autoStart
          defaultServings={defaultServings}
          unitPrefs={unitPrefs}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={() => setSurprising(true)}
        className="min-h-32 w-full rounded-3xl bg-accent px-6 py-8 text-left text-on-accent"
      >
        <span className="block text-2xl font-semibold tracking-tight">Surprise us</span>
        <span className="mt-1 block text-base opacity-90">
          Three dinners from what you like. No questions.
        </span>
      </button>

      <div className="grid grid-cols-2 gap-3">
        <Link
          href="/build"
          className="flex min-h-24 flex-col justify-center rounded-2xl border border-line bg-raised px-5 py-4"
        >
          <span className="text-lg font-medium">Build a meal</span>
          <span className="mt-0.5 text-sm text-muted">Pick the shape of it</span>
        </Link>

        <Link
          href="/build?use-it-up=1"
          className="flex min-h-24 flex-col justify-center rounded-2xl border border-line bg-raised px-5 py-4"
        >
          <span className="text-lg font-medium">Use it up</span>
          <span className="mt-0.5 text-sm text-muted">What needs eating?</span>
        </Link>
      </div>
    </div>
  );
}
