import { describe, expect, it } from "vitest";
import { canMerge, mergeAmounts, unitFamily } from "./merge";

describe("unitFamily", () => {
  it("classifies weight, volume and count", () => {
    expect(unitFamily("g")).toBe("weight");
    expect(unitFamily("kg")).toBe("weight");
    expect(unitFamily("ml")).toBe("volume");
    expect(unitFamily("l")).toBe("volume");
    expect(unitFamily("clove")).toBe("count");
    expect(unitFamily(null)).toBe("count");
  });
});

describe("canMerge", () => {
  it("merges the same item across a weight unit family", () => {
    expect(canMerge({ item: "Flour", amount: 200, unit: "g" }, { item: "flour", amount: 0.5, unit: "kg" })).toBe(
      true,
    );
  });

  it("does not merge different items", () => {
    expect(canMerge({ item: "Flour", amount: 200, unit: "g" }, { item: "Sugar", amount: 200, unit: "g" })).toBe(
      false,
    );
  });

  it("does not merge across unit families", () => {
    expect(canMerge({ item: "Garlic", amount: 2, unit: "clove" }, { item: "Garlic", amount: 200, unit: "g" })).toBe(
      false,
    );
  });

  it("does not merge mismatched count words", () => {
    expect(canMerge({ item: "Garlic", amount: 2, unit: "clove" }, { item: "Garlic", amount: 1, unit: "bulb" })).toBe(
      false,
    );
  });

  it("merges matching count words", () => {
    expect(canMerge({ item: "Garlic", amount: 2, unit: "clove" }, { item: "Garlic", amount: 3, unit: "clove" })).toBe(
      true,
    );
  });

  it("merges two amountless lines of the same item", () => {
    expect(canMerge({ item: "Salt", amount: null, unit: null }, { item: "Salt", amount: null, unit: null })).toBe(
      true,
    );
  });

  it("does not merge an amountless line with an amounted one", () => {
    expect(canMerge({ item: "Salt", amount: null, unit: null }, { item: "Salt", amount: 5, unit: "g" })).toBe(false);
  });
});

describe("mergeAmounts", () => {
  it("sums 200g and 0.5kg to 700g, the PRD's own example", () => {
    expect(mergeAmounts({ item: "Flour", amount: 200, unit: "g" }, { item: "Flour", amount: 0.5, unit: "kg" })).toEqual({
      amount: 700,
      unit: "g",
    });
  });

  it("sums matching count words directly", () => {
    expect(
      mergeAmounts({ item: "Garlic", amount: 2, unit: "clove" }, { item: "Garlic", amount: 3, unit: "clove" }),
    ).toEqual({ amount: 5, unit: "clove" });
  });

  it("sums volumes into millilitres", () => {
    expect(mergeAmounts({ item: "Stock", amount: 500, unit: "ml" }, { item: "Stock", amount: 1, unit: "l" })).toEqual(
      { amount: 1500, unit: "ml" },
    );
  });
});
