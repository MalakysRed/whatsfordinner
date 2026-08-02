import { describe, expect, it } from "vitest";
import { isInBank, namesNotInBank } from "./bank-match";
import type { IngredientRow } from "@/lib/db/types";

function ingredient(name: string): IngredientRow {
  return {
    id: name,
    household_id: "h1",
    name,
    category: "pantry",
    typical_unit: null,
    loved: false,
    disliked: false,
    staple: false,
    allergen: false,
    notes: null,
    seasonality: null,
    use_count: 0,
    suitable_meal_types: null,
    created_at: "",
  };
}

const bank = [ingredient("Chicken thighs"), ingredient("Tenderstem broccoli"), ingredient("Soy sauce")];

describe("isInBank", () => {
  it("matches exactly, case insensitively", () => {
    expect(isInBank("soy sauce", bank)).toBe(true);
  });

  it("matches a substring in either direction", () => {
    expect(isInBank("chicken", bank)).toBe(true);
    expect(isInBank("tenderstem", bank)).toBe(true);
  });

  it("does not match something unrelated", () => {
    expect(isInBank("smoked paprika", bank)).toBe(false);
  });
});

describe("namesNotInBank", () => {
  it("filters to only the unmatched names", () => {
    expect(namesNotInBank(["Chicken thighs", "Smoked paprika", "Soy sauce"], bank)).toEqual([
      "Smoked paprika",
    ]);
  });
});
