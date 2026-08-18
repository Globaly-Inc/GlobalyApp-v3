// Metering constants for the AI counsellor.

/** Recorded on every usage event so a future second provider stays distinguishable. */
export const AI_PROVIDER = "gemini";

/** Tokens that make up one billable credit. */
export const TOKENS_PER_CREDIT = 1_000;

/**
 * List price in USD per 1,000,000 tokens.
 *
 * Because a cost is stored in USD micros, `tokens × usdPerMillion` is already the
 * micro figure — (tokens / 1e6) × usd × 1e6 — so no scaling constant is needed.
 */
export interface ModelRate {
  prompt: number;
  completion: number;
}

export const MODEL_RATES: Record<string, ModelRate> = {
  "gemini-3.5-flash": { prompt: 0.3, completion: 2.5 },
  "gemini-2.5-flash": { prompt: 0.3, completion: 2.5 },
  "gemini-2.5-pro": { prompt: 1.25, completion: 10 },
};

/** Used for a model with no published rate, so cost is never silently zero. */
export const DEFAULT_MODEL_RATE: ModelRate = { prompt: 0.3, completion: 2.5 };

export function rateFor(model: string): ModelRate {
  return MODEL_RATES[model] ?? DEFAULT_MODEL_RATE;
}

export function costMicros(model: string, promptTokens: number, completionTokens: number): number {
  const rate = rateFor(model);
  return Math.round(promptTokens * rate.prompt + completionTokens * rate.completion);
}

/**
 * Credits for a turn.
 *
 * Zero completion tokens means nothing reached the client, so the turn is free —
 * that is the rule that stops a stream dying before its first byte from costing a
 * credit. Anything delivered costs at least one credit.
 */
export function creditsFor(promptTokens: number, completionTokens: number): number {
  if (completionTokens <= 0) return 0;
  return Math.max(1, Math.ceil((promptTokens + completionTokens) / TOKENS_PER_CREDIT));
}

/**
 * Token estimate for a stream that died before the provider reported usage.
 *
 * ~4 characters per token is the standard approximation; it is only ever applied
 * to what was actually delivered, so it cannot invent tokens the client never saw.
 */
export function tokensFromChars(chars: number): number {
  return Math.ceil(chars / 4);
}

export function estimateTokens(text: string): number {
  return tokensFromChars(text.length);
}
