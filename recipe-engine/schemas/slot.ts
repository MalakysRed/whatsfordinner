import { z } from "zod";
import {
  acceptsFilterSchema,
  archetypeIdSchema,
  quantityRuleIdSchema,
  slotCardinalitySchema,
  slotIdSchema,
  slotOptionIdSchema,
  slotRoleSchema,
  slugSchema,
} from "./common";

/**
 * `slot` — SPEC.md §5. Where generation gets its variety and the UI its
 * dynamism.
 *
 * Note the two identifier forms, which coexist deliberately (SPEC.md design
 * rule 6): `id` is the permanent `SLOT_` primary key that `slot_option`
 * references from outside, while `slug` is the archetype-local name that
 * `consumes_slots` and `condition.slot` use from inside.
 */

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

  /** Tag matching only. See `acceptsFilterSchema`. */
  accepts_filter: acceptsFilterSchema,

  /** Into the constraint layer. Every quantity must trace back to one of these. */
  quantity_rule_id: quantityRuleIdSchema,
  default_option_id: slotOptionIdSchema.optional(),

  affects: z.array(slotAffectsSchema).default([]),
});

export type SlotAffects = z.infer<typeof slotAffectsSchema>;

/** Parsed shape — defaults applied. */
export type Slot = z.infer<typeof slotSchema>;

/** Authoring shape — defaulted fields may be omitted. Use with `satisfies`. */
export type SlotInput = z.input<typeof slotSchema>;
