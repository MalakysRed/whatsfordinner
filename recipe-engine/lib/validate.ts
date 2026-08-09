import type {
  Accepts,
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
 * Scope: this implements SPEC.md §7's *referential* group and the
 * `produces` → `accepts` half of the *sequencing* group. The `cannot_follow`
 * check, cardinality, conflicting co-selection, the quantity group, the
 * coherence group and the prose group are not implemented here — those either
 * need the constraint layer (not yet specced) or a generated recipe to check
 * against, rather than the authored corpus alone.
 */

/* -------------------------------------------------------------------------- */
/* Inputs                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * The minimum a `pattern` must expose for sequencing. SPEC.md §2 defines the
 * full table, but no Zod schema for it has been written yet, so only the field
 * the sequencing check reads is modelled. A pattern has a `produces` but no
 * `accepts`, so a step that runs a pattern accepts anything.
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
  | "unresolved_reference"
  | "reference_wrong_owner"
  | "sequencing_mismatch";

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
  const stepById = byId(data.steps);
  const slotById = byId(data.slots);
  const slotOptionById = byId(data.slotOptions);

  const ingredientIds = optionalSet(data.ingredientIds);
  const quantityRuleIds = optionalSet(data.quantityRuleIds);
  const equipmentIds = optionalSet(data.equipmentIds);

  /** Slot slugs per archetype — `consumes_slots` references slugs, not IDs. */
  const slotSlugsByArchetype = new Map<string, Set<string>>();
  for (const slot of data.slots) {
    let slugs = slotSlugsByArchetype.get(slot.archetype_id);
    if (!slugs) {
      slugs = new Set<string>();
      slotSlugsByArchetype.set(slot.archetype_id, slugs);
    }
    slugs.add(slot.slug);
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

    const archetypeSlots = slotSlugsByArchetype.get(step.archetype_id);

    for (const slug of step.consumes_slots) {
      if (!archetypeSlots?.has(slug)) {
        add({
          code: "unresolved_reference",
          entity: "archetype_step",
          id: step.id,
          field: "consumes_slots",
          message: `consumes_slots references slot "${slug}", which no slot on archetype ${step.archetype_id} declares`,
        });
      }
    }

    if (step.condition && !archetypeSlots?.has(step.condition.slot)) {
      add({
        code: "unresolved_reference",
        entity: "archetype_step",
        id: step.id,
        field: "condition",
        message: `condition references slot "${step.condition.slot}", which no slot on archetype ${step.archetype_id} declares`,
      });
    }

    for (const ref of step.can_run_parallel_with) {
      const other = stepById.get(ref);
      if (!other) {
        add({
          code: "unresolved_reference",
          entity: "archetype_step",
          id: step.id,
          field: "can_run_parallel_with",
          message: `can_run_parallel_with references unknown step ${ref}`,
        });
      } else if (other.archetype_id !== step.archetype_id) {
        add({
          code: "reference_wrong_owner",
          entity: "archetype_step",
          id: step.id,
          field: "can_run_parallel_with",
          message: `can_run_parallel_with references step ${ref} on archetype ${other.archetype_id}, not ${step.archetype_id}`,
        });
      }
    }
  }

  /* ---- sequencing --------------------------------------------------------- */
  issues.push(...checkSequencing(data, techniqueById, patternById));

  return issues;
}

/* -------------------------------------------------------------------------- */
/* Sequencing                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * SPEC.md §7: "each step's `produces` satisfies the next step's `accepts`".
 *
 * "The next step" is not simply `position + 1`. An optional step may be skipped
 * at generation time, so a step's output has to be acceptable to every step it
 * could actually flow into: each optional step that follows it, plus the first
 * mandatory one. Checking only the immediate neighbour would let an archetype
 * pass that breaks the moment an optional step is dropped.
 */
function checkSequencing(
  data: Dataset,
  techniqueById: Map<string, Technique>,
  patternById: Map<string, PatternRef>,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  const stepsByArchetype = new Map<string, ArchetypeStep[]>();
  for (const step of data.steps) {
    const list = stepsByArchetype.get(step.archetype_id);
    if (list) list.push(step);
    else stepsByArchetype.set(step.archetype_id, [step]);
  }

  for (const [archetypeId, steps] of stepsByArchetype) {
    const ordered = [...steps].sort((a, b) => a.position - b.position);

    // UNIQUE (archetype_id, position) — without it "the next step" is undefined.
    const seenPositions = new Map<number, string>();
    for (const step of ordered) {
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

    for (let i = 0; i < ordered.length - 1; i++) {
      const step = ordered[i];
      const produces = producesOf(step, techniqueById, patternById);
      // An unresolved technique/pattern is already reported as a reference
      // issue; re-reporting it as a sequencing failure would be noise.
      if (!produces) continue;

      for (const next of reachableSuccessors(ordered, i)) {
        const accepts = acceptsOf(next, techniqueById);
        if (!accepts) continue;
        if (statesSatisfied(produces, accepts)) continue;

        issues.push({
          code: "sequencing_mismatch",
          entity: "archetype_step",
          id: next.id,
          field: "accepts",
          message:
            `step ${step.id} (position ${step.position}) produces state "${produces.state}", ` +
            `but step ${next.id} (position ${next.position}) accepts only ` +
            `[${accepts.states.join(", ")}]` +
            (next.consumes_slots.length > 0
              ? ` — note that ${next.id} consumes slots [${next.consumes_slots.join(", ")}], ` +
                `so it may be intended to accept those fills rather than the previous step's output`
              : ""),
        });
      }
    }
  }

  return issues;
}

/**
 * The steps a given step's output can reach: every optional step that follows
 * it, up to and including the first mandatory one.
 */
function reachableSuccessors(
  ordered: ArchetypeStep[],
  from: number,
): ArchetypeStep[] {
  const reachable: ArchetypeStep[] = [];
  for (let j = from + 1; j < ordered.length; j++) {
    reachable.push(ordered[j]);
    if (!ordered[j].is_optional) break;
  }
  return reachable;
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
