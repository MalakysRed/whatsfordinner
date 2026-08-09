import type {
  Archetype,
  ArchetypeStep,
  Slot,
  SlotOption,
  Technique,
} from "../schemas";
import type { Dataset, PatternRef } from "../lib/validate";

/**
 * Barrel export for the authored data layer.
 *
 * Empty by design — no culinary content has been authored yet. Authoring is
 * top down (root `recipe-engine/CLAUDE.md`): write an archetype first and it
 * reveals which techniques, patterns and ingredients are actually needed.
 * Do not add speculative records that no archetype references.
 *
 * Records are declared in their own files with `satisfies` against the
 * inferred type, one record per file, filename matching the slug. They are
 * collected here rather than parsed here: `tests/data.test.ts` parses them, so
 * invalid data surfaces as a readable test failure rather than an import-time
 * crash in every consumer.
 */

export const techniques: Technique[] = [];

export const archetypes: Archetype[] = [];

export const archetypeSteps: ArchetypeStep[] = [];

export const slots: Slot[] = [];

export const slotOptions: SlotOption[] = [];

/**
 * SPEC.md §2 defines `pattern`, but no Zod schema for it has been written yet,
 * so only the fields the sequencing check needs are modelled.
 */
export const patterns: PatternRef[] = [];

/** The whole authored corpus, in the shape `validate()` expects. */
export const dataset: Dataset = {
  techniques,
  patterns,
  archetypes,
  steps: archetypeSteps,
  slots,
  slotOptions,
};
