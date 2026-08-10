import type {
  Accepts,
  AcceptsFilter,
  Archetype,
  ArchetypeStep,
  Produces,
  Slot,
  SlotOption,
  Technique,
} from "../schemas";

/**
 * Referential and step-sequencing checks over the authored data layer.
 *
 * Rejection, not correction (SPEC.md §7). Nothing here repairs a record or
 * guesses an intended target — an unresolved reference is returned as an issue
 * and the caller decides. `tests/data.test.ts` turns that into a test failure,
 * which is what makes data validity part of the build rather than a warning
 * someone scrolls past.
 *
 * Implemented: SPEC.md §7's referential group, the per-vessel `produces` →
 * `accepts` walk, `cannot_follow`, the `accepts_filter` compatibility check for
 * `slots`/`both` steps, `merges_from` resolution including self-merge, and the
 * identity checks (`short_code` uniqueness, step-slug uniqueness, and exact
 * step-ID composition).
 *
 * Verification is deliberately absent from this module. `verification_status`
 * is derived rather than authored, so there is no authored input to validate
 * and nothing to reject; reversion is reported at build time by
 * `reportVerification` in `lib/verification.ts`, not raised as an error.
 * Editing an archetype is legitimate work, and failing the build for its
 * expected consequence is the kind of rule that gets switched off. The one
 * surviving rule — `verified_at` and `verified_structure_hash` both present or
 * both absent — lives in `archetypeSchema`, mirroring the SQL CHECK.
 *
 * Deliberately not implemented, per SPEC.md §7:
 *   - Condition-aware skip combinations. The walk treats every skip as
 *     reachable, so it can flag a combination `condition` makes impossible. A
 *     false positive is visible and irritating; a false negative ends up in
 *     someone's pan.
 *   - Full vessel state accumulation. It needs a combination model that cannot
 *     be designed against imaginary archetypes, and deferring costs nothing —
 *     it would consume exactly the `produces`/`accepts` data authored now.
 *
 * Also out of scope here: the quantity, coherence and prose groups, which need
 * the constraint layer or a generated recipe rather than the authored corpus;
 * and technique-level gating, which needs a user.
 */

/* -------------------------------------------------------------------------- */
/* Inputs                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * The minimum a `pattern` must expose for sequencing. SPEC.md §2 defines the
 * full table, but no Zod schema for it has been written yet, so only the field
 * the sequencing check reads is modelled. A pattern has a `produces` but no
 * `accepts`, so a pattern step is unconstrained on input.
 */
export interface PatternRef {
  id: string;
  produces: Produces;
}

export interface Dataset {
  techniques: Technique[];
  archetypes: Archetype[];
  steps: ArchetypeStep[];
  slots: Slot[];
  slotOptions: SlotOption[];
  patterns?: PatternRef[];

  /**
   * Registries for layers SPEC.md references but defines no table for. Supply
   * them and the matching references are checked; omit them and those checks
   * are skipped rather than failing every row against an empty set.
   */
  ingredientIds?: Iterable<string>;
  quantityRuleIds?: Iterable<string>;
  equipmentIds?: Iterable<string>;
}

export type EntityKind =
  | "technique"
  | "pattern"
  | "archetype"
  | "archetype_step"
  | "slot"
  | "slot_option";

export type IssueCode =
  | "duplicate_id"
  | "duplicate_position"
  | "duplicate_short_code"
  | "duplicate_step_slug"
  | "unresolved_reference"
  | "reference_wrong_owner"
  | "sequencing_mismatch"
  | "cannot_follow_violation"
  | "filter_incompatible"
  | "merge_without_prior_step"
  | "self_merge"
  | "step_id_mismatch";

export interface ValidationIssue {
  code: IssueCode;
  entity: EntityKind;
  /** The ID of the record carrying the problem, not the one it points at. */
  id: string;
  field?: string;
  message: string;
}

/* -------------------------------------------------------------------------- */
/* Validation                                                                  */
/* -------------------------------------------------------------------------- */

export function validate(data: Dataset): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const patterns = data.patterns ?? [];

  const add = (issue: ValidationIssue) => issues.push(issue);

  /* ---- duplicate IDs ---------------------------------------------------- */
  // Run first: the lookup maps below silently collapse duplicates, so an
  // unreported duplicate would turn into a confusing downstream pass.
  collectDuplicates(data.techniques, "technique", add);
  collectDuplicates(patterns, "pattern", add);
  collectDuplicates(data.archetypes, "archetype", add);
  collectDuplicates(data.steps, "archetype_step", add);
  collectDuplicates(data.slots, "slot", add);
  collectDuplicates(data.slotOptions, "slot_option", add);

  const techniqueById = byId(data.techniques);
  const patternById = byId(patterns);
  const archetypeById = byId(data.archetypes);
  const slotById = byId(data.slots);
  const slotOptionById = byId(data.slotOptions);

  const ingredientIds = optionalSet(data.ingredientIds);
  const quantityRuleIds = optionalSet(data.quantityRuleIds);
  const equipmentIds = optionalSet(data.equipmentIds);

  /**
   * Slots keyed by `archetype_id::slug` — local references use slugs scoped to
   * the archetype (SPEC.md design rule 6).
   */
  const slotByLocalRef = new Map<string, Slot>();
  for (const slot of data.slots) {
    slotByLocalRef.set(localRef(slot.archetype_id, slot.slug), slot);
  }

  /* ---- technique references --------------------------------------------- */
  for (const technique of data.techniques) {
    const refFields = [
      "prerequisite_ids",
      "can_follow",
      "can_precede",
      "cannot_follow",
    ] as const;

    for (const field of refFields) {
      for (const ref of technique[field]) {
        if (!techniqueById.has(ref)) {
          add({
            code: "unresolved_reference",
            entity: "technique",
            id: technique.id,
            field,
            message: `${field} references unknown technique ${ref}`,
          });
        }
      }
    }

    if (equipmentIds) {
      for (const ref of technique.equipment_ids) {
        if (!equipmentIds.has(ref)) {
          add({
            code: "unresolved_reference",
            entity: "technique",
            id: technique.id,
            field: "equipment_ids",
            message: `equipment_ids references unknown equipment ${ref}`,
          });
        }
      }
    }
  }

  /* ---- slot references --------------------------------------------------- */
  for (const slot of data.slots) {
    if (!archetypeById.has(slot.archetype_id)) {
      add({
        code: "unresolved_reference",
        entity: "slot",
        id: slot.id,
        field: "archetype_id",
        message: `archetype_id references unknown archetype ${slot.archetype_id}`,
      });
    }

    if (slot.default_option_id !== undefined) {
      const option = slotOptionById.get(slot.default_option_id);
      if (!option) {
        add({
          code: "unresolved_reference",
          entity: "slot",
          id: slot.id,
          field: "default_option_id",
          message: `default_option_id references unknown slot_option ${slot.default_option_id}`,
        });
      } else if (option.slot_id !== slot.id) {
        add({
          code: "reference_wrong_owner",
          entity: "slot",
          id: slot.id,
          field: "default_option_id",
          message: `default_option_id ${option.id} belongs to slot ${option.slot_id}, not this slot`,
        });
      }
    }

    if (quantityRuleIds && !quantityRuleIds.has(slot.quantity_rule_id)) {
      add({
        code: "unresolved_reference",
        entity: "slot",
        id: slot.id,
        field: "quantity_rule_id",
        message: `quantity_rule_id references unknown rule ${slot.quantity_rule_id}`,
      });
    }

    if (ingredientIds) {
      for (const ref of slot.accepts_filter.exclude_ids) {
        if (!ingredientIds.has(ref)) {
          add({
            code: "unresolved_reference",
            entity: "slot",
            id: slot.id,
            field: "accepts_filter",
            message: `accepts_filter.exclude_ids references unknown ingredient ${ref}`,
          });
        }
      }
    }
  }

  /* ---- slot_option references -------------------------------------------- */
  for (const option of data.slotOptions) {
    if (!slotById.has(option.slot_id)) {
      add({
        code: "unresolved_reference",
        entity: "slot_option",
        id: option.id,
        field: "slot_id",
        message: `slot_id references unknown slot ${option.slot_id}`,
      });
    }

    for (const ref of option.conflicts_with) {
      if (!slotOptionById.has(ref)) {
        add({
          code: "unresolved_reference",
          entity: "slot_option",
          id: option.id,
          field: "conflicts_with",
          message: `conflicts_with references unknown slot_option ${ref}`,
        });
      }
    }

    for (const ref of option.adds_technique_ids) {
      if (!techniqueById.has(ref)) {
        add({
          code: "unresolved_reference",
          entity: "slot_option",
          id: option.id,
          field: "adds_technique_ids",
          message: `adds_technique_ids references unknown technique ${ref}`,
        });
      }
    }

    if (ingredientIds && !ingredientIds.has(option.canonical_ingredient_id)) {
      add({
        code: "unresolved_reference",
        entity: "slot_option",
        id: option.id,
        field: "canonical_ingredient_id",
        message: `canonical_ingredient_id references unknown ingredient ${option.canonical_ingredient_id}`,
      });
    }
  }

  /* ---- archetype_step references ----------------------------------------- */
  for (const step of data.steps) {
    if (!archetypeById.has(step.archetype_id)) {
      add({
        code: "unresolved_reference",
        entity: "archetype_step",
        id: step.id,
        field: "archetype_id",
        message: `archetype_id references unknown archetype ${step.archetype_id}`,
      });
    }

    if (step.technique_id !== undefined && !techniqueById.has(step.technique_id)) {
      add({
        code: "unresolved_reference",
        entity: "archetype_step",
        id: step.id,
        field: "technique_id",
        message: `technique_id references unknown technique ${step.technique_id}`,
      });
    }

    if (step.pattern_id !== undefined && !patternById.has(step.pattern_id)) {
      add({
        code: "unresolved_reference",
        entity: "archetype_step",
        id: step.id,
        field: "pattern_id",
        message: `pattern_id references unknown pattern ${step.pattern_id}`,
      });
    }

    for (const slug of step.consumes_slots) {
      if (!slotByLocalRef.has(localRef(step.archetype_id, slug))) {
        add({
          code: "unresolved_reference",
          entity: "archetype_step",
          id: step.id,
          field: "consumes_slots",
          message: `consumes_slots references slot "${slug}", which no slot on archetype ${step.archetype_id} declares`,
        });
      }
    }

    if (
      step.condition &&
      !slotByLocalRef.has(localRef(step.archetype_id, step.condition.slot))
    ) {
      add({
        code: "unresolved_reference",
        entity: "archetype_step",
        id: step.id,
        field: "condition",
        message: `condition references slot "${step.condition.slot}", which no slot on archetype ${step.archetype_id} declares`,
      });
    }
  }

  /* ---- identity, vessels, sequencing and verification ---------------------- */
  issues.push(...checkIdentity(data, archetypeById));
  issues.push(...checkMerges(data));
  issues.push(...checkSlotFilters(data, techniqueById, slotByLocalRef));
  issues.push(...checkSequencing(data, techniqueById, patternById));

  return issues;
}

/* -------------------------------------------------------------------------- */
/* Identity                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * SPEC.md §7's identity checks: `short_code` is unique across archetypes, every
 * step `slug` is unique within its archetype, and every step ID equals
 * `STEP_` + its own archetype's `short_code` + its own `slug`.
 *
 * Both components are stored fields, so the ID is verified exactly rather than
 * only prefix checked.
 */
function checkIdentity(
  data: Dataset,
  archetypeById: Map<string, Archetype>,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  const seenShortCodes = new Map<string, string>();
  for (const archetype of data.archetypes) {
    const first = seenShortCodes.get(archetype.short_code);
    if (first !== undefined) {
      issues.push({
        code: "duplicate_short_code",
        entity: "archetype",
        id: archetype.id,
        field: "short_code",
        message: `short_code "${archetype.short_code}" is already claimed by archetype ${first}`,
      });
    } else {
      seenShortCodes.set(archetype.short_code, archetype.id);
    }
  }

  const seenSlugs = new Map<string, string>();
  for (const step of data.steps) {
    const key = localRef(step.archetype_id, step.slug);
    const first = seenSlugs.get(key);
    if (first !== undefined) {
      issues.push({
        code: "duplicate_step_slug",
        entity: "archetype_step",
        id: step.id,
        field: "slug",
        message: `slug "${step.slug}" is already used by step ${first} on archetype ${step.archetype_id}`,
      });
    } else {
      seenSlugs.set(key, step.id);
    }

    const archetype = archetypeById.get(step.archetype_id);
    // Unresolved archetype is already reported as a reference issue.
    if (!archetype) continue;

    const expected = `STEP_${archetype.short_code}_${step.slug.toUpperCase()}`;
    if (step.id !== expected) {
      issues.push({
        code: "step_id_mismatch",
        entity: "archetype_step",
        id: step.id,
        field: "id",
        message: `step ID must be "${expected}" — archetype ${archetype.id} has short_code "${archetype.short_code}" and this step's slug is "${step.slug}"`,
      });
    }
  }

  return issues;
}

/* -------------------------------------------------------------------------- */
/* Vessels                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Every `merges_from` vessel must exist within the same archetype and have at
 * least one step before the merging step — merging in a stream that has not
 * run yet is an ordering error, not a naming one.
 *
 * The schema already guarantees a step with a non-empty `merges_from` is
 * `operates_on: 'both'` (SPEC.md §4), so that is not re-checked here.
 */
function checkMerges(data: Dataset): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  /** archetype_id -> vessel_id -> earliest position seen in that vessel. */
  const earliestByVessel = new Map<string, Map<string, number>>();
  for (const step of data.steps) {
    let vessels = earliestByVessel.get(step.archetype_id);
    if (!vessels) {
      vessels = new Map<string, number>();
      earliestByVessel.set(step.archetype_id, vessels);
    }
    const seen = vessels.get(step.vessel_id);
    if (seen === undefined || step.position < seen) {
      vessels.set(step.vessel_id, step.position);
    }
  }

  for (const step of data.steps) {
    if (step.merges_from.length === 0) continue;
    const vessels = earliestByVessel.get(step.archetype_id);

    for (const vessel of step.merges_from) {
      // A step merging its own stream into itself is an authoring error that
      // would otherwise pass: the vessel trivially exists and has prior steps.
      if (vessel === step.vessel_id) {
        issues.push({
          code: "self_merge",
          entity: "archetype_step",
          id: step.id,
          field: "merges_from",
          message: `merges_from lists this step's own vessel "${vessel}"`,
        });
        continue;
      }

      const earliest = vessels?.get(vessel);
      if (earliest === undefined) {
        issues.push({
          code: "unresolved_reference",
          entity: "archetype_step",
          id: step.id,
          field: "merges_from",
          message: `merges_from references vessel "${vessel}", which no step on archetype ${step.archetype_id} uses`,
        });
      } else if (earliest >= step.position) {
        issues.push({
          code: "merge_without_prior_step",
          entity: "archetype_step",
          id: step.id,
          field: "merges_from",
          message: `merges_from references vessel "${vessel}", whose first step is at position ${earliest} — at or after this step's position ${step.position}`,
        });
      }
    }
  }

  return issues;
}

/* -------------------------------------------------------------------------- */
/* Slot filter compatibility                                                   */
/* -------------------------------------------------------------------------- */

/**
 * For a `slots` or `both` step, every ingredient the slot's `accepts_filter`
 * admits must also satisfy the technique's `accepts` (SPEC.md §5). A filter
 * that admits an ingredient the technique cannot take is an authoring error,
 * caught at build time rather than at generation time.
 *
 * Tags alone are compared, and that is correct rather than a limitation to be
 * fixed later. Per design rule 8, tags and states are separate namespaces: a
 * filter says *which ingredient*, never *what condition it is in*. It carries
 * no state or form information because it cannot meaningfully have any —
 * condition depends on where a step sits in the sequence, not on the
 * ingredient. So `accepts.states` and `accepts.forms` are deliberately not
 * cross-checked against a filter.
 *
 * There is also no ingredient ontology yet, so this reasons over the tag
 * guarantee rather than enumerating ingredients.
 */
function checkSlotFilters(
  data: Dataset,
  techniqueById: Map<string, Technique>,
  slotByLocalRef: Map<string, Slot>,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  for (const step of data.steps) {
    if (step.operates_on === "vessel") continue;
    if (step.technique_id === undefined) continue;

    const technique = techniqueById.get(step.technique_id);
    // Unresolved technique is already reported as a reference issue.
    if (!technique) continue;

    for (const slug of step.consumes_slots) {
      const slot = slotByLocalRef.get(localRef(step.archetype_id, slug));
      if (!slot) continue; // already reported

      const offending = incompatibleTags(slot.accepts_filter, technique.accepts);
      if (offending.length === 0) continue;

      issues.push({
        code: "filter_incompatible",
        entity: "archetype_step",
        id: step.id,
        field: "consumes_slots",
        message:
          `slot "${slug}" admits ingredients tagged [${offending.join(", ")}], ` +
          `which technique ${technique.id} does not accept ` +
          `(accepts.ingredient_tags: [${technique.accepts.ingredient_tags.join(", ")}])`,
      });
    }
  }

  return issues;
}

/**
 * Tags the filter admits that the technique cannot take.
 *
 * An ingredient admitted by the filter is guaranteed to carry only one of
 * `any_tags` plus all of `all_tags` — anything else it happens to carry is
 * unknown. So the filter is compatible when that guaranteed set always meets
 * `accepts.ingredient_tags`: either a required tag is itself accepted, or every
 * alternative in `any_tags` is.
 */
function incompatibleTags(filter: AcceptsFilter, accepts: Accepts): string[] {
  // Empty means unconstrained, matching SPEC.md's `can_follow` convention.
  if (accepts.ingredient_tags.length === 0) return [];

  const accepted = new Set(accepts.ingredient_tags);
  if (filter.all_tags.some((tag) => accepted.has(tag))) return [];

  return filter.any_tags.filter((tag) => !accepted.has(tag));
}

/* -------------------------------------------------------------------------- */
/* Sequencing                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * SPEC.md §7, validated **per vessel**, in position order, and only for steps
 * where `operates_on = 'vessel'`.
 *
 * For each such step, walk *backwards* through the same `vessel_id` collecting
 * candidate predecessors: every optional `vessel` or `both` step, then the
 * first mandatory one, at which point the walk stops. The step's `accepts` must
 * be satisfied by the `produces` of *every* candidate — that is what covers all
 * combinations of skips. Checking only `position - 1` would pass an archetype
 * that breaks the moment a user's selections omit an optional step.
 *
 * `slots` steps are skipped during the walk rather than ending it: they act
 * only on newly introduced fills, so they leave the accumulated vessel contents
 * as the previous `vessel`/`both` step left them.
 */
function checkSequencing(
  data: Dataset,
  techniqueById: Map<string, Technique>,
  patternById: Map<string, PatternRef>,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  const stepsByArchetype = groupBy(data.steps, (step) => step.archetype_id);

  for (const [archetypeId, archetypeSteps] of stepsByArchetype) {
    // UNIQUE (archetype_id, position) — spans vessels, so it is checked over
    // the whole archetype rather than per stream.
    const seenPositions = new Map<number, string>();
    for (const step of [...archetypeSteps].sort(byPosition)) {
      const first = seenPositions.get(step.position);
      if (first !== undefined) {
        issues.push({
          code: "duplicate_position",
          entity: "archetype_step",
          id: step.id,
          field: "position",
          message: `position ${step.position} on archetype ${archetypeId} is already taken by step ${first}`,
        });
      } else {
        seenPositions.set(step.position, step.id);
      }
    }

    const byVessel = groupBy(archetypeSteps, (step) => step.vessel_id);

    for (const vesselSteps of byVessel.values()) {
      const ordered = [...vesselSteps].sort(byPosition);

      for (let i = 0; i < ordered.length; i++) {
        const target = ordered[i];
        if (target.operates_on !== "vessel") continue;

        const accepts = acceptsOf(target, techniqueById);

        for (const predecessor of predecessorsOf(ordered, i)) {
          const technique = techniqueById.get(target.technique_id ?? "");
          const predecessorTechniqueId = predecessor.technique_id;

          if (
            technique &&
            predecessorTechniqueId !== undefined &&
            technique.cannot_follow.includes(predecessorTechniqueId)
          ) {
            issues.push({
              code: "cannot_follow_violation",
              entity: "archetype_step",
              id: target.id,
              field: "cannot_follow",
              message:
                `technique ${technique.id} declares it cannot follow ${predecessorTechniqueId}, ` +
                `but step ${predecessor.id} (position ${predecessor.position}) can precede ` +
                `${target.id} (position ${target.position}) in vessel "${target.vessel_id}"`,
            });
          }

          if (!accepts) continue;
          const produces = producesOf(predecessor, techniqueById, patternById);
          // Unresolved technique/pattern is already a reference issue.
          if (!produces) continue;
          if (statesSatisfied(produces, accepts)) continue;

          issues.push({
            code: "sequencing_mismatch",
            entity: "archetype_step",
            id: target.id,
            field: "accepts",
            message:
              `in vessel "${target.vessel_id}", step ${predecessor.id} ` +
              `(position ${predecessor.position}${predecessor.is_optional ? ", optional" : ""}) ` +
              `produces state "${produces.state}", but step ${target.id} ` +
              `(position ${target.position}) accepts only [${accepts.states.join(", ")}]`,
          });
        }
      }
    }
  }

  return issues;
}

/**
 * Candidate predecessors within a vessel: every optional `vessel`/`both` step
 * walking backwards, plus the first mandatory one. `slots` steps are
 * transparent — they neither qualify nor stop the walk.
 */
function predecessorsOf(ordered: ArchetypeStep[], from: number): ArchetypeStep[] {
  const candidates: ArchetypeStep[] = [];
  for (let j = from - 1; j >= 0; j--) {
    const step = ordered[j];
    if (step.operates_on === "slots") continue;
    candidates.push(step);
    if (!step.is_optional) break;
  }
  return candidates;
}

function producesOf(
  step: ArchetypeStep,
  techniqueById: Map<string, Technique>,
  patternById: Map<string, PatternRef>,
): Produces | undefined {
  if (step.technique_id !== undefined) {
    return techniqueById.get(step.technique_id)?.produces;
  }
  if (step.pattern_id !== undefined) {
    return patternById.get(step.pattern_id)?.produces;
  }
  return undefined;
}

/**
 * Only techniques declare `accepts`. SPEC.md §2 gives `pattern` a `produces`
 * for sequencing but no `accepts`, so a pattern step is unconstrained on input.
 */
function acceptsOf(
  step: ArchetypeStep,
  techniqueById: Map<string, Technique>,
): Accepts | undefined {
  if (step.technique_id === undefined) return undefined;
  return techniqueById.get(step.technique_id)?.accepts;
}

/** Empty `states` means unconstrained, matching SPEC.md's `can_follow` rule. */
function statesSatisfied(produces: Produces, accepts: Accepts): boolean {
  if (accepts.states.length === 0) return true;
  return accepts.states.includes(produces.state);
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

function localRef(archetypeId: string, slug: string): string {
  return `${archetypeId}::${slug}`;
}

function byPosition(a: ArchetypeStep, b: ArchetypeStep): number {
  return a.position - b.position;
}

function groupBy<T, K>(items: T[], key: (item: T) => K): Map<K, T[]> {
  const groups = new Map<K, T[]>();
  for (const item of items) {
    const k = key(item);
    const existing = groups.get(k);
    if (existing) existing.push(item);
    else groups.set(k, [item]);
  }
  return groups;
}

function byId<T extends { id: string }>(records: T[]): Map<string, T> {
  const map = new Map<string, T>();
  for (const record of records) {
    if (!map.has(record.id)) map.set(record.id, record);
  }
  return map;
}

function collectDuplicates<T extends { id: string }>(
  records: T[],
  entity: EntityKind,
  add: (issue: ValidationIssue) => void,
): void {
  const seen = new Set<string>();
  const reported = new Set<string>();
  for (const record of records) {
    if (seen.has(record.id) && !reported.has(record.id)) {
      reported.add(record.id);
      add({
        code: "duplicate_id",
        entity,
        id: record.id,
        field: "id",
        message: `${entity} id ${record.id} is declared more than once`,
      });
    }
    seen.add(record.id);
  }
}

function optionalSet(ids: Iterable<string> | undefined): Set<string> | undefined {
  return ids === undefined ? undefined : new Set(ids);
}

/** Readable multi-line rendering, for test output and CLI use. */
export function formatIssues(issues: ValidationIssue[]): string {
  if (issues.length === 0) return "no issues";
  return issues
    .map(
      (issue) =>
        `[${issue.code}] ${issue.entity} ${issue.id}` +
        (issue.field ? `.${issue.field}` : "") +
        `: ${issue.message}`,
    )
    .join("\n");
}
