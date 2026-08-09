import { z } from "zod";
import {
  archetypeIdSchema,
  quantityRuleIdSchema,
  slotCardinalitySchema,
  slotIdSchema,
  slotOptionIdSchema,
  slugSchema,
} from "./common";

/**
 * `slot` — SPEC.md §5. Where generation gets its variety and the UI its
 * dynamism.
 */

/** `text` in SQL, enumerated inline in SPEC.md §5. */
export const slotRoleSchema = z.enum([
  "main",
  "aromatic",
  "spice",
  "fat",
  "acid",
  "liquid",
  "garnish",
  "pantry",
]);

/** What a fill of this slot changes downstream. */
export const slotAffectsSchema = z.enum([
  "dish_name",
  "time",
  "effort",
  "description",
  "flavour_axes",
]);

export const slotSchema = z.object({
  id: slotIdSchema,
  archetype_id: archetypeIdSchema,
  /** Unique within the archetype; this is what `consumes_slots` references. */
  slug: slugSchema,
  display_name: z.string().min(1),
  ui_prompt: z.string().min(1),
  ui_order: z.number().int().min(0),

  role: slotRoleSchema,
  cardinality: slotCardinalitySchema,
  is_required: z.boolean().default(true),

  /**
   * The ontology query defining valid options. SPEC.md declares this `jsonb`
   * but never gives its shape, so it stays an open object rather than an
   * invented query language — tighten it once the ontology is specced.
   */
  accepts_filter: z.record(z.string(), z.unknown()),

  /** Into the constraint layer. Every quantity must trace back to one of these. */
  quantity_rule_id: quantityRuleIdSchema,
  default_option_id: slotOptionIdSchema.optional(),

  affects: z.array(slotAffectsSchema).default([]),
});

export type SlotRole = z.infer<typeof slotRoleSchema>;
export type SlotAffects = z.infer<typeof slotAffectsSchema>;

/** Parsed shape — defaults applied. */
export type Slot = z.infer<typeof slotSchema>;

/** Authoring shape — defaulted fields may be omitted. Use with `satisfies`. */
export type SlotInput = z.input<typeof slotSchema>;
