import type { Recipe } from "@/lib/schemas/recipe";
import type { Suggestion } from "@/lib/schemas/suggestion";

/**
 * Allergen enforcement in code, after generation (PRD 9.5).
 *
 * The prompt already carries the allergen list, and the model is generally good
 * about it. That is not the point. A language model is not an acceptable single
 * line of defence on an allergy, so every generated card is checked here as
 * well, and a card that trips the check is discarded rather than shown.
 *
 * The bias is deliberately toward false positives: wrongly rejecting a safe
 * dinner costs one regeneration, wrongly serving one costs a great deal more.
 */

/**
 * The 14 allergens UK law requires to be declared, mapped to the words that
 * actually turn up in an ingredient list.
 *
 * This exists because "gluten" never appears in a recipe — "plain flour" does.
 * Matching only the allergen's own name would miss every real case. It is a
 * floor, not a substitute for flagging the specific things a household reacts
 * to in the ingredient bank, and it is worth extending as gaps show up.
 */
const ALLERGEN_EXPANSIONS: Record<string, string[]> = {
  gluten: [
    "wheat", "flour", "plain flour", "self raising flour", "strong flour",
    "barley", "rye", "spelt", "semolina", "couscous", "bulgur", "bulgur wheat",
    "breadcrumbs", "panko", "panko breadcrumbs", "bread", "pasta", "spaghetti",
    "penne", "rigatoni", "noodles", "egg noodles", "udon", "udon noodles",
    "pearl barley", "seitan", "pitta", "pitta bread", "tortilla", "naan",
    "sourdough", "soy sauce", "dark soy sauce", "light soy sauce", "orzo",
    // Compound words need naming individually: matching is whole-word, so
    // "bread" does not catch "flatbread" the way it catches "bread". That
    // strictness is what stops "nut" firing on "butternut squash", so the fix
    // is to be explicit here rather than to loosen the boundary rule.
    "flatbread", "flatbreads", "shortbread", "cornbread", "chapati", "roti",
    "brioche", "focaccia", "ciabatta", "baguette", "croutons", "filo", "puff pastry",
    "pastry", "dumpling", "dumplings", "wonton", "wontons", "gnocchi", "lasagne",
  ],
  wheat: [
    "flour", "plain flour", "self raising flour", "breadcrumbs", "panko",
    "pasta", "spaghetti", "penne", "rigatoni", "couscous", "semolina", "bread",
  ],
  crustaceans: ["prawn", "prawns", "king prawns", "crab", "lobster", "langoustine", "crayfish"],
  eggs: ["egg", "eggs", "mayonnaise", "meringue", "egg noodles", "aioli"],
  fish: [
    "cod", "salmon", "tuna", "haddock", "sea bass", "mackerel", "anchovy",
    "anchovies", "sardine", "sardines", "fish sauce", "worcestershire sauce",
    "nam pla",
  ],
  peanuts: ["peanut", "peanuts", "peanut butter", "groundnut", "satay"],
  soybeans: [
    "soy", "soya", "soy sauce", "dark soy sauce", "light soy sauce", "tofu",
    "edamame", "miso", "white miso paste", "miso paste", "tempeh", "tamari",
  ],
  soy: ["soya", "soy sauce", "tofu", "edamame", "miso", "tempeh", "tamari"],
  milk: [
    "butter", "salted butter", "unsalted butter", "cream", "double cream",
    "single cream", "soured cream", "creme fraiche", "crème fraîche", "cheese",
    "cheddar", "parmesan", "mozzarella", "feta", "halloumi", "ricotta",
    "mascarpone", "yoghurt", "yogurt", "greek yoghurt", "ghee", "milk",
  ],
  dairy: [
    "butter", "cream", "cheese", "cheddar", "parmesan", "mozzarella", "feta",
    "halloumi", "yoghurt", "yogurt", "milk", "creme fraiche", "crème fraîche",
    "ghee", "mascarpone", "ricotta", "soured cream",
  ],
  nuts: [
    "almond", "almonds", "hazelnut", "hazelnuts", "walnut", "walnuts",
    "cashew", "cashews", "pecan", "pecans", "pistachio", "pistachios",
    "macadamia", "brazil nut", "brazil nuts", "pine nut", "pine nuts",
  ],
  "tree nuts": [
    "almond", "almonds", "hazelnut", "hazelnuts", "walnut", "walnuts",
    "cashew", "cashews", "pecan", "pecans", "pistachio", "pistachios",
    "macadamia", "brazil nut", "brazil nuts",
  ],
  celery: ["celery", "celeriac", "celery salt"],
  mustard: ["mustard", "dijon", "dijon mustard", "wholegrain mustard", "mustard seeds"],
  sesame: ["sesame", "sesame seeds", "sesame oil", "tahini", "za'atar", "zaatar"],
  "sulphur dioxide": ["sulphite", "sulphites", "sulfite", "sulfites"],
  sulphites: ["sulphite", "sulfite", "sulfites"],
  lupin: ["lupin", "lupin flour"],
  molluscs: ["mussel", "mussels", "clam", "clams", "oyster", "oysters", "squid", "octopus", "scallop", "scallops"],
  shellfish: [
    "prawn", "prawns", "king prawns", "crab", "lobster", "mussel", "mussels",
    "clam", "clams", "oyster", "oysters", "squid", "scallop", "scallops",
    "oyster sauce",
  ],
};

function normalise(value: string): string {
  return value
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/[^a-z0-9'\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Whole-word match with a tolerated trailing "s".
 *
 * Word boundaries matter: "nut" must catch "nut" and "nuts" without catching
 * "butternut squash", and "egg" must not fire on "aubergine".
 */
function containsTerm(haystack: string, term: string): boolean {
  const normalisedTerm = normalise(term);
  if (!normalisedTerm) return false;

  const pattern = new RegExp(`\\b${escapeRegex(normalisedTerm)}(?:e?s)?\\b`, "i");
  return pattern.test(haystack);
}

/** Every term to search for, given what the household declared. */
export function expandAllergenTerms(declared: string[]): string[] {
  const terms = new Set<string>();

  for (const raw of declared) {
    const term = normalise(raw);
    if (!term) continue;

    terms.add(term);
    for (const expansion of ALLERGEN_EXPANSIONS[term] ?? []) {
      terms.add(normalise(expansion));
    }
  }

  return Array.from(terms);
}

export interface AllergenHit {
  /** The allergen term that matched. */
  term: string;
  /** Where it was found, for the log and for the correction prompt. */
  location: string;
  /** The offending text. */
  text: string;
}

function scan(
  fields: { location: string; text: string | null | undefined }[],
  terms: string[],
): AllergenHit[] {
  const hits: AllergenHit[] = [];

  for (const { location, text } of fields) {
    if (!text) continue;
    const haystack = normalise(text);

    for (const term of terms) {
      if (containsTerm(haystack, term)) {
        hits.push({ term, location, text });
      }
    }
  }

  return hits;
}

/**
 * Checks a generated recipe against the household's allergens.
 *
 * Scans the ingredient list, the preparation notes and the step text — an
 * allergen that only appears in "serve with warm flatbreads" is still on the
 * plate.
 */
export function checkRecipeForAllergens(
  recipe: Recipe,
  declaredAllergens: string[],
): AllergenHit[] {
  const terms = expandAllergenTerms(declaredAllergens);
  if (terms.length === 0) return [];

  return scan(
    [
      { location: "title", text: recipe.title },
      { location: "description", text: recipe.description },
      ...recipe.ingredients.flatMap((ingredient, i) => [
        { location: `ingredients[${i}].item`, text: ingredient.item },
        { location: `ingredients[${i}].prep`, text: ingredient.prep },
      ]),
      ...recipe.steps.map((step) => ({
        location: `steps[${step.n}].text`,
        text: step.text,
      })),
      { location: "serving_suggestion", text: recipe.serving_suggestion },
    ],
    terms,
  );
}

/** The same check applied to a suggestion, before a card is ever generated. */
export function checkSuggestionForAllergens(
  suggestion: Suggestion,
  declaredAllergens: string[],
): AllergenHit[] {
  const terms = expandAllergenTerms(declaredAllergens);
  if (terms.length === 0) return [];

  const { components } = suggestion;

  return scan(
    [
      { location: "title", text: suggestion.title },
      { location: "pitch", text: suggestion.pitch },
      { location: "components.protein", text: components.protein },
      { location: "components.fat", text: components.fat },
      { location: "components.carb", text: components.carb },
      ...components.veg.map((veg, i) => ({
        location: `components.veg[${i}]`,
        text: veg,
      })),
      { location: "flavour_layer", text: suggestion.flavour_layer },
      ...suggestion.ingredients_not_in_bank.map((item, i) => ({
        location: `ingredients_not_in_bank[${i}]`,
        text: item,
      })),
    ],
    terms,
  );
}

/** A short line for the correction prompt on the retry. */
export function describeHits(hits: AllergenHit[]): string {
  const terms = Array.from(new Set(hits.map((h) => h.term)));
  return terms.join(", ");
}
