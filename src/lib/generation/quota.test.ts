import { describe, expect, it } from "vitest";
import { maxRepeatSlots, planSuggestionSlots, recencyCutoff } from "./quota";
import type { Variety } from "@/lib/schemas/settings";

const baseVariety: Variety = {
  only_new: false,
  recency_weighting: "sometimes",
  recency_window_days: 14,
  include_favourites: true,
};

describe("maxRepeatSlots", () => {
  // The table straight out of FR2.8.
  it("never allows no repeats", () => {
    expect(maxRepeatSlots("never")).toBe(0);
    expect(maxRepeatSlots("never", { constraintsAreNarrow: true })).toBe(0);
  });

  it("a bit allows one repeat only when the constraints are too narrow", () => {
    expect(maxRepeatSlots("a_bit")).toBe(0);
    expect(maxRepeatSlots("a_bit", { constraintsAreNarrow: true })).toBe(1);
  });

  it("sometimes allows one repeat regardless of the constraints", () => {
    expect(maxRepeatSlots("sometimes")).toBe(1);
    expect(maxRepeatSlots("sometimes", { constraintsAreNarrow: true })).toBe(1);
  });

  it("mostly allows two", () => {
    expect(maxRepeatSlots("mostly")).toBe(2);
  });

  it("always ignores recency entirely", () => {
    expect(maxRepeatSlots("always")).toBe(3);
  });
});

describe("planSuggestionSlots", () => {
  it("generates all three when only_new is on, whatever else is set", () => {
    const plan = planSuggestionSlots({
      variety: { ...baseVariety, only_new: true, recency_weighting: "always" },
      eligibleRepeatCount: 20,
    });

    expect(plan).toEqual({ repeatSlots: 0, newIdeaSlots: 3 });
  });

  it("fills repeat slots from the book rather than generating them", () => {
    const plan = planSuggestionSlots({
      variety: { ...baseVariety, recency_weighting: "mostly" },
      eligibleRepeatCount: 5,
    });

    expect(plan).toEqual({ repeatSlots: 2, newIdeaSlots: 1 });
  });

  // A new household has an empty book. The quota must not promise slots that
  // cannot be filled, or the user gets two blank cards.
  it("never plans more repeats than there are recipes to fill them", () => {
    const plan = planSuggestionSlots({
      variety: { ...baseVariety, recency_weighting: "mostly" },
      eligibleRepeatCount: 1,
    });

    expect(plan).toEqual({ repeatSlots: 1, newIdeaSlots: 2 });

    const emptyBook = planSuggestionSlots({
      variety: { ...baseVariety, recency_weighting: "always" },
      eligibleRepeatCount: 0,
    });

    expect(emptyBook).toEqual({ repeatSlots: 0, newIdeaSlots: 3 });
  });

  it("can fill every slot from the book when recency is ignored", () => {
    const plan = planSuggestionSlots({
      variety: { ...baseVariety, recency_weighting: "always" },
      eligibleRepeatCount: 10,
    });

    expect(plan).toEqual({ repeatSlots: 3, newIdeaSlots: 0 });
  });

  it("treats a bit as never until the constraints close in", () => {
    const roomy = planSuggestionSlots({
      variety: { ...baseVariety, recency_weighting: "a_bit" },
      eligibleRepeatCount: 5,
    });
    expect(roomy).toEqual({ repeatSlots: 0, newIdeaSlots: 3 });

    const narrow = planSuggestionSlots({
      variety: { ...baseVariety, recency_weighting: "a_bit" },
      eligibleRepeatCount: 5,
      constraintsAreNarrow: true,
    });
    expect(narrow).toEqual({ repeatSlots: 1, newIdeaSlots: 2 });
  });

  it("always returns three slots in total", () => {
    const weightings = ["never", "a_bit", "sometimes", "mostly", "always"] as const;

    for (const recency_weighting of weightings) {
      for (const eligibleRepeatCount of [0, 1, 2, 3, 9]) {
        for (const constraintsAreNarrow of [false, true]) {
          const plan = planSuggestionSlots({
            variety: { ...baseVariety, recency_weighting },
            eligibleRepeatCount,
            constraintsAreNarrow,
          });

          expect(plan.repeatSlots + plan.newIdeaSlots).toBe(3);
          expect(plan.repeatSlots).toBeGreaterThanOrEqual(0);
          expect(plan.newIdeaSlots).toBeGreaterThanOrEqual(0);
        }
      }
    }
  });
});

describe("recencyCutoff", () => {
  it("puts the cutoff windowDays before now", () => {
    const now = new Date("2026-08-01T19:00:00Z");
    expect(recencyCutoff(14, now).toISOString()).toBe("2026-07-18T19:00:00.000Z");
  });

  it("handles the one day minimum and the ninety day maximum", () => {
    const now = new Date("2026-08-01T19:00:00Z");
    expect(recencyCutoff(1, now).toISOString()).toBe("2026-07-31T19:00:00.000Z");
    expect(recencyCutoff(90, now).toISOString()).toBe("2026-05-03T19:00:00.000Z");
  });
});
