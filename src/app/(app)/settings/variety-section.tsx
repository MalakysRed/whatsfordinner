"use client";

import { useState } from "react";
import { SaveForm } from "@/components/save-form";
import { Label, Select } from "@/components/ui";
import { RECENCY_LABELS } from "@/lib/schemas/settings";
import { saveVariety } from "./actions";
import type { SettingsRow } from "@/lib/db/types";

/**
 * FR2.7 — suggestion variety.
 *
 * "Only new" is a master toggle: while it is on, the three settings beneath it
 * do nothing, so they are hidden rather than left on screen looking live.
 */
export function VarietySection({ settings }: { settings: SettingsRow }) {
  const [onlyNew, setOnlyNew] = useState(settings.only_new);

  return (
    <SaveForm action={saveVariety}>
      <label className="flex items-start gap-3 rounded-xl border border-line p-4">
        <input
          type="checkbox"
          name="only_new"
          checked={onlyNew}
          onChange={(e) => setOnlyNew(e.target.checked)}
          className="mt-0.5 size-5 shrink-0 accent-[var(--accent)]"
        />
        <span className="text-base leading-6">
          Only suggest new things
          <span className="block text-sm text-muted">
            Excludes everything already in your recipe book — cooked, favourited,
            or merely saved.
          </span>
        </span>
      </label>

      {!onlyNew && (
        <div className="space-y-4 rounded-xl border border-line p-4">
          <div className="space-y-2">
            <Label htmlFor="recency_weighting">
              Offer something cooked recently?
            </Label>
            <Select
              id="recency_weighting"
              name="recency_weighting"
              defaultValue={settings.recency_weighting}
            >
              {Object.entries(RECENCY_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
            <p className="text-sm text-muted">
              Sets how many of the three suggestions may be something you have
              had lately. &ldquo;Never&rdquo; means none of them;
              &ldquo;always&rdquo; ignores what you have cooked entirely.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="recency_window_days">
              How long counts as recently?
            </Label>
            <div className="flex items-center gap-3">
              <input
                id="recency_window_days"
                name="recency_window_days"
                type="number"
                min={1}
                max={90}
                defaultValue={settings.recency_window_days}
                className="w-24 rounded-xl border border-line bg-raised px-4 py-3 text-base outline-none focus:border-accent"
              />
              <span className="text-base text-muted">days</span>
            </div>
            <p className="text-sm text-muted">
              Anything cooked before this is fair game again whatever the setting
              above says.
            </p>
          </div>

          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              name="include_favourites"
              defaultChecked={settings.include_favourites}
              className="mt-0.5 size-5 shrink-0 accent-[var(--accent)]"
            />
            <span className="text-base leading-6">
              Include favourites
              <span className="block text-sm text-muted">
                A favourite that fills a slot is shown as the card you saved, not
                a fresh take on it.
              </span>
            </span>
          </label>
        </div>
      )}
    </SaveForm>
  );
}
