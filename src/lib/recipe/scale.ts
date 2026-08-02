import type { RecipeIngredient } from "@/lib/schemas/recipe";
import type { SettingsRow } from "@/lib/db/types";

/**
 * Scaling, rounding and unit conversion (PRD FR5).
 *
 * Pure functions, no network calls. This is what lets the servings stepper
 * rescale a whole recipe instantly: `scaleIngredients` produces a new
 * ingredient list at the target serving count, and `render.ts`'s existing
 * placeholder substitution takes that list exactly as it already takes
 * `recipe.ingredients` — nothing about the {ing_N} contract changes.
 */

export type UnitPrefs = Pick<
  SettingsRow,
  "units_weight" | "units_volume" | "units_temp" | "units_length" | "show_gas_mark"
>;

export const METRIC_PREFS: UnitPrefs = {
  units_weight: "metric",
  units_volume: "metric",
  units_temp: "c",
  units_length: "cm",
  show_gas_mark: false,
};

// ---------------------------------------------------------------------------
// Scaling
// ---------------------------------------------------------------------------

export function servingRatio(base: number, target: number): number {
  return target / base;
}

/**
 * Offers a re-check rather than silently rescaling when the ratio moves too
 * far. Pan sizes and seasoning stop being sensible extrapolations past 2x in
 * either direction (FR5.4) — this is a signal to the caller, not a limit
 * enforced here; scaling itself still happens at any ratio.
 */
export function needsRecheck(base: number, target: number): boolean {
  const ratio = servingRatio(base, target);
  return ratio > 2 || ratio < 0.5;
}

/**
 * Salt, spices, oil for frying and water for boiling do not double when the
 * servings double. Square-root damping means doubling servings scales these
 * by ~1.41x rather than 2x — noticeable, not proportional (FR5.3).
 */
function scaledAmount(amount: number, scales: RecipeIngredient["scales"], ratio: number): number {
  switch (scales) {
    case "fixed":
      return amount;
    case "sublinear":
      return amount * Math.sqrt(ratio);
    case "linear":
      return amount * ratio;
  }
}

export function scaleIngredients(
  ingredients: RecipeIngredient[],
  baseServings: number,
  targetServings: number,
): RecipeIngredient[] {
  if (baseServings === targetServings) return ingredients;

  const ratio = servingRatio(baseServings, targetServings);

  return ingredients.map((ingredient) =>
    ingredient.amount === null
      ? ingredient
      : { ...ingredient, amount: scaledAmount(ingredient.amount, ingredient.scales, ratio) },
  );
}

// ---------------------------------------------------------------------------
// Unit conversion (FR5.6) — canonical storage is always metric base units
// (g, ml, C) per FR5.1; this only affects the display copy.
// ---------------------------------------------------------------------------

const OZ_PER_G = 1 / 28.3495;
const LB_PER_G = 1 / 453.592;
/** UK pint, 568ml — not the 473ml US pint. Only used when opted into cups. */
const UK_FL_OZ_PER_ML = 1 / 28.4131;
const US_CUP_PER_ML = 1 / 240;
const IN_PER_CM = 1 / 2.54;

const GAS_MARKS: [celsius: number, mark: number][] = [
  [135, 1],
  [149, 2],
  [163, 3],
  [177, 4],
  [190, 5],
  [204, 6],
  [218, 7],
  [230, 8],
  [245, 9],
];

/** Nearest gas mark for a given Celsius temperature, for display only. */
export function gasMarkFor(celsius: number): number {
  let closest = GAS_MARKS[0];
  for (const entry of GAS_MARKS) {
    if (Math.abs(entry[0] - celsius) < Math.abs(closest[0] - celsius)) closest = entry;
  }
  return closest[1];
}

export function celsiusToFahrenheit(c: number): number {
  return (c * 9) / 5 + 32;
}

/**
 * Converts a scaled amount for display, given the household's unit
 * preferences. Units the model wrote that aren't recognised (herb sprigs,
 * "clove", "each", pinches) pass through unchanged — conversion only applies
 * to the measurement families FR5.6 actually names.
 */
export function convertForDisplay(
  amount: number,
  unit: string,
  prefs: UnitPrefs,
): { amount: number; unit: string } {
  const lower = unit.toLowerCase();

  if (lower === "g" || lower === "kg") {
    if (prefs.units_weight !== "imperial") return { amount, unit };
    const grams = lower === "kg" ? amount * 1000 : amount;
    return grams >= 453.592
      ? { amount: grams * LB_PER_G, unit: "lb" }
      : { amount: grams * OZ_PER_G, unit: "oz" };
  }

  if (lower === "ml" || lower === "l") {
    if (prefs.units_volume === "metric") return { amount, unit };
    const ml = lower === "l" ? amount * 1000 : amount;
    if (prefs.units_volume === "us_cups") {
      return { amount: ml * US_CUP_PER_ML, unit: "cup" };
    }
    // UK imperial: pints above ~1 pint (568ml), fl oz below.
    return ml >= 568
      ? { amount: ml / 568, unit: "pint" }
      : { amount: ml * UK_FL_OZ_PER_ML, unit: "fl oz" };
  }

  return { amount, unit };
}

/** Temperature is a separate field on steps, not an ingredient unit. */
export function convertTemperature(celsius: number, prefs: UnitPrefs): string {
  const base =
    prefs.units_temp === "f"
      ? `${Math.round(celsiusToFahrenheit(celsius))}°F`
      : `${Math.round(celsius)}°C`;

  return prefs.show_gas_mark ? `${base} (gas ${gasMarkFor(celsius)})` : base;
}

export function convertLength(cm: number, prefs: UnitPrefs): string {
  return prefs.units_length === "inches"
    ? `${roundHalf(cm * IN_PER_CM)}in`
    : `${roundHalf(cm)}cm`;
}

function roundHalf(n: number): number {
  return Math.round(n * 2) / 2;
}

// ---------------------------------------------------------------------------
// Rounding (FR5.5) — "sensible" per the PRD's own examples, which are also
// this module's test cases: 1.33 eggs -> "1 to 2 eggs" (never a decimal count),
// 187.5g -> "190g", 0.75 tsp stays "3/4 tsp".
// ---------------------------------------------------------------------------

const TSP_TBSP_FRACTIONS: [decimal: number, label: string][] = [
  [0, "0"],
  [1 / 4, "1/4"],
  [1 / 3, "1/3"],
  [1 / 2, "1/2"],
  [2 / 3, "2/3"],
  [3 / 4, "3/4"],
  [1, "1"],
];

function nearestFraction(value: number): string {
  const whole = Math.floor(value);
  const remainder = value - whole;

  let closest = TSP_TBSP_FRACTIONS[0];
  for (const entry of TSP_TBSP_FRACTIONS) {
    if (Math.abs(entry[0] - remainder) < Math.abs(closest[0] - remainder)) closest = entry;
  }

  if (closest[1] === "0") return whole === 0 ? "0" : String(whole);
  if (closest[1] === "1") return String(whole + 1);
  return whole === 0 ? closest[1] : `${whole} ${closest[1]}`;
}

/**
 * Whether a unit is a countable item — "each", "clove", "sprig" — rather than
 * a measured quantity. These round to whole numbers or a range, never a
 * decimal: nobody buys 1.33 eggs.
 */
function isCountUnit(unit: string | null): boolean {
  if (!unit) return true; // amountless-unit ingredients like "2 eggs" store unit: null
  return !/^(g|kg|ml|l|tsp|tbsp)$/i.test(unit);
}

function roundGrams(amount: number): number {
  return amount >= 100 ? Math.round(amount / 10) * 10 : Math.round(amount / 5) * 5;
}

/**
 * The single entry point `render.ts` calls for the display string. Takes an
 * already-scaled, already-unit-converted amount and returns the complete
 * "amount plus unit" text — the caller (`formatQuantity`) only has to append
 * the item name, it never has to reason about spacing or which units get a
 * suffix. `unit` is whatever the model wrote (a free-text field in the
 * schema), so anything unrecognised falls through to a plain decimal rather
 * than erroring.
 */
export function roundForDisplay(amount: number, unit: string | null): string {
  const lower = unit?.toLowerCase() ?? "";

  if (lower === "tsp" || lower === "tbsp") {
    return `${nearestFraction(amount)} ${unit}`;
  }

  if (lower === "g") return `${roundGrams(amount)}g`;
  if (lower === "kg") return `${Math.round(amount * 100) / 100}kg`;
  if (lower === "ml") return `${Math.round(amount)}ml`;
  if (lower === "l") return `${Math.round(amount * 10) / 10}l`;

  if (isCountUnit(unit)) {
    const whole = Math.round(amount);
    // A near-integer amount (already whole, or scaling landed close to one)
    // just rounds. Anything meaningfully fractional becomes a range rather
    // than a decimal count — "1.33 eggs" has no sensible literal meaning.
    const text =
      Math.abs(amount - whole) < 0.15 ? String(whole) : `${Math.floor(amount)} to ${Math.ceil(amount)}`;
    return unit && unit !== "each" ? `${text} ${unit}` : text;
  }

  // Anything else (fl oz, pint, cup, oz, lb, or an unrecognised unit): round
  // to a sensible number of decimal places rather than showing float noise.
  return `${Math.round(amount * 100) / 100} ${unit}`;
}
