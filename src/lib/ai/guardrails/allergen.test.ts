import { describe, expect, it } from "vitest";
import {
  checkDishComponentsForAllergens,
  checkOptionForAllergens,
  checkRecipeForAllergens,
  checkRefinedOptionForAllergens,
  expandAllergenTerms,
} from "./allergen";
import type { Recipe } from "@/lib/schemas/recipe";
import type { Option } from "@/lib/schemas/option";
import type { DishComponentsResponse } from "@/lib/schemas/dish-components";
import type { RefinedOption } from "@/lib/schemas/dish-variations";

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

function option(overrides: Partial<Option> = {}): Option {
  return {
    id: "o1",
    direction: "Charred and citrus-bright",
    flavours: ["sharp", "smoky"],
    textures: ["charred", "crisp"],
    cuisine: "Middle Eastern",
    hero_ingredients: ["chickpeas", "tahini"],
    effort_minutes: 25,
    axes: {
      protein: "chickpeas",
      method: "griddle",
      cuisine: "Middle Eastern",
      richness: "light",
    },
    uses_named_ingredients: [],
    ...overrides,
  };
}

function dishComponents(
  overrides: Partial<DishComponentsResponse> = {},
): DishComponentsResponse {
  return {
    slots: [
      {
        slot: "vegetable",
        label: "Vegetables",
        options: [
          { name: "Tenderstem broccoli", note: "Holds up to a hot griddle." },
          { name: "Charred courgette", note: null },
        ],
      },
    ],
    ...overrides,
  };
}

function refinedOption(overrides: Partial<RefinedOption> = {}): RefinedOption {
  return {
    id: "r1",
    title: "Charred greens with tahini and pickled chilli",
    description: "Sharp, smoky, mostly from the cupboard.",
    hero_ingredients: ["chickpeas", "tenderstem broccoli", "tahini"],
    flavours: ["smoky", "sharp"],
    cuisine: "Middle Eastern",
    effort_minutes: 25,
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

describe("checkOptionForAllergens", () => {
  // Catching it here saves generating a card that would be thrown away.
  it("catches an allergen in the protein axis", () => {
    const hits = checkOptionForAllergens(
      option({
        axes: { protein: "king prawns", method: "stir fry", cuisine: "Cantonese", richness: "light" },
      }),
      ["shellfish"],
    );

    expect(hits.length).toBeGreaterThan(0);
  });

  it("catches an allergen in uses_named_ingredients", () => {
    const hits = checkOptionForAllergens(
      option({ uses_named_ingredients: ["peanut butter"] }),
      ["peanuts"],
    );

    expect(hits.map((h) => h.location)).toContain("uses_named_ingredients[0]");
  });

  it("catches an allergen in hero_ingredients", () => {
    const hits = checkOptionForAllergens(
      option({ hero_ingredients: ["king prawns", "rice"] }),
      ["shellfish"],
    );

    expect(hits.map((h) => h.location)).toContain("hero_ingredients[0]");
  });

  it("catches an allergen in flavours", () => {
    const hits = checkOptionForAllergens(option({ flavours: ["peanut", "sharp"] }), ["peanuts"]);

    expect(hits.map((h) => h.location)).toContain("flavours[0]");
  });

  it("passes a clean option", () => {
    expect(checkOptionForAllergens(option(), ["peanuts"])).toEqual([]);
  });
});

describe("checkDishComponentsForAllergens", () => {
  it("catches an allergen in a slot option's name", () => {
    const hits = checkDishComponentsForAllergens(
      dishComponents({
        slots: [
          {
            slot: "sauce",
            label: "Sauce",
            options: [{ name: "Peanut satay sauce", note: null }],
          },
        ],
      }),
      ["peanuts"],
    );

    expect(hits.map((h) => h.location)).toContain("slots[0].options[0].name");
  });

  it("catches an allergen hidden in a pairing note", () => {
    const hits = checkDishComponentsForAllergens(
      dishComponents({
        slots: [
          {
            slot: "sauce",
            label: "Sauce",
            options: [{ name: "Green sauce", note: "Finished with shaved parmesan." }],
          },
        ],
      }),
      ["dairy"],
    );

    expect(hits.map((h) => h.location)).toContain("slots[0].options[0].note");
  });

  it("passes clean components", () => {
    expect(checkDishComponentsForAllergens(dishComponents(), ["peanuts"])).toEqual([]);
  });
});

describe("checkRefinedOptionForAllergens", () => {
  it("catches an allergen in hero_ingredients", () => {
    const hits = checkRefinedOptionForAllergens(
      refinedOption({ hero_ingredients: ["king prawns", "rice"] }),
      ["shellfish"],
    );

    expect(hits.map((h) => h.location)).toContain("hero_ingredients[0]");
  });

  it("catches an allergen in flavours", () => {
    const hits = checkRefinedOptionForAllergens(
      refinedOption({ flavours: ["peanut", "sharp"] }),
      ["peanuts"],
    );

    expect(hits.map((h) => h.location)).toContain("flavours[0]");
  });

  it("passes a clean refined option", () => {
    expect(checkRefinedOptionForAllergens(refinedOption(), ["peanuts"])).toEqual([]);
  });
});
