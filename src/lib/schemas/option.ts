import { z } from "zod";

/**
 * The six-option schema — stage 2 of the generation flow.
 *
 * Deliberately lightweight: a title, a one-line pitch, and just enough
 * structure for the variance engine to enforce diversity and dedup. Anything
 * heavier (ingredient/sauce detail, technique tags) belongs to a later stage,
 * once the user has actually picked one of the six — generating it for all
 * six here would mean paying for five discarded dishes' worth of detail on
 * every request.
 */

export const richnessSchema = z.enum(["light", "medium", "rich"]);

export const optionAxesSchema = z.object({
  protein: z.string(),
  method: z.string(),
  cuisine: z.string(),
  richness: richnessSchema,
});

export const optionSchema = z.object({
  id: z.string(),
  title: z.string(),
  /** One line, appetising, no jargon. */
  description: z.string(),
  cuisine: z.string(),
  effort_minutes: z.number().int(),
  axes: optionAxesSchema,
  /**
   * Which of the "anything to use up" items this option actually uses —
   * surfaced on the card itself so the household can see it was honoured,
   * rather than trusting it happened silently inside the prompt.
   */
  uses_named_ingredients: z.array(z.string()),
});

export const optionsResponseSchema = z.object({
  options: z.array(optionSchema),
});

export type Richness = z.infer<typeof richnessSchema>;
export type OptionAxes = z.infer<typeof optionAxesSchema>;
export type Option = z.infer<typeof optionSchema>;
export type OptionsResponse = z.infer<typeof optionsResponseSchema>;
