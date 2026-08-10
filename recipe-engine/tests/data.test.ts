import { describe, expect, it } from "vitest";

import {
  acceptsFilterSchema,
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
 * are `fixture_vessel`, tags are `tag_a`. Nothing here should ever be mistaken
 * for an authored record, or harvested into one.
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
    dish_class: "stew",
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
    id: "STEP_FIX_ALPHA",
    archetype_id: "ARCH_FIXTURE",
    position: 1,
    technique_id: "TECH_FIXTURE_A",
    purpose: "Structural fixture.",
    operates_on: "vessel",
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
    accepts_filter: { any_tags: ["tag_a"] },
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
    expect(formatIssues(validate(dataset))).toBe("no issues");
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

  it("rejects a position-derived step ID", () => {
    expect(archetypeStepSchema.safeParse({ ...step(), id: "STEP_NIC_4" }).success).toBe(
      false,
    );
    expect(
      archetypeStepSchema.safeParse({ ...step(), id: "STEP_NIC_BLOOM_WHOLE_SPICE" })
        .success,
    ).toBe(true);
  });

  it("caps definition_short at 140 characters", () => {
    expect(
      techniqueSchema.safeParse({ ...technique(), definition_short: "x".repeat(140) })
        .success,
    ).toBe(true);
    expect(
      techniqueSchema.safeParse({ ...technique(), definition_short: "x".repeat(141) })
        .success,
    ).toBe(false);
  });

  it("holds difficulty and failure_sensitivity to 1-5", () => {
    expect(techniqueSchema.safeParse({ ...technique(), difficulty: 0 }).success).toBe(
      false,
    );
    expect(
      techniqueSchema.safeParse({ ...technique(), failure_sensitivity: 6 }).success,
    ).toBe(false);
  });

  it("rejects a duration model whose min exceeds its max", () => {
    expect(
      techniqueSchema.safeParse({
        ...technique(),
        duration_model: { base_seconds: 60, min_seconds: 600, max_seconds: 300 },
      }).success,
    ).toBe(false);
  });

  it("requires exactly one of technique_id or pattern_id on a step", () => {
    const base = {
      id: "STEP_FIX_BETA",
      archetype_id: "ARCH_FIXTURE",
      position: 1,
      purpose: "x",
      operates_on: "vessel" as const,
      sensory_target: "x",
    };
    expect(archetypeStepSchema.safeParse(base).success).toBe(false);
    expect(
      archetypeStepSchema.safeParse({
        ...base,
        technique_id: "TECH_FIXTURE_A",
        pattern_id: "PAT_FIXTURE",
      }).success,
    ).toBe(false);
    expect(archetypeStepSchema.safeParse(step()).success).toBe(true);
  });

  it("requires operates_on — there is no default", () => {
    const { operates_on: _omitted, ...withoutOperatesOn } = {
      id: "STEP_FIX_GAMMA",
      archetype_id: "ARCH_FIXTURE",
      position: 1,
      technique_id: "TECH_FIXTURE_A",
      purpose: "x",
      operates_on: "vessel" as const,
      sensory_target: "x",
    };
    expect(archetypeStepSchema.safeParse(withoutOperatesOn).success).toBe(false);
  });

  it("defaults a step to the main vessel with no merges", () => {
    const parsed = step();
    expect(parsed.vessel_id).toBe("main");
    expect(parsed.merges_from).toEqual([]);
  });

  it("requires operates_on 'both' when merges_from is non-empty", () => {
    expect(
      archetypeStepSchema.safeParse({
        ...step(),
        merges_from: ["tarka"],
        operates_on: "vessel",
      }).success,
    ).toBe(false);
    expect(
      archetypeStepSchema.safeParse({
        ...step(),
        merges_from: ["tarka"],
        operates_on: "both",
      }).success,
    ).toBe(true);
  });

  it("constrains suitability to 0-1", () => {
    expect(
      slotOptionSchema.safeParse({ ...slotOption(), suitability: 1.5 }).success,
    ).toBe(false);
    expect(slotOptionSchema.safeParse({ ...slotOption(), suitability: 1 }).success).toBe(
      true,
    );
  });

  it("defaults an archetype to draft and unverified", () => {
    const parsed = archetype();
    expect(parsed.status).toBe("draft");
    expect(parsed.verification_status).toBe("unverified");
  });

  it("takes the three verification states and rejects anything else", () => {
    for (const value of ["unverified", "author_verified", "community_verified"]) {
      expect(
        archetypeSchema.safeParse({ ...archetype(), verification_status: value })
          .success,
        value,
      ).toBe(true);
    }
    expect(
      archetypeSchema.safeParse({ ...archetype(), verification_status: "verified" })
        .success,
    ).toBe(false);
  });

  it("requires verified_at to be an ISO timestamp", () => {
    expect(
      archetypeSchema.safeParse({ ...archetype(), verified_at: "2026-08-10T12:00:00Z" })
        .success,
    ).toBe(true);
    expect(
      archetypeSchema.safeParse({ ...archetype(), verified_at: "last Tuesday" }).success,
    ).toBe(false);
  });

  it("uses the strict dish_class vocabulary from SPEC §0", () => {
    expect(archetypeSchema.safeParse({ ...archetype(), dish_class: "traybake" }).success).toBe(
      true,
    );
    // 'curry' is deliberately absent — it is a dish name, not a structure.
    expect(archetypeSchema.safeParse({ ...archetype(), dish_class: "curry" }).success).toBe(
      false,
    );
  });

  it("accepts the added adaptation_type and slot_role values", () => {
    expect(
      archetypeSchema.safeParse({ ...archetype(), adaptation_type: "fusion" }).success,
    ).toBe(true);
    expect(slotSchema.safeParse({ ...slot(), role: "starch" }).success).toBe(true);
  });

  it("keeps flavour axes within 0-10", () => {
    expect(
      archetypeSchema.safeParse({
        ...archetype(),
        base_flavour_axes: {
          heat: 11,
          acid: 0,
          sweet: 0,
          umami: 0,
          richness: 0,
          aromatic: 0,
        },
      }).success,
    ).toBe(false);
  });

  it("requires accepts_filter.any_tags and defaults the optional arms", () => {
    expect(acceptsFilterSchema.safeParse({ any_tags: [] }).success).toBe(false);
    expect(acceptsFilterSchema.safeParse({ all_tags: ["x"] }).success).toBe(false);

    const parsed = acceptsFilterSchema.parse({ any_tags: ["tag_a"] });
    expect(parsed.all_tags).toEqual([]);
    expect(parsed.exclude_tags).toEqual([]);
    expect(parsed.exclude_ids).toEqual([]);
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

  it("catches consumes_slots naming a slug no slot on that archetype declares", () => {
    const issues = validate(
      emptyDataset({
        techniques: [technique()],
        archetypes: [archetype()],
        steps: [step({ consumes_slots: ["not_a_slot"] })],
        slots: [slot()],
      }),
    );
    expect(formatIssues(issues)).toContain("not_a_slot");
  });

  it("scopes slot slugs to their own archetype", () => {
    // The slug exists, but on a different archetype.
    const issues = validate(
      emptyDataset({
        techniques: [technique()],
        archetypes: [archetype(), archetype({ id: "ARCH_OTHER", slug: "other" })],
        steps: [
          step({ archetype_id: "ARCH_OTHER", consumes_slots: ["fixture_main"] }),
        ],
        slots: [slot()],
      }),
    );
    expect(codes(issues)).toContain("unresolved_reference");
  });

  it("catches a default_option_id that belongs to a different slot", () => {
    const issues = validate(
      emptyDataset({
        archetypes: [archetype()],
        slots: [
          slot({ default_option_id: "OPT_FIXTURE_B" }),
          slot({ id: "SLOT_FIXTURE_OTHER", slug: "fixture_other" }),
        ],
        slotOptions: [slotOption({ id: "OPT_FIXTURE_B", slot_id: "SLOT_FIXTURE_OTHER" })],
      }),
    );
    expect(codes(issues)).toContain("reference_wrong_owner");
  });

  it("reports duplicate IDs", () => {
    expect(
      codes(validate(emptyDataset({ techniques: [technique(), technique()] }))),
    ).toContain("duplicate_id");
  });

  it("reports two steps sharing a position, across vessels", () => {
    const issues = validate(
      emptyDataset({
        techniques: [technique()],
        archetypes: [archetype()],
        steps: [
          step({ id: "STEP_FIX_ALPHA", position: 1 }),
          step({ id: "STEP_FIX_BETA", position: 1, vessel_id: "tarka" }),
        ],
      }),
    );
    expect(codes(issues)).toContain("duplicate_position");
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
/* validate() — vessels and merges                                             */
/* -------------------------------------------------------------------------- */

describe("validate: vessels and merges", () => {
  const boil = technique({ id: "TECH_BOIL", slug: "boil", produces: { state: "state_a" } });

  it("accepts a merge from a vessel with a prior step", () => {
    const issues = validate(
      emptyDataset({
        techniques: [boil],
        archetypes: [archetype()],
        steps: [
          step({ id: "STEP_FIX_MAIN", position: 1, technique_id: "TECH_BOIL" }),
          step({
            id: "STEP_FIX_TARKA",
            position: 2,
            vessel_id: "tarka",
            technique_id: "TECH_BOIL",
            operates_on: "slots",
          }),
          step({
            id: "STEP_FIX_COMBINE",
            position: 3,
            technique_id: "TECH_BOIL",
            operates_on: "both",
            merges_from: ["tarka"],
          }),
        ],
      }),
    );
    expect(formatIssues(issues)).toBe("no issues");
  });

  it("catches a merge from a vessel no step uses", () => {
    const issues = validate(
      emptyDataset({
        techniques: [boil],
        archetypes: [archetype()],
        steps: [
          step({ id: "STEP_FIX_MAIN", position: 1, technique_id: "TECH_BOIL" }),
          step({
            id: "STEP_FIX_COMBINE",
            position: 2,
            technique_id: "TECH_BOIL",
            operates_on: "both",
            merges_from: ["ghost_vessel"],
          }),
        ],
      }),
    );
    expect(codes(issues)).toContain("unresolved_reference");
    expect(formatIssues(issues)).toContain("ghost_vessel");
  });

  it("catches a merge from a vessel that has not started yet", () => {
    const issues = validate(
      emptyDataset({
        techniques: [boil],
        archetypes: [archetype()],
        steps: [
          step({
            id: "STEP_FIX_COMBINE",
            position: 1,
            technique_id: "TECH_BOIL",
            operates_on: "both",
            merges_from: ["tarka"],
          }),
          step({
            id: "STEP_FIX_TARKA",
            position: 2,
            vessel_id: "tarka",
            technique_id: "TECH_BOIL",
            operates_on: "slots",
          }),
        ],
      }),
    );
    expect(codes(issues)).toContain("merge_without_prior_step");
  });

  it("does not chain steps across different vessels", () => {
    const producer = technique({
      id: "TECH_PRODUCER",
      slug: "producer",
      produces: { state: "state_a" },
    });
    const consumer = technique({
      id: "TECH_CONSUMER",
      slug: "consumer",
      accepts: { states: ["state_b"] },
      produces: { state: "state_c" },
    });

    const issues = validate(
      emptyDataset({
        techniques: [producer, consumer],
        archetypes: [archetype()],
        steps: [
          step({ id: "STEP_FIX_MAIN", position: 1, technique_id: "TECH_PRODUCER" }),
          // Different vessel, so STEP_FIX_MAIN is not its predecessor.
          step({
            id: "STEP_FIX_TARKA",
            position: 2,
            vessel_id: "tarka",
            technique_id: "TECH_CONSUMER",
          }),
        ],
      }),
    );
    expect(codes(issues)).not.toContain("sequencing_mismatch");
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

  function consumer(states: string[], produces = "state_done"): Technique {
    return technique({
      id: "TECH_CONSUMER",
      slug: "consumer",
      accepts: { states },
      produces: { state: produces },
    });
  }

  function chain(...steps: ArchetypeStep[]): Dataset {
    return emptyDataset({
      techniques: [producer, consumer(["state_softened"])],
      archetypes: [archetype()],
      steps,
    });
  }

  it("passes when the next step accepts the produced state", () => {
    const issues = validate(
      chain(
        step({ id: "STEP_FIX_ONE", position: 1, technique_id: "TECH_PRODUCER" }),
        step({ id: "STEP_FIX_TWO", position: 2, technique_id: "TECH_CONSUMER" }),
      ),
    );
    expect(formatIssues(issues)).toBe("no issues");
  });

  it("fails when the next step does not accept the produced state", () => {
    const issues = validate(
      emptyDataset({
        techniques: [producer, consumer(["state_raw"])],
        archetypes: [archetype()],
        steps: [
          step({ id: "STEP_FIX_ONE", position: 1, technique_id: "TECH_PRODUCER" }),
          step({ id: "STEP_FIX_TWO", position: 2, technique_id: "TECH_CONSUMER" }),
        ],
      }),
    );
    expect(codes(issues)).toEqual(["sequencing_mismatch"]);
    expect(formatIssues(issues)).toContain("state_softened");
  });

  it("treats an empty accepts.states as unconstrained", () => {
    const issues = validate(
      emptyDataset({
        techniques: [producer, consumer([])],
        archetypes: [archetype()],
        steps: [
          step({ id: "STEP_FIX_ONE", position: 1, technique_id: "TECH_PRODUCER" }),
          step({ id: "STEP_FIX_TWO", position: 2, technique_id: "TECH_CONSUMER" }),
        ],
      }),
    );
    expect(issues).toEqual([]);
  });

  it("exempts a 'slots' step as a target — the worked NIC step 6 case", () => {
    // Searing raw protein after reducing a sauce is correct cooking, not a
    // state mismatch. Under the pre-operates_on rule this failed validation.
    const issues = validate(
      emptyDataset({
        techniques: [producer, consumer(["state_raw"])],
        archetypes: [archetype()],
        steps: [
          step({ id: "STEP_FIX_REDUCE", position: 1, technique_id: "TECH_PRODUCER" }),
          step({
            id: "STEP_FIX_SEAR",
            position: 2,
            technique_id: "TECH_CONSUMER",
            operates_on: "slots",
          }),
        ],
      }),
    );
    expect(codes(issues)).not.toContain("sequencing_mismatch");
  });

  it("exempts a 'both' step as a target", () => {
    const issues = validate(
      emptyDataset({
        techniques: [producer, consumer(["state_raw"])],
        archetypes: [archetype()],
        steps: [
          step({ id: "STEP_FIX_ONE", position: 1, technique_id: "TECH_PRODUCER" }),
          step({
            id: "STEP_FIX_TWO",
            position: 2,
            technique_id: "TECH_CONSUMER",
            operates_on: "both",
          }),
        ],
      }),
    );
    expect(codes(issues)).not.toContain("sequencing_mismatch");
  });

  it("walks past an optional step, which generation may skip", () => {
    // STEP_TWO is optional, so STEP_ONE's output can reach STEP_THREE directly.
    // STEP_TWO accepts the produced state but STEP_THREE does not.
    const optional = technique({
      id: "TECH_OPTIONAL",
      slug: "optional",
      accepts: { states: ["state_softened"] },
      produces: { state: "state_softened" },
    });

    const issues = validate(
      emptyDataset({
        techniques: [producer, optional, consumer(["state_raw"])],
        archetypes: [archetype()],
        steps: [
          step({ id: "STEP_FIX_ONE", position: 1, technique_id: "TECH_PRODUCER" }),
          step({
            id: "STEP_FIX_TWO",
            position: 2,
            technique_id: "TECH_OPTIONAL",
            is_optional: true,
          }),
          step({ id: "STEP_FIX_THREE", position: 3, technique_id: "TECH_CONSUMER" }),
        ],
      }),
    );
    expect(codes(issues)).toContain("sequencing_mismatch");
    expect(formatIssues(issues)).toContain("STEP_FIX_ONE");
  });

  it("stops the backward walk at the first mandatory predecessor", () => {
    // STEP_ONE is mandatory, so STEP_THREE can never see anything before it.
    const unreachable = technique({
      id: "TECH_UNREACHABLE",
      slug: "unreachable",
      produces: { state: "state_never_seen" },
    });

    const issues = validate(
      emptyDataset({
        techniques: [unreachable, producer, consumer(["state_softened"])],
        archetypes: [archetype()],
        steps: [
          step({ id: "STEP_FIX_ZERO", position: 1, technique_id: "TECH_UNREACHABLE" }),
          step({ id: "STEP_FIX_ONE", position: 2, technique_id: "TECH_PRODUCER" }),
          step({ id: "STEP_FIX_THREE", position: 3, technique_id: "TECH_CONSUMER" }),
        ],
      }),
    );
    expect(formatIssues(issues)).not.toContain("state_never_seen");
  });

  it("treats a 'slots' step as transparent when walking backwards", () => {
    // STEP_TWO acts only on new fills, so STEP_THREE's predecessor is STEP_ONE.
    const issues = validate(
      emptyDataset({
        techniques: [
          producer,
          technique({ id: "TECH_SLOTS", slug: "slots_only", accepts: { states: [] } }),
          consumer(["state_softened"]),
        ],
        archetypes: [archetype()],
        steps: [
          step({ id: "STEP_FIX_ONE", position: 1, technique_id: "TECH_PRODUCER" }),
          step({
            id: "STEP_FIX_TWO",
            position: 2,
            technique_id: "TECH_SLOTS",
            operates_on: "slots",
          }),
          step({ id: "STEP_FIX_THREE", position: 3, technique_id: "TECH_CONSUMER" }),
        ],
      }),
    );
    expect(formatIssues(issues)).toBe("no issues");
  });

  it("orders by position, not by declaration order", () => {
    const issues = validate(
      chain(
        step({ id: "STEP_FIX_TWO", position: 2, technique_id: "TECH_CONSUMER" }),
        step({ id: "STEP_FIX_ONE", position: 1, technique_id: "TECH_PRODUCER" }),
      ),
    );
    expect(issues).toEqual([]);
  });

  it("does not report sequencing for a step whose technique is missing", () => {
    const issues = validate(
      emptyDataset({
        archetypes: [archetype()],
        steps: [
          step({ id: "STEP_FIX_ONE", position: 1, technique_id: "TECH_GHOST" }),
          step({ id: "STEP_FIX_TWO", position: 2, technique_id: "TECH_GHOST" }),
        ],
      }),
    );
    expect(codes(issues)).not.toContain("sequencing_mismatch");
  });

  it("reports a cannot_follow violation between a step and its predecessor", () => {
    const follower = technique({
      id: "TECH_CONSUMER",
      slug: "consumer",
      accepts: { states: [] },
      cannot_follow: ["TECH_PRODUCER"],
    });

    const issues = validate(
      emptyDataset({
        techniques: [producer, follower],
        archetypes: [archetype()],
        steps: [
          step({ id: "STEP_FIX_ONE", position: 1, technique_id: "TECH_PRODUCER" }),
          step({ id: "STEP_FIX_TWO", position: 2, technique_id: "TECH_CONSUMER" }),
        ],
      }),
    );
    expect(codes(issues)).toContain("cannot_follow_violation");
  });
});

/* -------------------------------------------------------------------------- */
/* validate() — accepts_filter compatibility                                   */
/* -------------------------------------------------------------------------- */

describe("validate: accepts_filter compatibility", () => {
  function filterCase(
    acceptsTags: string[],
    filter: { any_tags: string[]; all_tags?: string[] },
    operatesOn: "slots" | "both" | "vessel" = "slots",
  ): ValidationIssue[] {
    return validate(
      emptyDataset({
        techniques: [
          technique({
            id: "TECH_FILTER",
            slug: "filter",
            accepts: { ingredient_tags: acceptsTags, states: [] },
          }),
        ],
        archetypes: [archetype()],
        steps: [
          step({
            id: "STEP_FIX_FILTER",
            technique_id: "TECH_FILTER",
            operates_on: operatesOn,
            consumes_slots: ["fixture_main"],
          }),
        ],
        slots: [slot({ accepts_filter: filter })],
      }),
    );
  }

  it("passes when every any_tag is accepted", () => {
    expect(formatIssues(filterCase(["poultry", "red_meat"], { any_tags: ["poultry"] }))).toBe(
      "no issues",
    );
  });

  it("fails when an any_tag is not accepted", () => {
    const issues = filterCase(["poultry"], { any_tags: ["poultry", "red_meat"] });
    expect(codes(issues)).toContain("filter_incompatible");
    expect(formatIssues(issues)).toContain("red_meat");
  });

  it("passes when a required all_tag is itself accepted", () => {
    // Every admitted ingredient carries the all_tag, so it always satisfies.
    expect(
      formatIssues(
        filterCase(["poultry"], { any_tags: ["anything", "else"], all_tags: ["poultry"] }),
      ),
    ).toBe("no issues");
  });

  it("treats empty accepts.ingredient_tags as unconstrained", () => {
    expect(formatIssues(filterCase([], { any_tags: ["whatever"] }))).toBe("no issues");
  });

  it("applies to 'both' steps as well as 'slots'", () => {
    expect(
      codes(filterCase(["poultry"], { any_tags: ["red_meat"] }, "both")),
    ).toContain("filter_incompatible");
  });

  it("does not apply to 'vessel' steps", () => {
    expect(
      codes(filterCase(["poultry"], { any_tags: ["red_meat"] }, "vessel")),
    ).not.toContain("filter_incompatible");
  });
});
