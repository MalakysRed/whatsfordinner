/**
 * Merging shopping list lines (FR9.3).
 *
 * Ingredient amounts already live in canonical metric base units (FR5.1), so
 * merging is mostly "same name, same unit family, sum it" — 200g plus 0.5kg
 * becomes 700g. A count word ("clove") only merges against an identical count
 * word; "2 clove" and "1 bulb" are the same ingredient in principle but not
 * safely summable, so FR9.3 asks for them to stay as separate lines rather
 * than merged wrongly.
 */

export type UnitFamily = "weight" | "volume" | "count";

const WEIGHT_TO_GRAMS: Record<string, number> = { g: 1, kg: 1000 };
const VOLUME_TO_ML: Record<string, number> = { ml: 1, l: 1000 };

export function unitFamily(unit: string | null): UnitFamily {
  if (unit === null) return "count";
  const lower = unit.toLowerCase();
  if (lower in WEIGHT_TO_GRAMS) return "weight";
  if (lower in VOLUME_TO_ML) return "volume";
  return "count";
}

/** The base-unit amount used for summing: grams, millilitres, or the raw count. */
export function toBaseAmount(amount: number, unit: string | null): number {
  if (unit === null) return amount;
  const lower = unit.toLowerCase();
  if (lower in WEIGHT_TO_GRAMS) return amount * WEIGHT_TO_GRAMS[lower];
  if (lower in VOLUME_TO_ML) return amount * VOLUME_TO_ML[lower];
  return amount;
}

/** The unit a merged amount is stored under. */
export function baseUnit(unit: string | null): string | null {
  if (unit === null) return null;
  const lower = unit.toLowerCase();
  if (lower in WEIGHT_TO_GRAMS) return "g";
  if (lower in VOLUME_TO_ML) return "ml";
  return unit;
}

export interface MergeableLine {
  item: string;
  amount: number | null;
  unit: string | null;
}

/**
 * Whether two lines are the same ingredient and safe to fold into one —
 * same name (case/whitespace insensitive), and amounts that can actually be
 * summed: both amountless, or the same unit family with a count word that
 * matches exactly.
 */
export function canMerge(a: MergeableLine, b: MergeableLine): boolean {
  if (a.item.trim().toLowerCase() !== b.item.trim().toLowerCase()) return false;

  if (a.amount === null || b.amount === null) {
    return a.amount === null && b.amount === null;
  }

  const familyA = unitFamily(a.unit);
  const familyB = unitFamily(b.unit);
  if (familyA !== familyB) return false;

  if (familyA === "count") {
    return (a.unit ?? "").toLowerCase() === (b.unit ?? "").toLowerCase();
  }

  return true;
}

/** Sums two mergeable lines into their canonical unit. */
export function mergeAmounts(
  a: MergeableLine,
  b: MergeableLine,
): { amount: number | null; unit: string | null } {
  if (a.amount === null || b.amount === null) {
    return { amount: null, unit: a.unit };
  }

  const total = toBaseAmount(a.amount, a.unit) + toBaseAmount(b.amount, b.unit);
  return { amount: total, unit: baseUnit(a.unit) };
}
