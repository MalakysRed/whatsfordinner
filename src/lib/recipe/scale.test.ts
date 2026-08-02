import { describe, expect, it } from "vitest";
import {
  celsiusToFahrenheit,
  convertForDisplay,
  gasMarkFor,
  needsRecheck,
  roundForDisplay,
  scaleIngredients,
  servingRatio,
} from "./scale";
import type { RecipeIngredient } from "@/lib/schemas/recipe";

function ingredient(overrides: Partial<RecipeIngredient> = {}): RecipeIngredient {
  return {
    id: "ing_1",
    item: "chicken thighs",
    amount: 400,
    unit: "g",
    prep: null,
    component: "protein",
    scales: "linear",
    optional: false,
    in_bank: true,
    ...overrides,
  };
}

describe("servingRatio / needsRecheck", () => {
  it("computes a plain ratio", () => {
    expect(servingRatio(2, 4)).toBe(2);
    expect(servingRatio(4, 2)).toBe(0.5);
  });

  // FR5.4 — >2x or <0.5x offers a re-check; anything inside that band doesn't.
  it("flags a re-check only past 2x in either direction", () => {
    expect(needsRecheck(2, 4)).toBe(false); // exactly 2x, still fine
    expect(needsRecheck(2, 5)).toBe(true); // 2.5x
    expect(needsRecheck(4, 2)).toBe(false); // exactly 0.5x, still fine
    expect(needsRecheck(4, 1)).toBe(true); // 0.25x
    expect(needsRecheck(2, 3)).toBe(false);
  });
});

describe("scaleIngredients", () => {
  it("scales a linear ingredient proportionally", () => {
    const [scaled] = scaleIngredients([ingredient({ amount: 400 })], 2, 4);
    expect(scaled.amount).toBe(800);
  });

  // The PRD's own example of why sublinear exists: salt does not double.
  it("dampens a sublinear ingredient with square-root scaling", () => {
    const [scaled] = scaleIngredients(
      [ingredient({ amount: 4, unit: "g", scales: "sublinear" })],
      2,
      8, // 4x servings
    );
    expect(scaled.amount).toBeCloseTo(4 * Math.sqrt(4), 5); // 8, not 16
  });

  it("never changes a fixed ingredient regardless of ratio", () => {
    const [scaled] = scaleIngredients(
      [ingredient({ amount: 1, unit: "l", scales: "fixed" })],
      2,
      12,
    );
    expect(scaled.amount).toBe(1);
  });

  it("leaves an amountless ingredient alone", () => {
    const [scaled] = scaleIngredients(
      [ingredient({ amount: null, item: "salt, to taste" })],
      2,
      6,
    );
    expect(scaled.amount).toBeNull();
  });

  it("is a no-op at the base serving count", () => {
    const list = [ingredient()];
    expect(scaleIngredients(list, 4, 4)).toBe(list);
  });
});

describe("roundForDisplay — the PRD's literal worked examples", () => {
  it("1.33 eggs becomes a range, never a decimal", () => {
    // roundForDisplay owns only the amount+unit text; formatQuantity (in
    // render.ts) appends the item name on top of this.
    expect(roundForDisplay(1.33, "each")).toBe("1 to 2");
  });

  it("187.5g rounds to 190g", () => {
    expect(roundForDisplay(187.5, "g")).toBe("190g");
  });

  it("0.75 tsp stays as the fraction 3/4 tsp, not a decimal", () => {
    expect(roundForDisplay(0.75, "tsp")).toBe("3/4 tsp");
  });

  it("fractional whole items are never shown as decimals", () => {
    expect(roundForDisplay(2.6, "clove")).toBe("2 to 3 clove");
    expect(roundForDisplay(3.02, "each")).toBe("3"); // close enough to round
  });

  it("grams under 100 round to the nearest 5", () => {
    expect(roundForDisplay(37, "g")).toBe("35g");
    expect(roundForDisplay(12, "g")).toBe("10g");
  });

  it("tbsp also snaps to a fraction", () => {
    expect(roundForDisplay(1 / 3, "tbsp")).toBe("1/3 tbsp");
    expect(roundForDisplay(1.5, "tbsp")).toBe("1 1/2 tbsp");
  });

  it("ml rounds to whole numbers, litres to one decimal place", () => {
    expect(roundForDisplay(233.7, "ml")).toBe("234ml");
    expect(roundForDisplay(1.02, "l")).toBe("1l");
  });
});

describe("convertForDisplay", () => {
  const grams400 = { units_weight: "imperial" as const, units_volume: "metric" as const, units_temp: "c" as const, units_length: "cm" as const, show_gas_mark: false };

  it("leaves metric alone when the household prefers metric", () => {
    const metricPrefs = { ...grams400, units_weight: "metric" as const };
    expect(convertForDisplay(400, "g", metricPrefs)).toEqual({ amount: 400, unit: "g" });
  });

  it("converts grams to ounces under a pound", () => {
    const result = convertForDisplay(400, "g", grams400);
    expect(result.unit).toBe("oz");
    expect(result.amount).toBeCloseTo(14.11, 1);
  });

  it("converts large gram amounts to pounds", () => {
    const result = convertForDisplay(900, "g", grams400);
    expect(result.unit).toBe("lb");
  });

  // FR5.6 — UK pints (568ml), not the US pint, unless the household opts into cups.
  it("uses a UK pint, not a US pint, for large volumes", () => {
    const ukPrefs = { ...grams400, units_weight: "metric" as const, units_volume: "imperial" as const };
    const result = convertForDisplay(568, "ml", ukPrefs);
    expect(result.unit).toBe("pint");
    expect(result.amount).toBeCloseTo(1, 5);
  });

  it("converts small volumes to fl oz under a UK pint", () => {
    const ukPrefs = { ...grams400, units_weight: "metric" as const, units_volume: "imperial" as const };
    const result = convertForDisplay(100, "ml", ukPrefs);
    expect(result.unit).toBe("fl oz");
  });

  it("only converts to US cups when explicitly opted in", () => {
    const cupsPrefs = { ...grams400, units_weight: "metric" as const, units_volume: "us_cups" as const };
    const result = convertForDisplay(240, "ml", cupsPrefs);
    expect(result.unit).toBe("cup");
    expect(result.amount).toBeCloseTo(1, 5);
  });

  it("passes through units it does not recognise, like count words", () => {
    expect(convertForDisplay(2, "clove", grams400)).toEqual({ amount: 2, unit: "clove" });
  });
});

describe("temperature and gas mark", () => {
  it("converts celsius to fahrenheit", () => {
    expect(celsiusToFahrenheit(190)).toBeCloseTo(374, 0);
  });

  it("finds the nearest gas mark", () => {
    expect(gasMarkFor(190)).toBe(5);
    expect(gasMarkFor(180)).toBe(4);
  });
});
