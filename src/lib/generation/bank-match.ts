import type { IngredientRow } from "@/lib/db/types";

/**
 * Whether a named ingredient is something the household already has.
 *
 * The model is no longer told the household's ingredient bank (see
 * prompts/system.ts) — it only sees loved/disliked/allergen preferences, so
 * it cannot reliably say what needs buying. This is the same move as the
 * allergen guardrail: a fact the model can get wrong is checked in code
 * against the real data instead of trusted from the response. Matching is
 * loose (substring either direction, not exact), the same tolerance the
 * builder's own "needs using up" chip-matching already uses — ingredient
 * names are typed by a person, not IDs.
 */
export function isInBank(name: string, bank: IngredientRow[]): boolean {
  const needle = name.trim().toLowerCase();
  if (!needle) return false;

  return bank.some((ingredient) => {
    const hay = ingredient.name.trim().toLowerCase();
    return hay === needle || hay.includes(needle) || needle.includes(hay);
  });
}

/** Of the given names, the ones that don't match anything in the bank. */
export function namesNotInBank(names: string[], bank: IngredientRow[]): string[] {
  return names.filter((name) => !isInBank(name, bank));
}
