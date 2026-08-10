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
  type IngredientState,
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
import { computeStructureHash } from "../lib/structure-hash";

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
 * Fixture values are deliberately not culinary: vessels are `fixture_vessel`,
 * tags are `tag_a`, prose says "structural fixture". States are the exception —
 * `ingredient_state` is a closed enum (design rule 7), so fixtures must draw
 * from the real ten. Nothing here should be mistaken for an authored record.
 */

const VERIFIED_AT = "2026-08-10T12:00:00Z";

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
    produces: { state: "softened" },
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
    short_code: "FIX",
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

/**
 * An archetype marked verified against its own current structure, so the
 * reversion check passes. The hash has to be computed from a parsed archetype,
 * and the schema will not parse a verified one without a hash — so build it
 * once with a placeholder, then rebuild with the real value.
 */
function verifiedArchetype(
  steps: ArchetypeStep[],
  slotRecords: Slot[],
  overrides: Partial<ArchetypeInput> = {},
): Archetype {
  const base: Partial<ArchetypeInput> = {
    verification_status: "author_verified",
    verified_at: VERIFIED_AT,
    verified_structure_hash: "placeholder",
    ...overrides,
  };
  const hash = computeStructureHash(archetype(base), steps, slotRecords);
  return archetype({ ...base, verified_structure_hash: hash });
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

  it("passes referential, sequencing and verification validation", () => {
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
    expect(archetypeStepSchema.safeParse({ ...step(), id: "STEP_FIX_4" }).success).toBe(
      false,
    );
    expect(
      archetypeStepSchema.safeParse({ ...step(), id: "STEP_FIX_BLOOM_WHOLE_SPICE" })
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

  it("uses the strict dish_class vocabulary from SPEC §0", () => {
    expect(
      archetypeSchema.safeParse({ ...archetype(), dish_class: "traybake" }).success,
    ).toBe(true);
    // 'curry' is deliberately absent — a curry is dish_class 'braise', sharing
    // its shape with a beef and ale stew. Curry is a name, not a structure.
    expect(archetypeSchema.safeParse({ ...archetype(), dish_class: "curry" }).success).toBe(
      false,
    );
    expect(archetypeSchema.safeParse({ ...archetype(), dish_class: "braise" }).success).toBe(
      true,
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
/* Schemas — the closed state vocabulary                                       */
/* -------------------------------------------------------------------------- */

describe("schemas: ingredient_state is closed", () => {
  const STATES = [
    "raw",
    "softened",
    "browned",
    "sealed",
    "reduced",
    "thickened",
    "tender",
    "combined",
    "set",
    "rested",
  ];

  it("accepts every value in the enum", () => {
    for (const state of STATES) {
      expect(
        techniqueSchema.safeParse({ ...technique(), produces: { state } }).success,
        state,
      ).toBe(true);
    }
  });

  it("rejects an over-specific invented state", () => {
    expect(
      techniqueSchema.safeParse({
        ...technique(),
        produces: { state: "translucent_but_not_yet_golden" },
      }).success,
    ).toBe(false);
  });

  it("rejects a tag used where a state belongs", () => {
    // 'fresh' and 'poultry' are tags. Design rule 8 keeps the namespaces apart.
    expect(
      techniqueSchema.safeParse({ ...technique(), accepts: { states: ["fresh"] } })
        .success,
    ).toBe(false);
    expect(
      techniqueSchema.safeParse({ ...technique(), produces: { state: "poultry" } })
        .success,
    ).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */
/* Schemas — identity and verification                                         */
/* -------------------------------------------------------------------------- */

describe("schemas: short_code", () => {
  it("takes 2-4 uppercase letters and nothing else", () => {
    for (const code of ["NI", "NIC", "NICX"]) {
      expect(archetypeSchema.safeParse({ ...archetype(), short_code: code }).success, code).toBe(
        true,
      );
    }
    for (const code of ["N", "NICXY", "nic", "NI1", "NI_C"]) {
      expect(archetypeSchema.safeParse({ ...archetype(), short_code: code }).success, code).toBe(
        false,
      );
    }
  });
});

describe("schemas: verification integrity", () => {
  it("defaults an archetype to draft and unverified", () => {
    const parsed = archetype();
    expect(parsed.status).toBe("draft");
    expect(parsed.verification_status).toBe("unverified");
  });

  it("requires verified_at and verified_structure_hash once verified", () => {
    const verified = {
      ...archetype(),
      verification_status: "author_verified" as const,
    };

    expect(archetypeSchema.safeParse(verified).success).toBe(false);
    expect(
      archetypeSchema.safeParse({ ...verified, verified_at: VERIFIED_AT }).success,
    ).toBe(false);
    expect(
      archetypeSchema.safeParse({ ...verified, verified_structure_hash: "abc" }).success,
    ).toBe(false);
    expect(
      archetypeSchema.safeParse({
        ...verified,
        verified_at: VERIFIED_AT,
        verified_structure_hash: "abc",
      }).success,
    ).toBe(true);
  });

  it("requires neither while unverified", () => {
    expect(archetypeSchema.safeParse(archetype()).success).toBe(true);
  });

  it("takes the three verification states and rejects anything else", () => {
    for (const value of ["author_verified", "community_verified"]) {
      expect(
        archetypeSchema.safeParse({
          ...archetype(),
          verification_status: value,
          verified_at: VERIFIED_AT,
          verified_structure_hash: "abc",
        }).success,
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
      archetypeSchema.safeParse({
        ...archetype(),
        verification_status: "author_verified",
        verified_at: "last Tuesday",
        verified_structure_hash: "abc",
      }).success,
    ).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */
/* computeStructureHash                                                        */
/* -------------------------------------------------------------------------- */

describe("computeStructureHash", () => {
  const steps = [step()];
  const slotRecords = [slot()];
  const baseline = computeStructureHash(archetype(), steps, slotRecords);

  it("is deterministic", () => {
    expect(computeStructureHash(archetype(), steps, slotRecords)).toBe(baseline);
  });

  it("ignores prose — a typo fix must not un-verify a dish", () => {
    const proseEdits: Partial<ArchetypeInput>[] = [
      { description: "Rewritten entirely." },
      { teaching_summary: "Something new." },
      { authoring_notes: "A caveat." },
      { region_note: "A region." },
      { display_name: "Renamed" },
    ];

    for (const edit of proseEdits) {
      expect(
        computeStructureHash(archetype(edit), steps, slotRecords),
        JSON.stringify(edit),
      ).toBe(baseline);
    }

    expect(
      computeStructureHash(
        archetype(),
        [step({ sensory_target: "Completely different." , purpose: "Reworded." })],
        slotRecords,
      ),
    ).toBe(baseline);

    expect(
      computeStructureHash(archetype(), steps, [
        slot({ ui_prompt: "Reworded?", display_name: "Renamed" }),
      ]),
    ).toBe(baseline);
  });

  it("changes when the step sequence changes", () => {
    const changes = [
      [step({ operates_on: "both" })],
      [step({ vessel_id: "tarka" })],
      [step({ is_optional: true })],
      [step({ heat_override: "high" })],
      [step({ condition: { slot: "fixture_main", filled: true } })],
      [step({ technique_id: "TECH_OTHER" })],
    ];

    for (const changed of changes) {
      expect(
        computeStructureHash(archetype(), changed, slotRecords),
        JSON.stringify(changed[0].id),
      ).not.toBe(baseline);
    }
  });

  it("changes when step order changes", () => {
    const reordered = [
      step({ id: "STEP_FIX_ONE", position: 1, technique_id: "TECH_A" }),
      step({ id: "STEP_FIX_TWO", position: 2, technique_id: "TECH_B" }),
    ];
    const swapped = [
      step({ id: "STEP_FIX_ONE", position: 2, technique_id: "TECH_A" }),
      step({ id: "STEP_FIX_TWO", position: 1, technique_id: "TECH_B" }),
    ];
    expect(computeStructureHash(archetype(), reordered, slotRecords)).not.toBe(
      computeStructureHash(archetype(), swapped, slotRecords),
    );
  });

  it("changes when a slot's structural fields change", () => {
    for (const changed of [
      slot({ role: "garnish" }),
      slot({ cardinality: "one_to_many" }),
      slot({ is_required: false }),
      slot({ quantity_rule_id: "RULE_OTHER" }),
    ]) {
      expect(computeStructureHash(archetype(), steps, [changed])).not.toBe(baseline);
    }
  });

  it("changes when servings or scaling limits change", () => {
    expect(
      computeStructureHash(archetype({ default_servings: 6 }), steps, slotRecords),
    ).not.toBe(baseline);
    expect(
      computeStructureHash(
        archetype({ scaling_limits: { min: 1, max: 8 } }),
        steps,
        slotRecords,
      ),
    ).not.toBe(baseline);
  });

  it("is unaffected by merges_from ordering", () => {
    const a = [
      step({ operates_on: "both", merges_from: ["tarka", "stock"] }),
    ];
    const b = [
      step({ operates_on: "both", merges_from: ["stock", "tarka"] }),
    ];
    expect(computeStructureHash(archetype(), a, slotRecords)).toBe(
      computeStructureHash(archetype(), b, slotRecords),
    );
  });
});

/* -------------------------------------------------------------------------- */
/* validate() — identity                                                       */
/* -------------------------------------------------------------------------- */

describe("validate: identity", () => {
  it("catches two archetypes claiming the same short_code", () => {
    const issues = validate(
      emptyDataset({
        archetypes: [
          archetype(),
          archetype({ id: "ARCH_OTHER", slug: "other", short_code: "FIX" }),
        ],
      }),
    );
    expect(codes(issues)).toContain("duplicate_short_code");
  });

  it("accepts distinct short codes", () => {
    const issues = validate(
      emptyDataset({
        archetypes: [
          archetype(),
          archetype({ id: "ARCH_OTHER", slug: "other", short_code: "OTH" }),
        ],
      }),
    );
    expect(codes(issues)).not.toContain("duplicate_short_code");
  });

  it("catches a step ID carrying another archetype's short code", () => {
    const issues = validate(
      emptyDataset({
        techniques: [technique()],
        archetypes: [archetype()],
        steps: [step({ id: "STEP_OTH_ALPHA" })],
      }),
    );
    expect(codes(issues)).toContain("step_id_mismatch");
    expect(formatIssues(issues)).toContain("STEP_FIX_");
  });

  it("catches a step ID with no slug after the short code", () => {
    const issues = validate(
      emptyDataset({
        techniques: [technique()],
        archetypes: [archetype()],
        steps: [step({ id: "STEP_FIX" })],
      }),
    );
    expect(codes(issues)).toContain("step_id_mismatch");
  });
});

/* -------------------------------------------------------------------------- */
/* validate() — verification                                                   */
/* -------------------------------------------------------------------------- */

describe("validate: verification integrity", () => {
  const steps = [step()];
  const slotRecords = [slot()];

  it("passes when the verified hash matches the current structure", () => {
    const issues = validate(
      emptyDataset({
        techniques: [technique()],
        archetypes: [verifiedArchetype(steps, slotRecords)],
        steps,
        slots: slotRecords,
      }),
    );
    expect(formatIssues(issues)).toBe("no issues");
  });

  it("reverts verification when a cooking-relevant field changes", () => {
    // Verified against the original steps, then a step is edited.
    const verified = verifiedArchetype(steps, slotRecords);
    const edited = [step({ operates_on: "both" })];

    const issues = validate(
      emptyDataset({
        techniques: [technique()],
        archetypes: [verified],
        steps: edited,
        slots: slotRecords,
      }),
    );

    expect(codes(issues)).toContain("verification_reverted");
    const message = formatIssues(issues);
    expect(message).toContain("ARCH_FIXTURE");
    expect(message).toContain("cook it again");
  });

  it("does not revert on a prose edit", () => {
    const verified = verifiedArchetype(steps, slotRecords, {
      description: "Original wording.",
    });
    const retyped = archetype({
      verification_status: "author_verified",
      verified_at: VERIFIED_AT,
      verified_structure_hash: verified.verified_structure_hash,
      description: "Corrected wording.",
    });

    const issues = validate(
      emptyDataset({
        techniques: [technique()],
        archetypes: [retyped],
        steps,
        slots: slotRecords,
      }),
    );
    expect(codes(issues)).not.toContain("verification_reverted");
  });

  it("does not check the hash of an unverified archetype", () => {
    const issues = validate(
      emptyDataset({
        techniques: [technique()],
        archetypes: [archetype()],
        steps,
        slots: slotRecords,
      }),
    );
    expect(codes(issues)).not.toContain("verification_reverted");
  });

  it("catches a stored structure_hash that no longer matches", () => {
    const issues = validate(
      emptyDataset({
        techniques: [technique()],
        archetypes: [archetype({ structure_hash: "0".repeat(64) })],
        steps,
        slots: slotRecords,
      }),
    );
    expect(codes(issues)).toContain("structure_hash_stale");
  });

  it("accepts a stored structure_hash that matches", () => {
    const issues = validate(
      emptyDataset({
        techniques: [technique()],
        archetypes: [
          archetype({
            structure_hash: computeStructureHash(archetype(), steps, slotRecords),
          }),
        ],
        steps,
        slots: slotRecords,
      }),
    );
    expect(codes(issues)).not.toContain("structure_hash_stale");
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
        archetypes: [
          archetype(),
          archetype({ id: "ARCH_OTHER", slug: "other", short_code: "OTH" }),
        ],
        steps: [
          step({
            id: "STEP_OTH_ALPHA",
            archetype_id: "ARCH_OTHER",
            consumes_slots: ["fixture_main"],
          }),
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
  const boil = technique({ id: "TECH_BOIL", slug: "boil", produces: { state: "softened" } });

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

  it("catches a step merging its own vessel into itself", () => {
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
            merges_from: ["main"],
          }),
        ],
      }),
    );
    expect(codes(issues)).toContain("self_merge");
  });

  it("does not chain steps across different vessels", () => {
    const producer = technique({
      id: "TECH_PRODUCER",
      slug: "producer",
      produces: { state: "softened" },
    });
    const consumer = technique({
      id: "TECH_CONSUMER",
      slug: "consumer",
      accepts: { states: ["browned"] },
      produces: { state: "reduced" },
    });

    const issues = validate(
      emptyDataset({
        techniques: [producer, consumer],
        archetypes: [archetype()],
        steps: [
          step({ id: "STEP_FIX_MAIN", position: 1, technique_id: "TECH_PRODUCER" }),
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
    produces: { state: "softened" },
    accepts: { states: [] },
  });

  function consumer(
    states: IngredientState[],
    produces: IngredientState = "combined",
  ): Technique {
    return technique({
      id: "TECH_CONSUMER",
      slug: "consumer",
      accepts: { states },
      produces: { state: produces },
    });
  }

  it("passes when the next step accepts the produced state", () => {
    const issues = validate(
      emptyDataset({
        techniques: [producer, consumer(["softened"])],
        archetypes: [archetype()],
        steps: [
          step({ id: "STEP_FIX_ONE", position: 1, technique_id: "TECH_PRODUCER" }),
          step({ id: "STEP_FIX_TWO", position: 2, technique_id: "TECH_CONSUMER" }),
        ],
      }),
    );
    expect(formatIssues(issues)).toBe("no issues");
  });

  it("fails when the next step does not accept the produced state", () => {
    const issues = validate(
      emptyDataset({
        techniques: [producer, consumer(["raw"])],
        archetypes: [archetype()],
        steps: [
          step({ id: "STEP_FIX_ONE", position: 1, technique_id: "TECH_PRODUCER" }),
          step({ id: "STEP_FIX_TWO", position: 2, technique_id: "TECH_CONSUMER" }),
        ],
      }),
    );
    expect(codes(issues)).toEqual(["sequencing_mismatch"]);
    expect(formatIssues(issues)).toContain("softened");
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
        techniques: [producer, consumer(["raw"])],
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
        techniques: [producer, consumer(["raw"])],
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
    const optional = technique({
      id: "TECH_OPTIONAL",
      slug: "optional",
      accepts: { states: ["softened"] },
      produces: { state: "softened" },
    });

    const issues = validate(
      emptyDataset({
        techniques: [producer, optional, consumer(["raw"])],
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
    // STEP_FIX_ONE is mandatory, so STEP_FIX_THREE never sees STEP_FIX_ZERO.
    const unreachable = technique({
      id: "TECH_UNREACHABLE",
      slug: "unreachable",
      produces: { state: "set" },
    });

    const issues = validate(
      emptyDataset({
        techniques: [unreachable, producer, consumer(["softened"])],
        archetypes: [archetype()],
        steps: [
          step({ id: "STEP_FIX_ZERO", position: 1, technique_id: "TECH_UNREACHABLE" }),
          step({ id: "STEP_FIX_ONE", position: 2, technique_id: "TECH_PRODUCER" }),
          step({ id: "STEP_FIX_THREE", position: 3, technique_id: "TECH_CONSUMER" }),
        ],
      }),
    );
    expect(formatIssues(issues)).toBe("no issues");
  });

  it("treats a 'slots' step as transparent when walking backwards", () => {
    // Confirmed in SPEC §7: a step that only introduces new fills leaves the
    // accumulated contents as the last vessel/both step left them, so it is
    // skipped and never stops the walk — mandatory or not.
    const issues = validate(
      emptyDataset({
        techniques: [
          producer,
          technique({ id: "TECH_SLOTS", slug: "slots_only", accepts: { states: [] } }),
          consumer(["softened"]),
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
      emptyDataset({
        techniques: [producer, consumer(["softened"])],
        archetypes: [archetype()],
        steps: [
          step({ id: "STEP_FIX_TWO", position: 2, technique_id: "TECH_CONSUMER" }),
          step({ id: "STEP_FIX_ONE", position: 1, technique_id: "TECH_PRODUCER" }),
        ],
      }),
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

  it("does not apply cannot_follow to a 'slots' target", () => {
    // Scoped to vessel targets only: condition-based constraints are already
    // covered by produces/accepts with a clearer message.
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
          step({
            id: "STEP_FIX_TWO",
            position: 2,
            technique_id: "TECH_CONSUMER",
            operates_on: "slots",
          }),
        ],
      }),
    );
    expect(codes(issues)).not.toContain("cannot_follow_violation");
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
