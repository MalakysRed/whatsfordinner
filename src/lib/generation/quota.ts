import type { RecencyWeighting } from "@/lib/db/types";
import type { Variety } from "@/lib/schemas/settings";

/**
 * Recency weighting as a slot quota (FR2.8).
 *
 * The PRD is emphatic about this and it is worth restating: Claude will not
 * reliably distinguish "a bit" from "sometimes" if you put those words in a
 * prompt. So the decision is made here, in application code, before the
 * generation call — how many of the three suggestion slots may hold a meal
 * cooked inside the recency window. The model is then simply asked for N new
 * ideas and told what to avoid.
 */

export const SUGGESTION_SLOTS = 3;

/**
 * How many of the three slots may be a repeat.
 *
 * "a bit" is the odd one out: at most one, and only when the constraint set is
 * too narrow to produce three plausible new ideas. Everywhere else the number is
 * fixed regardless of how much room the constraints leave.
 */
export function maxRepeatSlots(
  weighting: RecencyWeighting,
  { constraintsAreNarrow = false }: { constraintsAreNarrow?: boolean } = {},
): number {
  switch (weighting) {
    case "never":
      return 0;
    case "a_bit":
      return constraintsAreNarrow ? 1 : 0;
    case "sometimes":
      return 1;
    case "mostly":
      return 2;
    case "always":
      // Recency is ignored entirely — no constraint at all.
      return SUGGESTION_SLOTS;
  }
}

export interface SlotPlanInput {
  variety: Variety;
  /**
   * Recipes from the book that are eligible to fill a repeat slot, already
   * filtered by the caller for meal type and for the include_favourites setting.
   */
  eligibleRepeatCount: number;
  /** True when the builder constraints leave little room for new ideas. */
  constraintsAreNarrow?: boolean;
}

export interface SlotPlan {
  /** Slots to fill from the recipe book, with no API call (FR2.9). */
  repeatSlots: number;
  /** Slots to ask Claude for. Goes into the prompt as the number to generate. */
  newIdeaSlots: number;
}

/**
 * Splits the three suggestion slots between stored recipes and fresh generation.
 *
 * Repeat slots are filled with the saved card itself, badged "from your book" —
 * no API call, no drift from the version you liked, and it opens instantly
 * (FR2.9). Only the remainder is generated.
 */
export function planSuggestionSlots({
  variety,
  eligibleRepeatCount,
  constraintsAreNarrow = false,
}: SlotPlanInput): SlotPlan {
  // "Only new" excludes everything already in the book — cooked, favourited or
  // merely saved — so nothing can fill a repeat slot by definition.
  if (variety.only_new) {
    return { repeatSlots: 0, newIdeaSlots: SUGGESTION_SLOTS };
  }

  const allowed = maxRepeatSlots(variety.recency_weighting, { constraintsAreNarrow });
  const repeatSlots = Math.min(allowed, Math.max(0, eligibleRepeatCount), SUGGESTION_SLOTS);

  return {
    repeatSlots,
    newIdeaSlots: SUGGESTION_SLOTS - repeatSlots,
  };
}

/**
 * The cutoff for "recently cooked". Meals cooked before this are fully eligible
 * again regardless of the weighting.
 */
export function recencyCutoff(windowDays: number, now: Date = new Date()): Date {
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - windowDays);
  return cutoff;
}
