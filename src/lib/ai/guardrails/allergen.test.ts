import { describe, expect, it } from "vitest";
import {
  checkRecipeForAllergens,
  checkSuggestionForAllergens,
  expandAllergenTerms,
} from "./allergen";
import type { Recipe } from "@/lib/schemas/recipe";
import type { Suggestion } from "@/lib/schemas/suggestion";

function recipe(overrides: Partial<Recipe> = {}): Recipe {
  return {
    title: "Tomato and butter bean stew",
    meal_type: "dinner",
    description: "A quiet weeknight stew.",
    cuisine: "Spanish",
    base_servings: 2,
    total_minutes: 35,
    active_minutes: 15,
    difficulty: "easy",
    equipment: ["Hob"],
    ingredients: [
      {
        id: "ing_1",
        item: "butter beans, tinned",
        amount: 400,
        unit: "g",
        prep: "drained",
        component: "protein",
        scales: "linear",
        optional: false,
        in_bank: true,
      },
    ],
    steps: [
      {
        n: 1,
        text: "Tip {ing_1} into the pan.",
        duration_seconds: null,
        temperature_c: null,
      },
    ],
    serving_suggestion: "Good with bread.",
    make_ahead: null,
    leftovers: null,
    ...overrides,
  };
}

function suggestion(overrides: Partial<Suggestion> = {}): Suggestion {
  return {
    id: "s1",
    meal_type: "dinner",
    title: "Charred greens with tahini",
    pitch: "Quick, sharp, and mostly from the cupboard.",
    cuisine: "Middle Eastern",
    components: {
      protein: "chickpeas",
      fat: "olive oil",
      carb: "flatbread",
      veg: ["tenderstem broccoli"],
    },
    flavour_layer: "tahini and lemon",
    total_minutes: 25,
    difficulty: "easy",
    ingredients_not_in_bank: [],
    uses_named_ingredients: [],
    ...overrides,
  };
}

describe("expandAllergenTerms", () => {
  // The whole point: "gluten" never appears in an ingredient list, "flour" does.
  it("expands an allergen to the words that actually appear in recipes", () => {
    const terms = expandAllergenTerms(["gluten"]);
    expect(terms).toContain("flour");
    expect(terms).toContain("breadcrumbs");
    expect(terms).toContain("spaghetti");
  });

  it("keeps the declared term itself", () => {
    expect(expandAllergenTerms(["peanuts"])).toContain("peanuts");
  });

  it("is case and punctuation insensitive", () => {
    expect(expandAllergenTerms(["  Peanuts! "])).toContain("peanut butter");
  });

  it("returns nothing for an empty declaration", () => {
    expect(expandAllergenTerms([])).toEqual([]);
    expect(expandAllergenTerms(["", "   "])).toEqual([]);
  });
});

describe("checkRecipeForAllergens", () => {
  it("passes a recipe with nothing declared", () => {
    expect(checkRecipeForAllergens(recipe(), [])).toEqual([]);
  });

  it("catches an allergen in the ingredient list", () => {
    const hits = checkRecipeForAllergens(
      recipe({
        ingredients: [
          {
            id: "ing_1",
            item: "peanut butter",
            amount: 30,
            unit: "g",
            prep: null,
            component: "fat",
            scales: "sublinear",
            optional: false,
            in_bank: true,
          },
        ],
      }),
      ["peanuts"],
    );

    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].location).toBe("ingredients[0].item");
  });

  // An allergen in a step but not the ingredient list is still on the plate.
  it("catches an allergen that only appears in the steps", () => {
    const hits = checkRecipeForAllergens(
      recipe({
        steps: [
          {
            n: 1,
            text: "Finish with a spoonful of crème fraîche.",
            duration_seconds: null,
            temperature_c: null,
          },
        ],
      }),
      ["dairy"],
    );

    expect(hits.map((h) => h.location)).toContain("steps[1].text");
  });

  it("catches an allergen that only appears in the serving suggestion", () => {
    const hits = checkRecipeForAllergens(
      recipe({ serving_suggestion: "Serve with warm flatbreads." }),
      ["gluten"],
    );

    expect(hits.map((h) => h.location)).toContain("serving_suggestion");
  });

  it("catches an allergen hidden in a preparation note", () => {
    const hits = checkRecipeForAllergens(
      recipe({
        ingredients: [
          {
            id: "ing_1",
            item: "chicken thighs",
            amount: 400,
            unit: "g",
            prep: "tossed in seasoned flour",
            component: "protein",
            scales: "linear",
            optional: false,
            in_bank: true,
          },
        ],
      }),
      ["gluten"],
    );

    expect(hits.map((h) => h.location)).toContain("ingredients[0].prep");
  });

  it("matches plurals of the declared term", () => {
    const hits = checkRecipeForAllergens(
      recipe({ serving_suggestion: "Scatter over toasted walnuts." }),
      ["walnut"],
    );

    expect(hits.length).toBeGreaterThan(0);
  });

  // Word boundaries: the reason "nut" does not fire on "butternut squash".
  it("does not fire on a substring inside an unrelated word", () => {
    const hits = checkRecipeForAllergens(
      recipe({
        ingredients: [
          {
            id: "ing_1",
            item: "butternut squash",
            amount: 500,
            unit: "g",
            prep: "cubed",
            component: "veg",
            scales: "linear",
            optional: false,
            in_bank: true,
          },
        ],
      }),
      ["nuts"],
    );

    expect(hits).toEqual([]);
  });

  it("does not fire 'egg' on 'aubergine'", () => {
    const hits = checkRecipeForAllergens(
      recipe({
        ingredients: [
          {
            id: "ing_1",
            item: "aubergine",
            amount: 1,
            unit: null,
            prep: "sliced",
            component: "veg",
            scales: "linear",
            optional: false,
            in_bank: true,
          },
        ],
      }),
      ["eggs"],
    );

    expect(hits).toEqual([]);
  });

  it("catches soy sauce for a soy allergy", () => {
    const hits = checkRecipeForAllergens(
      recipe({
        ingredients: [
          {
            id: "ing_1",
            item: "light soy sauce",
            amount: 15,
            unit: "ml",
            prep: null,
            component: "flavour_layer",
            scales: "sublinear",
            optional: false,
            in_bank: true,
          },
        ],
      }),
      ["soy"],
    );

    expect(hits.length).toBeGreaterThan(0);
  });

  it("catches fish sauce for a fish allergy", () => {
    const hits = checkRecipeForAllergens(
      recipe({ serving_suggestion: "Season with fish sauce to taste." }),
      ["fish"],
    );

    expect(hits.length).toBeGreaterThan(0);
  });
});

describe("checkSuggestionForAllergens", () => {
  // Catching it here saves generating a card that would be thrown away.
  it("catches an allergen in a suggestion's components", () => {
    const hits = checkSuggestionForAllergens(
      suggestion({
        components: {
          protein: "king prawns",
          fat: "olive oil",
          carb: "rice",
          veg: ["pak choi"],
        },
      }),
      ["shellfish"],
    );

    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].location).toBe("components.protein");
  });

  it("catches an allergen in the flavour layer", () => {
    const hits = checkSuggestionForAllergens(suggestion(), ["sesame"]);
    expect(hits.map((h) => h.location)).toContain("flavour_layer");
  });

  it("passes a clean suggestion", () => {
    expect(checkSuggestionForAllergens(suggestion(), ["peanuts"])).toEqual([]);
  });
});
