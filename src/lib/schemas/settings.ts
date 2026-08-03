import { z } from "zod";

/**
 * Settings schemas (FR2.1–FR2.7), shared between the server actions that write
 * them and the prompt builder that reads them.
 */

export const spiceToleranceSchema = z.enum(["mild", "medium", "hot", "very_hot"]);

export const recencyWeightingSchema = z.enum([
  "never",
  "a_bit",
  "sometimes",
  "mostly",
  "always",
]);

export const measurementsSchema = z.object({
  units_weight: z.enum(["metric", "imperial"]),
  // UK conventions by default: pints of 568ml, no US cups unless asked for.
  units_volume: z.enum(["metric", "imperial", "us_cups"]),
  units_temp: z.enum(["c", "f"]),
  units_length: z.enum(["cm", "inches"]),
  show_gas_mark: z.boolean(),
});

export const householdDefaultsSchema = z.object({
  default_servings: z.number().int().min(1).max(12),
  /** Minutes. Null is "no limit", which is the default (A6). */
  default_time_limit: z.number().int().min(5).max(240).nullable(),
  spice_tolerance: spiceToleranceSchema,
  eating_notes: z.string().max(2000).nullable(),
});

export const shoppingSchema = z.object({
  supermarket: z.string().max(120).nullable(),
  delivery_day: z.string().max(40).nullable(),
  shopping_notes: z.string().max(2000).nullable(),
  default_include_staples: z.boolean(),
});

export const generationSchema = z.object({
  daily_generation_cap: z.number().int().min(1).max(500),
});

export const varietySchema = z.object({
  only_new: z.boolean(),
  recency_weighting: recencyWeightingSchema,
  recency_window_days: z.number().int().min(1).max(90),
  include_favourites: z.boolean(),
});

export const dietaryRuleSchema = z.object({
  type: z.enum(["allergen", "avoid", "diet"]),
  value: z.string().min(1).max(120),
});

/** FR1.4 — defaults to the email's local part at signup; rarely what you want kept. */
export const displayNameSchema = z.object({
  display_name: z.string().min(1).max(60),
});

/** FR1.3 — defaults to "Our kitchen" at signup unless changed there. */
export const householdNameSchema = z.object({
  name: z.string().min(1).max(80),
});

export type Measurements = z.infer<typeof measurementsSchema>;
export type HouseholdDefaults = z.infer<typeof householdDefaultsSchema>;
export type Variety = z.infer<typeof varietySchema>;
export type DietaryRuleInput = z.infer<typeof dietaryRuleSchema>;

export const SPICE_LABELS: Record<z.infer<typeof spiceToleranceSchema>, string> = {
  mild: "Mild",
  medium: "Medium",
  hot: "Hot",
  very_hot: "Very hot",
};

/**
 * How readily a recently cooked meal is offered again. The labels are the user's
 * language; the slot quota they map to lives in src/lib/generation/quota.ts,
 * because Claude will not reliably distinguish "a bit" from "sometimes" (FR2.8).
 */
export const RECENCY_LABELS: Record<z.infer<typeof recencyWeightingSchema>, string> = {
  never: "Never",
  a_bit: "A bit",
  sometimes: "Sometimes",
  mostly: "Mostly",
  always: "Always",
};
