import { z } from "zod";

/**
 * The eight-direction schema — stage 2 of the generation flow.
 *
 * Deliberately lightweight, and deliberately not a dish: a short, punchy
 * `direction` rather than a title, plus just enough flavour/texture/hero-
 * ingredient detail for the card to be exploratory rather than a near-finished
 * recipe. Anything heavier (ingredient/sauce detail, technique tags) belongs
 * to a later stage, once the user has actually picked one of the eight —
 * generating it for all eight here would mean paying for seven discarded
 * directions' worth of detail on every request.
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
  /** A short, punchy direction, not a dish name — e.g. "Charred and
   *  citrus-bright" or "Deep, slow-spiced, warming". Describes where to take
   *  the main ingredient, not a finished plate. */
  direction: z.string().max(80),
  /** 2-4 short descriptors, e.g. ["smoky", "sharp", "sweet-heat"]. */
  flavours: z.array(z.string()).min(2).max(4),
  /** 2-4 short descriptors, e.g. ["crisp", "silky", "charred"]. */
  textures: z.array(z.string()).min(2).max(4),
  cuisine: z.string(),
  /** 2-5 ingredients this direction could be built around — not locked in. */
  hero_ingredients: z.array(z.string()).min(2).max(5),
  effort_minutes: z.number().int(),
  axes: optionAxesSchema,
  /**
   * Which of the "anything to use up" items this option actually uses —
   * surfaced on the card itself so the household can see it was honoured,
   * rather than trusting it happened silently inside the prompt.
   */
  uses_named_ingredients: z.array(z.string()),
  /** A very brief, 14-word-max line of prose — enough context to tell the
   *  eight directions apart at a glance, not a recipe summary. */
  description: z.string().max(120),
  /** One comparative sentence: how this direction differs from the other
   *  seven in the same batch. Always present — there are always others to
   *  compare against at stage 2. */
  distinguishing_note: z.string().max(160),
});

export const optionsResponseSchema = z.object({
  options: z.array(optionSchema),
});

export type Richness = z.infer<typeof richnessSchema>;
export type OptionAxes = z.infer<typeof optionAxesSchema>;
export type Option = z.infer<typeof optionSchema>;
export type OptionsResponse = z.infer<typeof optionsResponseSchema>;
