import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { z } from "zod";
import { getAnthropicKey } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import type { GenerationType, MealType } from "@/lib/db/types";
import {
  EFFORT_FOR_CALL,
  MAX_TOKENS_FOR_CALL,
  MODELS,
  MODEL_FOR_CALL,
  estimateCostUsd,
  type TokenUsage,
} from "./models";
import { buildHouseholdBlock, buildSystemPrompt } from "./prompts/system";
import type { HouseholdContext } from "./prompts/context";

let cached: Anthropic | null = null;

function anthropic(): Anthropic {
  if (!cached) {
    cached = new Anthropic({ apiKey: getAnthropicKey() });
  }
  return cached;
}

/** Raised when generation fails in a way the user needs to see. */
export class GenerationError extends Error {
  constructor(
    message: string,
    readonly reason: "capped" | "unavailable" | "invalid" | "allergen",
  ) {
    super(message);
    this.name = "GenerationError";
  }
}

export interface GenerationRequest<T extends z.ZodType> {
  type: GenerationType;
  householdId: string;
  userId: string;
  mealType: MealType;
  context: HouseholdContext;
  /** The uncached, per-call half of the prompt. */
  requestBlock: string;
  schema: T;
  /**
   * Validates a parsed response beyond its shape — the allergen guardrail and
   * the placeholder check. Returning a string rejects the response and feeds
   * that string back as a correction on the retry.
   */
  validate?: (value: z.infer<T>) => string | null;
}

export interface GenerationResult<T> {
  data: T;
  generationId: string;
}

/**
 * One generation call, with the guardrails and the accounting around it.
 *
 * Retries exactly once on a bad response — malformed shape, a dangling
 * ingredient reference, or an allergen that got through the prompt — feeding the
 * specific problem back as a correction. A second failure is a hard error: the
 * PRD is explicit that a half-parsed recipe must never reach the screen, and a
 * card that keeps failing the allergen check must not be shown at all.
 *
 * Every attempt is logged to `generations`, including the failures. They cost
 * tokens and they count against the daily cap, and they are the most useful
 * rows in the table when the prompts need work.
 */
export async function runGeneration<T extends z.ZodType>(
  request: GenerationRequest<T>,
): Promise<GenerationResult<z.infer<T>>> {
  const { type, context, requestBlock, schema, validate } = request;

  const model = MODELS[MODEL_FOR_CALL[type]];
  const system = buildSystemPrompt(request.mealType);
  const household = buildHouseholdBlock(context);

  let correction: string | null = null;
  let lastGenerationId = "";

  for (let attempt = 0; attempt < 2; attempt++) {
    const userContent = correction
      ? `${requestBlock}\n\nYour previous attempt was rejected: ${correction}\nProduce a corrected response that fixes this.`
      : requestBlock;

    const startedAt = Date.now();

    // Effort is the main latency and cost lever, and it rides in the same
    // output_config object as the response format. Haiku 4.5 rejects the
    // parameter outright, so it is only sent to models that accept it.
    const outputConfig = {
      ...(model.supportsEffort ? { effort: EFFORT_FOR_CALL[type] } : {}),
      format: zodOutputFormat(schema),
    };

    let parsed: z.infer<T> | null;
    let usage: TokenUsage;
    let rawContent: unknown;
    let latencyMs: number;

    try {
      const message = await anthropic().messages.parse({
        model: model.id,
        max_tokens: MAX_TOKENS_FOR_CALL[type],
        system: [
          { type: "text", text: system },
          {
            type: "text",
            text: household,
            // The breakpoint sits at the end of the household block: everything
            // before it is identical between calls. Note this is a no-op below
            // the model's minimum cacheable length, which Haiku sets high — a
            // small bank simply will not cache there, without any error.
            cache_control: { type: "ephemeral" },
          },
        ],
        messages: [{ role: "user", content: userContent }],
        output_config: outputConfig,
      });

      parsed = (message.parsed_output ?? null) as z.infer<T> | null;
      usage = message.usage as TokenUsage;
      rawContent = message.content;
      latencyMs = Date.now() - startedAt;
    } catch (error) {
      await logGeneration({
        ...request,
        model: model.id,
        latencyMs: Date.now() - startedAt,
        succeeded: false,
        error: error instanceof Error ? error.message : String(error),
        requestBlock: userContent,
        response: null,
        usage: null,
      });

      // A rate limit or an outage is not something a retry with a correction
      // will fix, but a transient error might be — so fall through to the
      // second attempt and only give up after that.
      if (attempt === 1) {
        throw new GenerationError(
          "Could not reach the recipe service. Try again in a moment.",
          "unavailable",
        );
      }
      continue;
    }

    if (!parsed) {
      lastGenerationId = await logGeneration({
        ...request,
        model: model.id,
        latencyMs,
        succeeded: false,
        error: "response did not match the schema",
        requestBlock: userContent,
        response: rawContent,
        usage,
      });

      correction = "the response did not match the required format.";
      continue;
    }

    const problem = validate?.(parsed) ?? null;

    if (problem) {
      lastGenerationId = await logGeneration({
        ...request,
        model: model.id,
        latencyMs,
        succeeded: false,
        error: problem,
        requestBlock: userContent,
        response: parsed,
        usage,
      });

      correction = problem;
      continue;
    }

    lastGenerationId = await logGeneration({
      ...request,
      model: model.id,
      latencyMs,
      succeeded: true,
      error: null,
      requestBlock: userContent,
      response: parsed,
      usage,
    });

    return { data: parsed, generationId: lastGenerationId };
  }

  // Both attempts produced something unusable. If the last failure was an
  // allergen, say so specifically — it is the one failure the user should know
  // the real reason for.
  const wasAllergen = correction?.toLowerCase().includes("allergen") ?? false;

  throw new GenerationError(
    wasAllergen
      ? "We could not produce a dish that avoids your allergens. Nothing has been shown rather than risk it."
      : "The recipe came back malformed twice. Nothing has been shown rather than show half of it.",
    wasAllergen ? "allergen" : "invalid",
  );
}

interface LogInput {
  type: GenerationType;
  householdId: string;
  userId: string;
  mealType: MealType;
  model: string;
  latencyMs: number;
  succeeded: boolean;
  error: string | null;
  requestBlock: string;
  response: unknown;
  usage: TokenUsage | null;
}

/**
 * Writes the generation row. Uses the service role because the browser must not
 * be able to invent token counts — the daily cap and the spend figures depend
 * on these being real.
 */
async function logGeneration(input: LogInput): Promise<string> {
  const model = Object.values(MODELS).find((m) => m.id === input.model);

  const { data } = await createAdminClient()
    .from("generations")
    .insert({
      household_id: input.householdId,
      user_id: input.userId,
      meal_type: input.mealType,
      type: input.type,
      model: input.model,
      input_tokens: input.usage?.input_tokens ?? null,
      output_tokens: input.usage?.output_tokens ?? null,
      cache_creation_input_tokens: input.usage?.cache_creation_input_tokens ?? null,
      cache_read_input_tokens: input.usage?.cache_read_input_tokens ?? null,
      latency_ms: input.latencyMs,
      cost_usd:
        model && input.usage ? estimateCostUsd(model, input.usage) : null,
      request: { prompt: input.requestBlock },
      response: input.response ?? null,
      succeeded: input.succeeded,
      error: input.error,
    })
    .select("id")
    .single();

  return data?.id ?? "";
}

/**
 * The daily cap (FR2.6, A8). Counts every attempt since midnight, successful or
 * not — a failed call still spent money.
 */
export async function assertUnderDailyCap(
  userId: string,
  cap: number,
): Promise<{ used: number; remaining: number }> {
  const since = new Date();
  since.setHours(0, 0, 0, 0);

  const { count } = await createAdminClient()
    .from("generations")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("created_at", since.toISOString());

  const used = count ?? 0;

  if (used >= cap) {
    throw new GenerationError(
      `You have used all ${cap} generations for today.`,
      "capped",
    );
  }

  return { used, remaining: cap - used };
}
