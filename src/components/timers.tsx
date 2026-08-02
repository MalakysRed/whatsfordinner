"use client";

import { useState } from "react";
import { Card } from "@/components/ui";
import type { useTimers } from "@/lib/timers/use-timers";

type TimersApi = ReturnType<typeof useTimers>;

export function formatRemaining(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

const PRESETS_MIN = [1, 5, 10, 15, 20, 30];

/**
 * A manual timer, reachable in one tap from anywhere on the card (FR7.5),
 * plus the running list with live countdowns.
 */
export function TimerControl({ timers, now, startTimer, dismissTimer }: TimersApi) {
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [customMinutes, setCustomMinutes] = useState("");

  function start(minutes: number) {
    startTimer(label.trim() || `${minutes} min`, minutes * 60_000);
    setLabel("");
    setCustomMinutes("");
    setOpen(false);
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="min-h-9 rounded-lg border border-line px-3 py-1.5 text-sm font-medium"
        >
          {open ? "Close" : "+ Timer"}
        </button>
        {timers.length > 0 && (
          <span className="text-sm text-muted">
            {timers.length} timer{timers.length === 1 ? "" : "s"} running
          </span>
        )}
      </div>

      {open && (
        <Card className="space-y-2 p-3">
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="What's it for? (optional)"
            className="w-full rounded-lg border border-line bg-background px-3 py-2 text-sm outline-none focus:border-accent"
          />
          <div className="flex flex-wrap gap-2">
            {PRESETS_MIN.map((minutes) => (
              <button
                key={minutes}
                type="button"
                onClick={() => start(minutes)}
                className="min-h-9 rounded-lg border border-line px-3 py-1.5 text-sm"
              >
                {minutes} min
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              value={customMinutes}
              onChange={(e) => setCustomMinutes(e.target.value)}
              placeholder="Minutes"
              inputMode="numeric"
              className="flex-1 rounded-lg border border-line bg-background px-3 py-2 text-sm outline-none focus:border-accent"
            />
            <button
              type="button"
              onClick={() => {
                const minutes = Number(customMinutes);
                if (minutes > 0) start(minutes);
              }}
              className="min-h-9 rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-on-accent"
            >
              Start
            </button>
          </div>
        </Card>
      )}

      {timers.length > 0 && (
        <ul className="space-y-1">
          {timers.map((timer) => {
            const remaining = timer.endsAt - now;
            const done = remaining <= 0;
            return (
              <li
                key={timer.id}
                className={`flex items-center justify-between rounded-lg border px-3 py-2 text-sm ${
                  done ? "border-danger text-danger" : "border-line"
                }`}
              >
                <span>{timer.label}</span>
                <span className="flex items-center gap-2">
                  <span className="tabular-nums">{done ? "Done" : formatRemaining(remaining)}</span>
                  <button type="button" onClick={() => dismissTimer(timer.id)} className="underline">
                    Dismiss
                  </button>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** FR7.4 — the nearest expiring timer, pinned to the top of cooking mode. */
export function TimerBar({ timers, now, dismissTimer }: TimersApi) {
  if (timers.length === 0) return null;

  const nearest = [...timers].sort((a, b) => a.endsAt - b.endsAt)[0];
  const remaining = nearest.endsAt - now;
  const done = remaining <= 0;

  return (
    <div
      className={`flex items-center justify-between px-4 py-2 text-sm font-medium ${
        done ? "bg-danger text-on-accent" : "bg-raised"
      }`}
    >
      <span>{nearest.label}</span>
      <span className="flex items-center gap-3">
        <span className="tabular-nums">{done ? "Done" : formatRemaining(remaining)}</span>
        {done && (
          <button type="button" onClick={() => dismissTimer(nearest.id)} className="underline">
            Dismiss
          </button>
        )}
        {timers.length > 1 && <span className="opacity-80">+{timers.length - 1} more</span>}
      </span>
    </div>
  );
}
