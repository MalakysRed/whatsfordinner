import { z } from "zod";
import {
  flavourDeltaSchema,
  ingredientIdSchema,
  slotIdSchema,
  slotOptionIdSchema,
  techniqueIdSchema,
  typicalitySchema,
} from "./common";

/**
 * `slot_option` — SPEC.md §5.
 *
 * A poor option is not hidden. It is offered, scored, and honestly annotated
 * via `impact_note` — which teaches the user something rather than quietly
 * deciding for them.
 */

/** Deltas to the computed effort axes. */
export const effortDeltaSchema = z.object({
  technique_ceiling: z.number().int().optional(),
  coordination: z.number().int().optional(),
});

/**
 * The live preview payload — the field that lets the UI recompute on selection
 * with no round trip and no model call. Every field is optional because the
 * worked example in SPEC.md carries only three of them.
 */
export const effectOnSchema = z.object({
  flavour_delta: flavourDeltaSchema.optional(),
  time_delta_min: z.number().int().optional(),
  effort_delta: effortDeltaSchema.optional(),
  /**
   * SPEC.md gives one value (`specialist_grocer`) and no vocabulary, so this
   * stays a free string rather than a guessed enum.
   */
  obtainability: z.string().optional(),
  description_fragment: z.string().optional(),
  /** Explicitly nullable — the worked example sets it to `null`. */
  dish_name_modifier: z.string().nullable().optional(),
  equipment_added: z.array(z.string()).default([]),
});

export const slotOptionSchema = z.object({
  id: slotOptionIdSchema,
  slot_id: slotIdSchema,
  canonical_ingredient_id: ingredientIdSchema,

  /** `numeric(3,2)`, constrained 0–1 in SQL. */
  suitability: z.number().min(0).max(1),
  typicality: typicalitySchema,
  display_order: z.number().int().optional(),

  /**
   * An authored culinary claim. The model phrases this; it never originates it.
   * Required, and non-empty — an option without one is not done (SPEC.md §8).
   */
  impact_note: z.string().min(1),

  effect_on: effectOnSchema,

  adds_technique_ids: z.array(techniqueIdSchema).default([]),
  /**
   * Extra steps this option introduces. Left permissive on purpose (SPEC.md
   * §5): the first archetype that genuinely needs a slot option to inject a
   * step defines the shape. Specifying it now, with no use case, produces a
   * field nobody can use correctly.
   */
  adds_steps: z.array(z.unknown()).optional(),

  /** Other option IDs that cannot be co-selected with this one. */
  conflicts_with: z.array(slotOptionIdSchema).default([]),
  dietary_impact: z.array(z.string()).default([]),
  quantity_override_rule: z.string().optional(),
});

export type EffortDelta = z.infer<typeof effortDeltaSchema>;
export type EffectOn = z.infer<typeof effectOnSchema>;

/** Parsed shape — defaults applied. */
export type SlotOption = z.infer<typeof slotOptionSchema>;

/** Authoring shape — defaulted fields may be omitted. Use with `satisfies`. */
export type SlotOptionInput = z.input<typeof slotOptionSchema>;
