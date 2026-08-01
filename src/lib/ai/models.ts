import type { GenerationType } from "@/lib/db/types";

/**
 * Model selection and cost accounting (PRD 9.1).
 *
 * Rates are dollars per million tokens. Verify against claude.com/pricing before
 * setting a budget — these are checked into the repo and will drift.
 */

export interface ModelPricing {
  input: number;
  output: number;
  /** Introductory rates, if any, and the date they stop applying. */
  intro?: { input: number; output: number; until: string };
}

export interface ModelSpec {
  id: string;
  pricing: ModelPricing;
  /**
   * Minimum prompt length before a cache breakpoint does anything. Below this
   * the write silently does not happen — no error, just no saving. It varies by
   * model and is not monotonic across generations, which is why it is recorded
   * per model rather than assumed.
   */
  cacheMinimumTokens: number;
  /** Whether the model accepts output_config.effort. Haiku 4.5 does not. */
  supportsEffort: boolean;
}

export const MODELS = {
  /** Short, list-shaped, latency sensitive, called often. */
  haiku: {
    id: "claude-haiku-4-5",
    pricing: { input: 1, output: 5 },
    cacheMinimumTokens: 4096,
    supportsEffort: false,
  },
  /** Taste and constraint juggling, and the quality-bearing recipe call. */
  sonnet: {
    id: "claude-sonnet-5",
    pricing: {
      input: 3,
      output: 15,
      intro: { input: 2, output: 10, until: "2026-08-31" },
    },
    cacheMinimumTokens: 1024,
    supportsEffort: true,
  },
  /** Only if Sonnet's recipe quality proves insufficient. */
  opus: {
    id: "claude-opus-5",
    pricing: { input: 5, output: 25 },
    cacheMinimumTokens: 512,
    supportsEffort: true,
  },
} as const satisfies Record<string, ModelSpec>;

export type ModelKey = keyof typeof MODELS;

/**
 * Which model runs which call.
 *
 * Flip `recipe` to "opus" if the cards come back bland — that is the one lever
 * the PRD names, and the generations table is where the evidence for pulling it
 * lives.
 */
export const MODEL_FOR_CALL: Record<GenerationType, ModelKey> = {
  flavour: "haiku",
  suggestions: "sonnet",
  recipe: "sonnet",
};

/**
 * Effort per call type.
 *
 * This is the primary latency and cost lever. Sonnet 5 runs adaptive thinking by
 * default and defaults to `high` effort, which comfortably overshoots the PRD's
 * latency targets (flavours under 3s, suggestions under 8s, a card under 15s)
 * and costs more than this app needs. Start low, raise if the food is dull —
 * quality of the output is the thing worth spending on, and these numbers are
 * meant to be tuned against real cards in the generations table.
 */
export const EFFORT_FOR_CALL: Record<GenerationType, "low" | "medium" | "high"> = {
  flavour: "low",
  suggestions: "medium",
  recipe: "medium",
};

/**
 * max_tokens per call. On Sonnet 5 this caps thinking *and* response text
 * together, so it needs headroom well beyond the visible output or a card
 * truncates mid-step.
 */
export const MAX_TOKENS_FOR_CALL: Record<GenerationType, number> = {
  flavour: 4_000,
  suggestions: 12_000,
  recipe: 20_000,
};

export interface TokenUsage {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
}

/**
 * Dollar cost of one call.
 *
 * Cache reads cost a tenth of standard input and cache writes a quarter more,
 * so a figure that ignores them is wrong in both directions — which matters when
 * the whole point of the cacheable block is that it is large and repeated.
 */
export function estimateCostUsd(
  model: ModelSpec,
  usage: TokenUsage,
  now: Date = new Date(),
): number {
  const { pricing } = model;

  const rates =
    pricing.intro && now <= new Date(`${pricing.intro.until}T23:59:59Z`)
      ? { input: pricing.intro.input, output: pricing.intro.output }
      : { input: pricing.input, output: pricing.output };

  const perToken = (perMillion: number) => perMillion / 1_000_000;

  const uncachedInput = usage.input_tokens * perToken(rates.input);
  const cacheWrite =
    (usage.cache_creation_input_tokens ?? 0) * perToken(rates.input) * 1.25;
  const cacheRead =
    (usage.cache_read_input_tokens ?? 0) * perToken(rates.input) * 0.1;
  const output = usage.output_tokens * perToken(rates.output);

  return uncachedInput + cacheWrite + cacheRead + output;
}

/** Total prompt size. `input_tokens` alone is only the uncached remainder. */
export function totalInputTokens(usage: TokenUsage): number {
  return (
    usage.input_tokens +
    (usage.cache_creation_input_tokens ?? 0) +
    (usage.cache_read_input_tokens ?? 0)
  );
}
