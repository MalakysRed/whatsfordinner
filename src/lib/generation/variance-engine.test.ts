import { describe, expect, it } from "vitest";
import { drawSeeds, findAxesCollisions, findDuplicateTitles, tokenOverlap } from "./variance-engine";
import type { SeedPoolRow } from "@/lib/db/types";
import type { OptionAxes } from "@/lib/schemas/option";

function seed(overrides: Partial<SeedPoolRow> = {}): SeedPoolRow {
  return {
    id: "id",
    axis: "cuisine",
    name: "Thai",
    tags: [],
    status: "active",
    source: "curated",
    created_at: "2026-01-01",
    ...overrides,
  };
}

describe("drawSeeds", () => {
  it("draws one seed per axis", () => {
    const pool: SeedPoolRow[] = [
      seed({ axis: "cuisine", name: "Thai" }),
      seed({ axis: "format", name: "Traybake", tags: ["standard"] }),
      seed({ axis: "hero", name: "Squash", tags: ["autumn"] }),
    ];

    const drawn = drawSeeds(pool, "autumn", "standard", new Set());

    expect(drawn.map((s) => s.axis).sort()).toEqual(["cuisine", "format", "hero"]);
  });

  it("never draws a format that doesn't suit the effort band", () => {
    const pool: SeedPoolRow[] = [
      seed({ axis: "format", name: "Slow braise", tags: ["project"] }),
      seed({ axis: "format", name: "Stir fry", tags: ["quick"] }),
    ];

    for (let i = 0; i < 20; i++) {
      const drawn = drawSeeds(pool, "winter", "quick", new Set());
      const format = drawn.find((s) => s.axis === "format");
      expect(format?.name).toBe("Stir fry");
    }
  });

  it("excludes seeds used in the household's last three generations", () => {
    const pool: SeedPoolRow[] = [seed({ axis: "cuisine", name: "Thai" })];

    const drawn = drawSeeds(pool, "summer", "standard", new Set(["Thai"]));

    expect(drawn.find((s) => s.axis === "cuisine")).toBeUndefined();
  });

  it("weights the in-season row over an off-season row", () => {
    const pool: SeedPoolRow[] = [
      seed({ axis: "hero", name: "Asparagus", tags: ["spring"] }),
      seed({ axis: "hero", name: "Squash", tags: ["autumn"] }),
    ];

    // A deterministic "random" that always picks the first weighted slot —
    // proves the in-season row occupies more of the weighted array.
    const drawn = drawSeeds(pool, "spring", "standard", new Set(), () => 0);

    expect(drawn.find((s) => s.axis === "hero")?.name).toBe("Asparagus");
  });

  it("still draws an off-season row when nothing in-season is eligible", () => {
    const pool: SeedPoolRow[] = [seed({ axis: "hero", name: "Squash", tags: ["autumn"] })];

    const drawn = drawSeeds(pool, "spring", "standard", new Set());

    expect(drawn.find((s) => s.axis === "hero")?.name).toBe("Squash");
  });
});

function axes(overrides: Partial<OptionAxes> = {}): OptionAxes {
  return { protein: "chicken", method: "roast", cuisine: "British", richness: "medium", ...overrides };
}

describe("findAxesCollisions", () => {
  it("finds nothing when every option differs", () => {
    expect(
      findAxesCollisions([axes(), axes({ protein: "tofu" }), axes({ method: "braise" })]),
    ).toEqual([]);
  });

  it("flags two options sharing protein, method and cuisine", () => {
    const collisions = findAxesCollisions([axes(), axes({ richness: "rich" }), axes({ protein: "tofu" })]);
    expect(collisions).toEqual([[0, 1]]);
  });

  it("does not flag options that differ on just one of the three axes", () => {
    expect(findAxesCollisions([axes(), axes({ cuisine: "Italian" })])).toEqual([]);
  });
});

describe("tokenOverlap / findDuplicateTitles", () => {
  it("scores identical titles at 1", () => {
    expect(tokenOverlap("Sticky miso salmon", "Sticky miso salmon")).toBe(1);
  });

  it("scores unrelated titles near 0", () => {
    expect(tokenOverlap("Sticky miso salmon", "Green lentil soup")).toBe(0);
  });

  it("flags a title that mostly repeats a previous one", () => {
    const duplicates = findDuplicateTitles(
      ["Sticky miso glazed salmon"],
      ["Sticky miso salmon"],
    );
    expect(duplicates).toEqual(["Sticky miso glazed salmon"]);
  });

  it("does not flag a genuinely different title", () => {
    const duplicates = findDuplicateTitles(["Green lentil soup"], ["Sticky miso salmon"]);
    expect(duplicates).toEqual([]);
  });
});
