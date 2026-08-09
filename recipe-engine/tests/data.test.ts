import { describe, expect, it } from "vitest";

import {
  archetypeSchema,
  archetypeStepSchema,
  slotOptionSchema,
  slotSchema,
  techniqueSchema,
  type Archetype,
  type ArchetypeInput,
  type ArchetypeStep,
  type ArchetypeStepInput,
  type Slot,
  type SlotInput,
  type SlotOption,
  type SlotOptionInput,
  type Technique,
  type TechniqueInput,
} from "../schemas";

import {
  formatIssues,
  validate,
  type Dataset,
  type ValidationIssue,
} from "../lib/validate";

import {
  archetypeSteps,
  archetypes,
  dataset,
  slotOptions,
  slots,
  techniques,
} from "../data";

/**
 * Data validity is a test failure, not a warning (root `recipe-engine/CLAUDE.md`).
 *
 * Two halves. The first parses and validates whatever is actually authored in
 * `/data` — currently empty, so it passes trivially and starts biting the
 * moment a record lands. The second exercises the schemas and `validate()`
 * against fixtures, so the checks are known to work *before* there is real data
 * relying on them.
 *
 * Fixture values are deliberately not culinary. States are `state_a`, vessels
 * are `fixture_vessel`. Nothing here should ever be mistaken for an authored
 * record, or harvested into one.
 */

/* -------------------------------------------------------------------------- */
/* Fixtures                                                                    */
/* -------------------------------------------------------------------------- */

function technique(overrides: Partial<TechniqueInput> = {}): Technique {
  return techniqueSchema.parse({
    id: "TECH_FIXTURE_A",
    slug: "fixture_a",
    display_name: "Fixture A",
    category: "prep",
    definition_short: "Structural fixture.",
    definition_full: "Structural fixture used to exercise validation.",
    accepts: { states: [] },
    produces: { state: "state_a" },
    heat: "medium",
    vessel_types: ["fixture_vessel"],
    duration_model: { base_seconds: 60 },
    attention: "periodic",
    difficulty: 1,
    failure_sensitivity: 1,
    ...overrides,
  } satisfies TechniqueInput);
}

function archetype(overrides: Partial<ArchetypeInput> = {}): Archetype {
  return archetypeSchema.parse({
    id: "ARCH_FIXTURE",
    slug: "fixture",
    display_name: "Fixture archetype",
    dish_class: "soup",
    cuisine_ids: ["fixture_cuisine"],
    adaptation_type: "traditional",
    description: "Structural fixture.",
    base_flavour_axes: {
      heat: 0,
      acid: 0,
      sweet: 0,
      umami: 0,
      richness: 0,
      aromatic: 0,
    },
    entry_affinities: {},
    ...overrides,
  } satisfies ArchetypeInput);
}

function step(overrides: Partial<ArchetypeStepInput> = {}): ArchetypeStep {
  return archetypeStepSchema.parse({
    id: "STEP_FIXTURE_1",
    archetype_id: "ARCH_FIXTURE",
    position: 1,
    technique_id: "TECH_FIXTURE_A",
    purpose: "Structural fixture.",
    sensory_target: "Structural fixture.",
    ...overrides,
  } satisfies ArchetypeStepInput);
}

function slot(overrides: Partial<SlotInput> = {}): Slot {
  return slotSchema.parse({
    id: "SLOT_FIXTURE_MAIN",
    archetype_id: "ARCH_FIXTURE",
    slug: "fixture_main",
    display_name: "Fixture slot",
    ui_prompt: "Fixture?",
    ui_order: 0,
    role: "main",
    cardinality: "exactly_one",
    accepts_filter: {},
    quantity_rule_id: "RULE_FIXTURE",
    ...overrides,
  } satisfies SlotInput);
}

function slotOption(overrides: Partial<SlotOptionInput> = {}): SlotOption {
  return slotOptionSchema.parse({
    id: "OPT_FIXTURE_A",
    slot_id: "SLOT_FIXTURE_MAIN",
    canonical_ingredient_id: "ING_00001",
    suitability: 0.5,
    typicality: "common",
    impact_note: "Structural fixture.",
    effect_on: {},
    ...overrides,
  } satisfies SlotOptionInput);
}

/** An empty corpus, to be filled in per test. */
function emptyDataset(overrides: Partial<Dataset> = {}): Dataset {
  return {
    techniques: [],
    archetypes: [],
    steps: [],
    slots: [],
    slotOptions: [],
    ...overrides,
  };
}

function codes(issues: ValidationIssue[]): string[] {
  return issues.map((issue) => issue.code);
}

/* -------------------------------------------------------------------------- */
/* The authored corpus                                                         */
/* -------------------------------------------------------------------------- */

describe("authored data", () => {
  it("every technique parses", () => {
    for (const record of techniques) {
      expect(() => techniqueSchema.parse(record), record.id).not.toThrow();
    }
  });

  it("every archetype parses", () => {
    for (const record of archetypes) {
      expect(() => archetypeSchema.parse(record), record.id).not.toThrow();
    }
  });

  it("every archetype step parses", () => {
    for (const record of archetypeSteps) {
      expect(() => archetypeStepSchema.parse(record), record.id).not.toThrow();
    }
  });

  it("every slot parses", () => {
    for (const record of slots) {
      expect(() => slotSchema.parse(record), record.id).not.toThrow();
    }
  });

  it("every slot option parses", () => {
    for (const record of slotOptions) {
      expect(() => slotOptionSchema.parse(record), record.id).not.toThrow();
    }
  });

  it("passes referential and sequencing validation", () => {
    const issues = validate(dataset);
    expect(formatIssues(issues)).toBe("no issues");
  });
});

/* -------------------------------------------------------------------------- */
/* Schemas                                                                     */
/* -------------------------------------------------------------------------- */

describe("schemas", () => {
  it("rejects an ID without its type prefix", () => {
    expect(techniqueSchema.safeParse({ ...technique(), id: "SWEAT" }).success).toBe(
      false,
    );
    expect(
      techniqueSchema.safeParse({ ...technique(), id: "ARCH_SWEAT" }).success,
    ).toBe(false);
  });

  it("caps definition_short at 140 characters", () => {
    const ok = techniqueSchema.safeParse({
      ...technique(),
      definition_short: "x".repeat(140),
    });
    const tooLong = techniqueSchema.safeParse({
      ...technique(),
      definition_short: "x".repeat(141),
    });
    expect(ok.success).toBe(true);
    expect(tooLong.success).toBe(false);
  });

  it("holds difficulty and failure_sensitivity to 1-5", () => {
    expect(
      techniqueSchema.safeParse({ ...technique(), difficulty: 0 }).success,
    ).toBe(false);
    expect(
      techniqueSchema.safeParse({ ...technique(), failure_sensitivity: 6 }).success,
    ).toBe(false);
  });

  it("rejects a duration model whose min exceeds its max", () => {
    const result = techniqueSchema.safeParse({
      ...technique(),
      duration_model: { base_seconds: 60, min_seconds: 600, max_seconds: 300 },
    });
    expect(result.success).toBe(false);
  });

  it("requires exactly one of technique_id or pattern_id on a step", () => {
    const neither = archetypeStepSchema.safeParse({
      id: "STEP_X",
      archetype_id: "ARCH_FIXTURE",
      position: 1,
      purpose: "x",
      sensory_target: "x",
    });
    const both = archetypeStepSchema.safeParse({
      id: "STEP_X",
      archetype_id: "ARCH_FIXTURE",
      position: 1,
      technique_id: "TECH_FIXTURE_A",
      pattern_id: "PAT_FIXTURE",
      purpose: "x",
      sensory_target: "x",
    });
    expect(neither.success).toBe(false);
    expect(both.success).toBe(false);
    expect(archetypeStepSchema.safeParse(step()).success).toBe(true);
  });

  it("constrains suitability to 0-1", () => {
    expect(slotOptionSchema.safeParse({ ...slotOption(), suitability: 1.5 }).success).toBe(
      false,
    );
    expect(slotOptionSchema.safeParse({ ...slotOption(), suitability: 1 }).success).toBe(
      true,
    );
  });

  it("defaults an archetype to draft and unverified", () => {
    const parsed = archetype();
    expect(parsed.status).toBe("draft");
    expect(parsed.verification_status).toBe("unverified");
  });

  it("keeps flavour axes within 0-10", () => {
    const result = archetypeSchema.safeParse({
      ...archetype(),
      base_flavour_axes: {
        heat: 11,
        acid: 0,
        sweet: 0,
        umami: 0,
        richness: 0,
        aromatic: 0,
      },
    });
    expect(result.success).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */
/* validate() — referential                                                    */
/* -------------------------------------------------------------------------- */

describe("validate: referential integrity", () => {
  it("accepts a coherent minimal corpus", () => {
    const issues = validate(
      emptyDataset({
        techniques: [technique()],
        archetypes: [archetype()],
        steps: [step({ consumes_slots: ["fixture_main"] })],
        slots: [slot()],
        slotOptions: [slotOption()],
      }),
    );
    expect(formatIssues(issues)).toBe("no issues");
  });

  it("catches a step pointing at a technique that does not exist", () => {
    const issues = validate(
      emptyDataset({
        archetypes: [archetype()],
        steps: [step({ technique_id: "TECH_MISSING" })],
      }),
    );
    expect(codes(issues)).toContain("unresolved_reference");
    expect(formatIssues(issues)).toContain("TECH_MISSING");
  });

  it("catches a step on an archetype that does not exist", () => {
    const issues = validate(
      emptyDataset({
        techniques: [technique()],
        steps: [step({ archetype_id: "ARCH_MISSING" })],
      }),
    );
    expect(formatIssues(issues)).toContain("ARCH_MISSING");
  });

  it("catches consumes_slots naming a slug no slot on that archetype declares", () => {
    const issues = validate(
      emptyDataset({
        techniques: [technique()],
        archetypes: [archetype()],
        steps: [step({ consumes_slots: ["not_a_slot"] })],
        slots: [slot()],
      }),
    );
    expect(codes(issues)).toContain("unresolved_reference");
    expect(formatIssues(issues)).toContain("not_a_slot");
  });

  it("catches a step condition naming an unknown slot", () => {
    const issues = validate(
      emptyDataset({
        techniques: [technique()],
        archetypes: [archetype()],
        steps: [step({ condition: { slot: "ghost_slot", filled: true } })],
        slots: [slot()],
      }),
    );
    expect(formatIssues(issues)).toContain("ghost_slot");
  });

  it("catches a default_option_id that belongs to a different slot", () => {
    const other = slotOption({ id: "OPT_FIXTURE_B", slot_id: "SLOT_FIXTURE_OTHER" });
    const issues = validate(
      emptyDataset({
        archetypes: [archetype()],
        slots: [
          slot({ default_option_id: "OPT_FIXTURE_B" }),
          slot({ id: "SLOT_FIXTURE_OTHER", slug: "fixture_other" }),
        ],
        slotOptions: [other],
      }),
    );
    expect(codes(issues)).toContain("reference_wrong_owner");
  });

  it("catches conflicts_with pointing at an unknown option", () => {
    const issues = validate(
      emptyDataset({
        archetypes: [archetype()],
        slots: [slot()],
        slotOptions: [slotOption({ conflicts_with: ["OPT_GHOST"] })],
      }),
    );
    expect(formatIssues(issues)).toContain("OPT_GHOST");
  });

  it("catches can_run_parallel_with crossing archetypes", () => {
    const issues = validate(
      emptyDataset({
        techniques: [technique()],
        archetypes: [archetype(), archetype({ id: "ARCH_OTHER", slug: "other" })],
        steps: [
          step({ can_run_parallel_with: ["STEP_OTHER"] }),
          step({ id: "STEP_OTHER", archetype_id: "ARCH_OTHER" }),
        ],
      }),
    );
    expect(codes(issues)).toContain("reference_wrong_owner");
  });

  it("reports duplicate IDs", () => {
    const issues = validate(
      emptyDataset({ techniques: [technique(), technique()] }),
    );
    expect(codes(issues)).toContain("duplicate_id");
  });

  it("skips ingredient and rule checks until a registry is supplied", () => {
    const corpus = emptyDataset({
      archetypes: [archetype()],
      slots: [slot()],
      slotOptions: [slotOption()],
    });

    expect(validate(corpus)).toEqual([]);

    const withRegistries = validate({
      ...corpus,
      ingredientIds: ["ING_99999"],
      quantityRuleIds: ["RULE_OTHER"],
    });
    expect(codes(withRegistries)).toEqual([
      "unresolved_reference",
      "unresolved_reference",
    ]);
  });
});

/* -------------------------------------------------------------------------- */
/* validate() — sequencing                                                     */
/* -------------------------------------------------------------------------- */

describe("validate: produces satisfies accepts", () => {
  const producer = technique({
    id: "TECH_PRODUCER",
    slug: "producer",
    produces: { state: "state_softened" },
    accepts: { states: [] },
  });

  it("passes when the next step accepts the produced state", () => {
    const consumer = technique({
      id: "TECH_CONSUMER",
      slug: "consumer",
      accepts: { states: ["state_softened"] },
    });

    const issues = validate(
      emptyDataset({
        techniques: [producer, consumer],
        archetypes: [archetype()],
        steps: [
          step({ id: "STEP_1", position: 1, technique_id: "TECH_PRODUCER" }),
          step({ id: "STEP_2", position: 2, technique_id: "TECH_CONSUMER" }),
        ],
      }),
    );
    expect(formatIssues(issues)).toBe("no issues");
  });

  it("fails when the next step does not accept the produced state", () => {
    const consumer = technique({
      id: "TECH_CONSUMER",
      slug: "consumer",
      accepts: { states: ["state_raw"] },
    });

    const issues = validate(
      emptyDataset({
        techniques: [producer, consumer],
        archetypes: [archetype()],
        steps: [
          step({ id: "STEP_1", position: 1, technique_id: "TECH_PRODUCER" }),
          step({ id: "STEP_2", position: 2, technique_id: "TECH_CONSUMER" }),
        ],
      }),
    );

    expect(codes(issues)).toEqual(["sequencing_mismatch"]);
    expect(formatIssues(issues)).toContain("state_softened");
    expect(formatIssues(issues)).toContain("state_raw");
  });

  it("treats an empty accepts.states as unconstrained", () => {
    const consumer = technique({
      id: "TECH_CONSUMER",
      slug: "consumer",
      accepts: { states: [] },
    });

    const issues = validate(
      emptyDataset({
        techniques: [producer, consumer],
        archetypes: [archetype()],
        steps: [
          step({ id: "STEP_1", position: 1, technique_id: "TECH_PRODUCER" }),
          step({ id: "STEP_2", position: 2, technique_id: "TECH_CONSUMER" }),
        ],
      }),
    );
    expect(issues).toEqual([]);
  });

  it("checks past an optional step, which generation may skip", () => {
    // STEP_2 is optional, so STEP_1's output can reach STEP_3 directly. STEP_2
    // accepts the produced state but STEP_3 does not — only a check that looks
    // past the optional step catches this.
    const optional = technique({
      id: "TECH_OPTIONAL",
      slug: "optional",
      accepts: { states: ["state_softened"] },
      produces: { state: "state_softened" },
    });
    const consumer = technique({
      id: "TECH_CONSUMER",
      slug: "consumer",
      accepts: { states: ["state_raw"] },
    });

    const issues = validate(
      emptyDataset({
        techniques: [producer, optional, consumer],
        archetypes: [archetype()],
        steps: [
          step({ id: "STEP_1", position: 1, technique_id: "TECH_PRODUCER" }),
          step({
            id: "STEP_2",
            position: 2,
            technique_id: "TECH_OPTIONAL",
            is_optional: true,
          }),
          step({ id: "STEP_3", position: 3, technique_id: "TECH_CONSUMER" }),
        ],
      }),
    );

    expect(codes(issues)).toContain("sequencing_mismatch");
    expect(formatIssues(issues)).toContain("STEP_3");
  });

  it("orders by position, not by declaration order", () => {
    const consumer = technique({
      id: "TECH_CONSUMER",
      slug: "consumer",
      accepts: { states: ["state_softened"] },
      produces: { state: "state_done" },
    });

    const issues = validate(
      emptyDataset({
        techniques: [producer, consumer],
        archetypes: [archetype()],
        // Declared out of order: the consumer is listed first.
        steps: [
          step({ id: "STEP_2", position: 2, technique_id: "TECH_CONSUMER" }),
          step({ id: "STEP_1", position: 1, technique_id: "TECH_PRODUCER" }),
        ],
      }),
    );
    expect(issues).toEqual([]);
  });

  it("reports two steps sharing a position", () => {
    const issues = validate(
      emptyDataset({
        techniques: [technique()],
        archetypes: [archetype()],
        steps: [
          step({ id: "STEP_1", position: 1 }),
          step({ id: "STEP_2", position: 1 }),
        ],
      }),
    );
    expect(codes(issues)).toContain("duplicate_position");
  });

  it("does not report sequencing for a step whose technique is missing", () => {
    const issues = validate(
      emptyDataset({
        archetypes: [archetype()],
        steps: [
          step({ id: "STEP_1", position: 1, technique_id: "TECH_GHOST" }),
          step({ id: "STEP_2", position: 2, technique_id: "TECH_GHOST" }),
        ],
      }),
    );
    expect(codes(issues)).not.toContain("sequencing_mismatch");
  });
});
