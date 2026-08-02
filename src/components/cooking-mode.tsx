"use client";

import { useEffect, useRef, useState, type TouchEvent } from "react";
import { useWakeLock } from "@/lib/cooking/use-wake-lock";
import { useTimers } from "@/lib/timers/use-timers";
import { TimerBar, TimerControl } from "@/components/timers";

export interface CookingStep {
  n: number;
  /** Placeholders already substituted — cooking mode never touches {ing_N}. */
  text: string;
  durationSeconds: number | null;
  /** Already converted to the household's preferred unit, e.g. "180°C". */
  temperatureText: string | null;
}

function tickedStorageKey(recipeKey: string) {
  return `whatsfordinner:cooking-ticked:${recipeKey}`;
}

function loadTicked(recipeKey: string): Set<number> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(tickedStorageKey(recipeKey));
    return raw ? new Set(JSON.parse(raw) as number[]) : new Set();
  } catch {
    return new Set();
  }
}

function formatStepDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.round(seconds / 60);
  return `${minutes} min`;
}

/**
 * Cooking mode (FR6): one step per screen, large type, swipe or tap to
 * advance. Ticked steps and the running timers both survive leaving and
 * returning to this screen — the whole point is that a phone can go in a
 * pocket mid-step without losing the place.
 */
export function CookingMode({
  recipeKey,
  title,
  steps,
  ingredientLines,
  onClose,
}: {
  recipeKey: string;
  title: string;
  steps: CookingStep[];
  ingredientLines: string[];
  onClose: () => void;
}) {
  const [index, setIndex] = useState(0);
  const [panel, setPanel] = useState<"none" | "ingredients" | "timers">("none");
  const [ticked, setTicked] = useState<Set<number>>(() => loadTicked(recipeKey));
  const { supported: wakeLockSupported } = useWakeLock(true);
  const timers = useTimers();

  useEffect(() => {
    window.localStorage.setItem(tickedStorageKey(recipeKey), JSON.stringify(Array.from(ticked)));
  }, [recipeKey, ticked]);

  function toggleTick(n: number) {
    setTicked((current) => {
      const next = new Set(current);
      if (next.has(n)) next.delete(n);
      else next.add(n);
      return next;
    });
  }

  const step = steps[index];
  const isFirst = index === 0;
  const isLast = index === steps.length - 1;

  const touchStartX = useRef<number | null>(null);

  function onTouchStart(e: TouchEvent) {
    touchStartX.current = e.touches[0]?.clientX ?? null;
  }

  function onTouchEnd(e: TouchEvent) {
    if (touchStartX.current === null) return;
    const delta = (e.changedTouches[0]?.clientX ?? 0) - touchStartX.current;
    touchStartX.current = null;
    if (delta < -50 && !isLast) setIndex((i) => i + 1);
    if (delta > 50 && !isFirst) setIndex((i) => i - 1);
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      <TimerBar {...timers} />

      <div className="flex items-center justify-between gap-2 px-4 py-3">
        <button type="button" onClick={onClose} className="min-h-11 text-sm text-muted underline">
          Exit
        </button>
        <h1 className="truncate text-sm font-medium">{title}</h1>
        <div className="flex shrink-0 gap-3">
          <button
            type="button"
            onClick={() => setPanel(panel === "timers" ? "none" : "timers")}
            className="min-h-11 text-sm font-medium text-accent underline"
          >
            Timers{timers.timers.length > 0 ? ` (${timers.timers.length})` : ""}
          </button>
          <button
            type="button"
            onClick={() => setPanel(panel === "ingredients" ? "none" : "ingredients")}
            className="min-h-11 text-sm font-medium text-accent underline"
          >
            Ingredients
          </button>
        </div>
      </div>

      {!wakeLockSupported && (
        <p className="px-4 pb-2 text-xs text-muted">
          Your browser can&rsquo;t keep the screen on automatically here — you
          may need to tap it occasionally.
        </p>
      )}

      <div className="px-4 pb-2">
        <div className="h-1 overflow-hidden rounded-full bg-line">
          <div
            className="h-full rounded-full bg-accent transition-all duration-300"
            style={{ width: `${((index + 1) / steps.length) * 100}%` }}
          />
        </div>
        <p className="mt-1 text-xs text-muted">
          Step {index + 1} of {steps.length}
        </p>
      </div>

      <div
        className="flex flex-1 flex-col justify-center gap-6 overflow-y-auto px-6 py-4"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        <p className="text-2xl font-medium leading-snug">{step.text}</p>

        {(step.durationSeconds || step.temperatureText) && (
          <div className="flex flex-wrap items-center gap-3">
            {step.temperatureText && (
              <span className="text-base text-muted">{step.temperatureText}</span>
            )}
            {step.durationSeconds && (
              <button
                type="button"
                onClick={() =>
                  timers.startTimer(`Step ${step.n}`, step.durationSeconds! * 1000)
                }
                className="min-h-11 rounded-xl border border-line px-4 py-2 text-base font-medium"
              >
                Start {formatStepDuration(step.durationSeconds)} timer
              </button>
            )}
          </div>
        )}

        <label className="flex items-center gap-2 text-base">
          <input
            type="checkbox"
            checked={ticked.has(step.n)}
            onChange={() => toggleTick(step.n)}
            className="size-5 accent-[var(--accent)]"
          />
          Done
        </label>
      </div>

      <div className="flex gap-3 px-4 py-4">
        <button
          type="button"
          disabled={isFirst}
          onClick={() => setIndex((i) => i - 1)}
          className="min-h-12 flex-1 rounded-xl border border-line px-4 py-3 text-base font-medium disabled:opacity-40"
        >
          Back
        </button>
        {isLast ? (
          <button
            type="button"
            onClick={onClose}
            className="min-h-12 flex-1 rounded-xl bg-accent px-4 py-3 text-base font-medium text-on-accent"
          >
            Finish
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setIndex((i) => i + 1)}
            className="min-h-12 flex-1 rounded-xl bg-accent px-4 py-3 text-base font-medium text-on-accent"
          >
            Next
          </button>
        )}
      </div>

      {panel === "ingredients" && (
        <div className="fixed inset-0 z-[60] flex flex-col bg-background">
          <div className="flex items-center justify-between px-4 py-3">
            <h2 className="text-lg font-semibold">Ingredients</h2>
            <button
              type="button"
              onClick={() => setPanel("none")}
              className="min-h-11 text-sm font-medium text-accent underline"
            >
              Back to step {index + 1}
            </button>
          </div>
          <ul className="flex-1 space-y-2 overflow-y-auto px-4 py-2">
            {ingredientLines.map((line, i) => (
              <li key={i} className="text-base">
                {line}
              </li>
            ))}
          </ul>
        </div>
      )}

      {panel === "timers" && (
        <div className="fixed inset-0 z-[60] flex flex-col bg-background">
          <div className="flex items-center justify-between px-4 py-3">
            <h2 className="text-lg font-semibold">Timers</h2>
            <button
              type="button"
              onClick={() => setPanel("none")}
              className="min-h-11 text-sm font-medium text-accent underline"
            >
              Back to step {index + 1}
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-4 py-2">
            <TimerControl {...timers} />
          </div>
        </div>
      )}
    </div>
  );
}
