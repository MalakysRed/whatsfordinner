import { z } from "zod";

/**
 * Stage 3 — tailoring. Once a dish is picked from the six, this is the model
 * filling in the parts of it that are worth choosing between: which
 * vegetables, which hero herb or spice, which sauce/dressing/gravy, and so
 * on. The model decides which slots make sense for the dish — a curry might
 * get "spice paste" and "raita", a traybake might just get "vegetables" and
 * "herb" — rather than a fixed set asked of every dish.
 *
 * Every slot is optional in the UI: leaving one unpicked means "chef's
 * choice", not "the household forgot to answer a question".
 */

export const componentSlotOptionSchema = z.object({
  name: z.string(),
  /** Short why/pairing note, shown as helper text under the choice. */
  note: z.string().nullable(),
});

export const componentSlotSchema = z.object({
  /** Stable key for the slot, e.g. "vegetable", "herb_or_spice", "sauce". */
  slot: z.string(),
  /** Model-written display label, e.g. "Vegetables", "Hero herb or spice". */
  label: z.string(),
  options: z.array(componentSlotOptionSchema).min(2).max(6),
});

export const dishComponentsResponseSchema = z.object({
  slots: z.array(componentSlotSchema).max(5),
});

export type ComponentSlotOption = z.infer<typeof componentSlotOptionSchema>;
export type ComponentSlot = z.infer<typeof componentSlotSchema>;
export type DishComponentsResponse = z.infer<typeof dishComponentsResponseSchema>;
