"use client";

import { useState } from "react";
import { Card } from "@/components/ui";
import type { EffortInput } from "@/components/option-flow";

/**
 * Stage 1 — the input gate. One tap for effort band, an optional main
 * ingredient (a real constraint on stage 2, not a nudge — see
 * generate.ts's `buildOptionsRequestBlock`), and an optional "anything to
 * use up?" field. Nothing else is asked before generation: cuisine and
 * ingredient filters live downstream, as reactions to what comes back, not
 * constraints on the request.
 */

const BANDS: { value: EffortInput["effortBand"]; label: string; detail: string }[] = [
  { value: "quick", label: "Quick", detail: "Around 20 minutes, minimal washing up" },
  { value: "standard", label: "Standard", detail: "45 to 60 minutes, a proper cook" },
  { value: "project", label: "Project", detail: "An evening, actively enjoyable" },
];

export function EffortGate({ onSubmit }: { onSubmit: (input: EffortInput) => void }) {
  const [band, setBand] = useState<EffortInput["effortBand"] | null>(null);
  const [mainIngredient, setMainIngredient] = useState("");
  const [needsUsingUp, setNeedsUsingUp] = useState("");

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        {BANDS.map((b) => (
          <button
            key={b.value}
            type="button"
            onClick={() => setBand(b.value)}
            className={`w-full rounded-2xl border px-5 py-4 text-left ${
              band === b.value ? "border-accent bg-raised" : "border-line bg-raised"
            }`}
          >
            <span className="block text-lg font-medium">{b.label}</span>
            <span className="block text-sm text-muted">{b.detail}</span>
          </button>
        ))}
      </div>

      <Card className="space-y-2 p-4">
        <label htmlFor="main-ingredient" className="block text-sm font-medium">
          Main ingredient (optional)
        </label>
        <input
          id="main-ingredient"
          value={mainIngredient}
          onChange={(e) => setMainIngredient(e.target.value)}
          placeholder="chicken"
          className="w-full rounded-xl border border-line bg-background px-4 py-3 text-base outline-none focus:border-accent"
        />
        <p className="text-sm text-muted">
          If you set this, all eight options will be built around it.
        </p>
      </Card>

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
        onClick={() =>
          band &&
          onSubmit({
            effortBand: band,
            mainIngredient: mainIngredient.trim() || null,
            needsUsingUp: needsUsingUp.trim() || null,
          })
        }
        className="min-h-12 w-full rounded-xl bg-accent px-4 py-3 text-base font-medium text-on-accent disabled:opacity-50"
      >
        Show me options
      </button>
    </div>
  );
}
