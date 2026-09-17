// Tokens → dollars, at read time only. Prices live in the LLM_MODEL_PRICES env var as JSON,
// USD per 1M tokens: {"gemini-2.5-flash":{"input":0.30,"output":2.50}}. Not hardcoded here:
// they change per model and per quarter, and a stale constant would print a confident wrong
// number on every job. A model with no price yields null and the UI shows tokens instead.

import { createChildLogger } from "../../../../shared/logger.js";

const logger = createChildLogger("llm-pricing");

type Price = { input: number; output: number };

let prices: Record<string, Price> | null = null;

function loadPrices(): Record<string, Price> {
  if (prices) return prices;
  prices = {};
  const raw = process.env.LLM_MODEL_PRICES;
  if (!raw) return prices;
  try {
    const parsed = JSON.parse(raw) as Record<string, Partial<Price>>;
    for (const [model, p] of Object.entries(parsed)) {
      if (typeof p?.input === "number" && typeof p?.output === "number") prices[model] = { input: p.input, output: p.output };
    }
  } catch (err) {
    logger.warn("LLM_MODEL_PRICES is not valid JSON — costs will show as tokens only", { err: String(err) });
  }
  return prices;
}

/** USD for one model's tokens, or null when that model has no configured price. */
export function costUsd(model: string, promptTokens: number, outputTokens: number): number | null {
  const p = loadPrices()[model];
  if (!p) return null;
  return (promptTokens * p.input + outputTokens * p.output) / 1_000_000;
}

/**
 * Total across models. Null if ANY model is unpriced — a partial sum presented as a total is
 * the wrong-number failure the whole file exists to avoid.
 */
export function totalCostUsd(rows: Array<{ model: string; prompt_tokens: number; output_tokens: number }>): number | null {
  let total = 0;
  for (const r of rows) {
    const c = costUsd(r.model, r.prompt_tokens, r.output_tokens);
    if (c === null) return null;
    total += c;
  }
  return rows.length ? total : null;
}

/** Test seam: forget the parsed env so a test can set LLM_MODEL_PRICES and re-read. */
export function _resetPricesForTests(): void {
  prices = null;
}
