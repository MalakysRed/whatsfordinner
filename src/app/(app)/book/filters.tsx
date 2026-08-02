"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CUISINES } from "../build/builder";

/**
 * Filters live in the URL (shareable, back-button-friendly) rather than
 * client state. Each control writes straight to the query string and the
 * server component re-queries — the household's saved recipes are not a
 * dataset worth keeping a client-side copy of just to avoid a round trip.
 */
export function BookFilters({
  favourited,
  cuisine,
  addedBy,
  time,
  q,
}: {
  favourited: string;
  cuisine: string;
  addedBy: string;
  time: string;
  q: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function update(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="space-y-2">
      <input
        type="search"
        defaultValue={q}
        onKeyDown={(e) => {
          if (e.key === "Enter") update("q", e.currentTarget.value);
        }}
        onBlur={(e) => update("q", e.currentTarget.value)}
        placeholder="Search the book"
        aria-label="Search saved recipes"
        className="w-full rounded-xl border border-line bg-raised px-4 py-3 text-base outline-none focus:border-accent"
      />

      <div className="flex flex-wrap gap-2">
        <select
          value={favourited}
          onChange={(e) => update("favourited", e.target.value)}
          aria-label="Filter by favourited"
          className="min-h-11 appearance-none rounded-xl border border-line bg-raised px-3 py-2 text-sm outline-none focus:border-accent"
        >
          <option value="">Any favourite</option>
          <option value="me">Favourited by me</option>
          <option value="both">Favourited by both</option>
          <option value="other">Favourited by them</option>
        </select>

        <select
          value={cuisine}
          onChange={(e) => update("cuisine", e.target.value)}
          aria-label="Filter by cuisine"
          className="min-h-11 appearance-none rounded-xl border border-line bg-raised px-3 py-2 text-sm outline-none focus:border-accent"
        >
          <option value="">Any cuisine</option>
          {CUISINES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>

        <select
          value={time}
          onChange={(e) => update("time", e.target.value)}
          aria-label="Filter by time"
          className="min-h-11 appearance-none rounded-xl border border-line bg-raised px-3 py-2 text-sm outline-none focus:border-accent"
        >
          <option value="">Any time</option>
          <option value="30">Under 30 min</option>
          <option value="60">Under 60 min</option>
        </select>

        <select
          value={addedBy}
          onChange={(e) => update("added_by", e.target.value)}
          aria-label="Filter by who added it"
          className="min-h-11 appearance-none rounded-xl border border-line bg-raised px-3 py-2 text-sm outline-none focus:border-accent"
        >
          <option value="">Added by anyone</option>
          <option value="me">Added by me</option>
          <option value="other">Added by them</option>
        </select>
      </div>
    </div>
  );
}
