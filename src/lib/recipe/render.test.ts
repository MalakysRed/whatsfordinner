import { describe, expect, it } from "vitest";
import { formatMinutes, formatQuantity, renderStepText } from "./render";
import type { RecipeIngredient } from "@/lib/schemas/recipe";

function ingredient(overrides: Partial<RecipeIngredient> = {}): RecipeIngredient {
  return {
    id: "ing_1",
    item: "chicken thighs, boneless and skinless",
    amount: 400,
    unit: "g",
    prep: "cut into 3cm pieces",
    component: "protein",
    scales: "linear",
    optional: false,
    in_bank: true,
    ...overrides,
  };
}

describe("formatQuantity", () => {
  it("runs metric units straight onto the number", () => {
    expect(formatQuantity(ingredient())).toBe(
      "400g chicken thighs, boneless and skinless",
    );
  });

  it("spaces out units that are words", () => {
    expect(
      formatQuantity(ingredient({ item: "garlic", amount: 2, unit: "clove" })),
    ).toBe("2 clove garlic");
  });

  it("drops the unit for counted items", () => {
    expect(
      formatQuantity(ingredient({ item: "eggs", amount: 3, unit: "each" })),
    ).toBe("3 eggs");
  });

  // "Salt, to taste" has no number and must not render as "null salt".
  it("renders an amountless ingredient as just the item", () => {
    expect(
      formatQuantity(ingredient({ item: "flaky sea salt", amount: null, unit: null })),
    ).toBe("flaky sea salt");
  });

  it("trims floating point noise", () => {
    expect(
      formatQuantity(ingredient({ item: "oil", amount: 13.333333, unit: "ml" })),
    ).toBe("13.33ml oil");
  });
});

describe("renderStepText", () => {
  const ingredients = [
    ingredient({ id: "ing_1", item: "chicken thighs", amount: 400, unit: "g" }),
    ingredient({ id: "ing_4", item: "soy sauce", amount: 30, unit: "ml" }),
  ];

  // The contract the whole scaling design rests on.
  it("substitutes every placeholder with its quantity", () => {
    expect(
      renderStepText("Toss {ing_1} with {ing_4} and leave for 15 minutes.", ingredients),
    ).toBe("Toss 400g chicken thighs with 30ml soy sauce and leave for 15 minutes.");
  });

  it("substitutes the same placeholder more than once", () => {
    expect(renderStepText("Add {ing_4}, then more {ing_4}.", ingredients)).toBe(
      "Add 30ml soy sauce, then more 30ml soy sauce.",
    );
  });

  it("leaves text without placeholders alone", () => {
    expect(renderStepText("Bring a large pan of water to the boil.", ingredients)).toBe(
      "Bring a large pan of water to the boil.",
    );
  });

  // A dangling reference should have been rejected at parse time. If one ever
  // reaches here, showing it beats silently dropping an ingredient.
  it("leaves an unknown reference visible rather than dropping it", () => {
    expect(renderStepText("Stir in {ing_9}.", ingredients)).toBe("Stir in {ing_9}.");
  });

  // Rendering against a rescaled list is how the servings stepper will work,
  // with no second API call.
  it("reflects rescaled amounts without touching the step text", () => {
    const doubled = ingredients.map((i) => ({
      ...i,
      amount: i.amount === null ? null : i.amount * 2,
    }));

    expect(renderStepText("Toss {ing_1} with {ing_4}.", doubled)).toBe(
      "Toss 800g chicken thighs with 60ml soy sauce.",
    );
  });
});

describe("formatMinutes", () => {
  it("reads naturally either side of an hour", () => {
    expect(formatMinutes(45)).toBe("45 min");
    expect(formatMinutes(60)).toBe("1 hr");
    expect(formatMinutes(80)).toBe("1 hr 20 min");
    expect(formatMinutes(120)).toBe("2 hr");
  });
});
