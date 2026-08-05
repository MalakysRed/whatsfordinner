import type { SeedAxis, SeedPoolRow } from "@/lib/db/types";
import type { Season } from "@/lib/ai/prompts/context";
import type { OptionAxes } from "@/lib/schemas/option";

/**
 * The variance engine (feature spec §5.1–5.2).
 *
 * Pure logic, no I/O — the caller fetches the seed pool and the household's
 * recent generations, and this module turns them into a seed draw plus the
 * two checks that get wired into `runGeneration`'s `validate` callback: the
 * diversity axes and the dedup guardrail. Both reuse the existing
 * retry-once-with-a-correction machinery in src/lib/ai/client.ts, which also
 * means every dedup trigger is logged for free via the normal failed-attempt
 * row in `generations` — no separate logging path needed.
 */

export type EffortBand = "quick" | "standard" | "project";

export interface DrawnSeed {
  axis: SeedAxis;
  name: string;
}

/**
 * One seed per requested axis, drawn from the active pool.
 *
 * Cuisine and hero are weighted by season: a row tagged for the current
 * season is twice as likely to be drawn as an all-year row, but a row tagged
 * for a different season is not excluded outright — spring lamb can still
 * turn up in autumn, just less often. Format is filtered, not weighted: a
 * "slow braise" seed offered against a "quick" effort band would contradict
 * the one thing stage 1 actually asked for. Anything drawn in the household's
 * last three generations is excluded outright either way (spec §5.1a).
 *
 * `axes` defaults to all three; the caller drops `hero` when a main
 * ingredient has already been pinned by the user — a hero seed would just
 * compete with it rather than add inspiration.
 */
export function drawSeeds(
  pool: SeedPoolRow[],
  season: Season,
  effortBand: EffortBand,
  excludedNames: ReadonlySet<string>,
  random: () => number = Math.random,
  axes: SeedAxis[] = ["cuisine", "format", "hero"],
): DrawnSeed[] {
  return axes
    .map((axis) => drawOne(pool, axis, season, effortBand, excludedNames, random))
    .filter((seed): seed is DrawnSeed => seed !== null);
}

/**
 * One seed per direction, cycling through the requested axes, instead of one
 * seed per axis shared across the whole set. A single seed per axis only
 * ever anchored two or three of the eight directions; every unseeded
 * direction was left to improvise from scratch against a near-identical
 * prompt call to call, and with nothing distinguishing them the model's
 * free choices collapsed onto its single most-probable "default" — which is
 * what made one direction (usually the first) repeat so consistently.
 * Reuses the exact same weighted/seasonal/effort-band-filtered draw as
 * drawSeeds for every slot.
 *
 * Duplicate seed values across slots are fine and expected once a small
 * pool (format, filtered to one effort band, is often just a handful of
 * rows) runs out of fresh candidates — two directions sharing a starting
 * cuisine or hero still have to differ on everything else per
 * findAxesCollisions. Within one call, already-used names are avoided where
 * possible so a small pool doesn't just hand back the same row eight times;
 * repeats only happen once an axis's eligible pool is genuinely exhausted.
 */
export function drawSeedSet(
  pool: SeedPoolRow[],
  season: Season,
  effortBand: EffortBand,
  excludedNames: ReadonlySet<string>,
  slotCount: number,
  random: () => number = Math.random,
  axes: SeedAxis[] = ["cuisine", "format", "hero"],
): DrawnSeed[] {
  const usedThisBatch = new Set<string>();
  const seeds: DrawnSeed[] = [];

  for (let i = 0; i < slotCount; i++) {
    const axis = axes[i % axes.length];
    const combinedExclusions = new Set([...excludedNames, ...usedThisBatch]);
    const fresh = drawOne(pool, axis, season, effortBand, combinedExclusions, random);
    const picked = fresh ?? drawOne(pool, axis, season, effortBand, excludedNames, random);

    if (picked) {
      seeds.push(picked);
      usedThisBatch.add(picked.name);
    }
  }

  return seeds;
}

function drawOne(
  pool: SeedPoolRow[],
  axis: SeedAxis,
  season: Season,
  effortBand: EffortBand,
  excludedNames: ReadonlySet<string>,
  random: () => number,
): DrawnSeed | null {
  const eligible = pool.filter(
    (row) => row.axis === axis && row.status === "active" && !excludedNames.has(row.name),
  );

  const candidates =
    axis === "format" ? eligible.filter((row) => row.tags.includes(effortBand)) : eligible;

  if (candidates.length === 0) return null;

  const weighted =
    axis === "format"
      ? candidates
      : candidates.flatMap((row) => {
          const inSeason = row.tags.length === 0 || row.tags.includes(season);
          return Array(inSeason ? 2 : 1).fill(row) as SeedPoolRow[];
        });

  const picked = weighted[Math.floor(random() * weighted.length)];
  return { axis: picked.axis, name: picked.name };
}

/**
 * The four axes must genuinely differ across the option set (spec §5.1c) — no
 * two options may share an identical protein+method+cuisine combination. This
 * is the floor that stops "eight variations on one idea"; the model is also
 * instructed to vary richness, which is harder to check mechanically and is
 * left to the prompt.
 *
 * `ignoreProtein` drops protein from the comparison — used when a main
 * ingredient has been pinned, since all eight options share it by design and
 * the collision check would otherwise trip on the very field the user chose.
 */
export function findAxesCollisions(
  optionAxes: OptionAxes[],
  { ignoreProtein = false }: { ignoreProtein?: boolean } = {},
): number[][] {
  const seen = new Map<string, number[]>();

  optionAxes.forEach((axes, index) => {
    const key = [
      ignoreProtein ? null : normaliseToken(axes.protein),
      normaliseToken(axes.method),
      normaliseToken(axes.cuisine),
    ]
      .filter((part): part is string => part !== null)
      .join("|");
    seen.set(key, [...(seen.get(key) ?? []), index]);
  });

  return Array.from(seen.values()).filter((indices) => indices.length > 1);
}

function normaliseToken(value: string): string {
  return value.trim().toLowerCase();
}

function titleTokens(title: string): Set<string> {
  return new Set(
    title
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter(Boolean),
  );
}

/** Fraction of `a`'s tokens that also appear in `b`, 0..1. */
export function tokenOverlap(a: string, b: string): number {
  const tokensA = titleTokens(a);
  if (tokensA.size === 0) return 0;

  const tokensB = titleTokens(b);
  const shared = Array.from(tokensA).filter((token) => tokensB.has(token)).length;

  return shared / tokensA.size;
}

/**
 * Titles in `newTitles` that overlap more than 50% with something in
 * `previousTitles` (spec §5.2) — the dedup guardrail. Regenerating once with
 * a fresh seed draw and a stronger diversity instruction is the caller's job;
 * this only detects the collision.
 */
export function findDuplicateTitles(
  newTitles: string[],
  previousTitles: string[],
  threshold = 0.5,
): string[] {
  return newTitles.filter((title) =>
    previousTitles.some((previous) => tokenOverlap(title, previous) > threshold),
  );
}
