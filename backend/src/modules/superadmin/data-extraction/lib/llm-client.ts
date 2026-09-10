// Gemini LLM client for structured extraction.

import { GoogleGenerativeAI } from "@google/generative-ai";
import { config } from "../../../../config.js";
import { createChildLogger } from "../../../../shared/logger.js";
import { parseModelJson } from "../../../../shared/ai/parse-model-json.js";
import { isORConfigured, orExtractJson, orGenerateText, orEmbed } from "../../../../shared/ai/openrouter.js";

const logger = createChildLogger("llm-client");

let genAI: GoogleGenerativeAI | null = null;

function getClient(): GoogleGenerativeAI {
  if (!config.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY not configured");
  }
  if (!genAI) {
    genAI = new GoogleGenerativeAI(config.GEMINI_API_KEY);
  }
  return genAI;
}

const MAX_RETRIES = 3;

function isTransient(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  // "fetch failed" et al: undici's network-level failures (DNS blip, reset socket).
  // As transient as a 503 — the SDK surfaces them with no status code at all.
  return /429|503|overloaded|high demand|rate limit|fetch failed|ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|socket|network/i.test(msg);
}

// ponytail: throttle between LLM calls — 500ms for paid keys, raise if on free tier
let lastLlmCall = 0;
const MIN_LLM_GAP_MS = Number(process.env.LLM_THROTTLE_MS) || 500;

// ponytail: parse "retryDelay":"52s" from Gemini 429 errors
function parseRetryDelay(err: unknown): number | null {
  const msg = err instanceof Error ? err.message : String(err);
  const match = msg.match(/retryDelay.*?(\d+)s/i) || msg.match(/retry in (\d+)/i);
  return match ? Number(match[1]) * 1000 : null;
}

async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const now = Date.now();
      const wait = MIN_LLM_GAP_MS - (now - lastLlmCall);
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      lastLlmCall = Date.now();
      return await fn();
    } catch (err) {
      if (attempt < MAX_RETRIES && isTransient(err)) {
        // Respect server's retry delay if provided, otherwise exponential backoff
        const serverDelay = parseRetryDelay(err);
        const delay = serverDelay ?? Math.min(2000 * Math.pow(2, attempt), 15_000) + Math.random() * 1000;
        logger.warn(`Transient LLM error, retrying in ${Math.round(delay / 1000)}s (attempt ${attempt + 1}/${MAX_RETRIES})`);
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
      if (isTransient(err)) {
        throw new Error(`AI_TRANSIENT: ${err instanceof Error ? err.message : String(err)}`, { cause: err });
      }
      throw err;
    }
  }
  throw new Error("unreachable");
}

/**
 * One structured log line per billed call — greppable cost attribution per model
 * ("llm usage"). The invoice only shows monthly per-SKU totals; this is what lets us
 * see which phase/model owns the tokens on any given day.
 */
function logUsage(model: string, usage?: { promptTokenCount?: number; candidatesTokenCount?: number; cachedContentTokenCount?: number }) {
  if (!usage) return;
  logger.info("llm usage", {
    model,
    promptTokens: usage.promptTokenCount ?? 0,
    outputTokens: usage.candidatesTokenCount ?? 0,
    cachedTokens: usage.cachedContentTokenCount ?? 0,
  });
}

/**
 * Send a prompt to Gemini and parse JSON from the response.
 */
export async function extractJson<T>(opts: {
  system: string;
  prompt: string;
  model?: string;
  maxTokens?: number;
  /**
   * "lite" routes the call to GEMINI_MODEL_LITE when that env var is set — for simple
   * structured tasks (URL classification, secondary units/fees fetches, field
   * verification) that don't need the full model. Falls back to GEMINI_MODEL when unset,
   * so the downgrade is an env-var opt-in with an instant rollback, never a code change.
   */
  tier?: "lite";
}): Promise<T> {
  let modelId: string;
  let text: string;
  let truncated = false;
  try {
    const ai = getClient();
    modelId = opts.model
      ?? (opts.tier === "lite" && config.GEMINI_MODEL_LITE ? config.GEMINI_MODEL_LITE : config.GEMINI_MODEL);
    const model = ai.getGenerativeModel({
      model: modelId,
      systemInstruction: opts.system,
      generationConfig: {
        maxOutputTokens: opts.maxTokens ?? 16384,
        responseMimeType: "application/json",
      },
    });
    const result = await withRetry(() => model.generateContent(opts.prompt));
    logUsage(modelId, result.response.usageMetadata);
    text = result.response.text();
    truncated = result.response.candidates?.[0]?.finishReason === "MAX_TOKENS";
  } catch (geminiErr) {
    if (isORConfigured()) {
      logger.warn("Gemini extractJson failed — falling back to OpenRouter");
      return orExtractJson<T>({ system: opts.system, prompt: opts.prompt, maxTokens: opts.maxTokens });
    }
    throw geminiErr;
  }

  const { value, via } = parseModelJson<T>(text);
  if (value === null) {
    logger.error("LLM returned invalid JSON", { raw: text.slice(0, 500), truncated, length: text.length });
    throw new Error("LLM returned invalid JSON");
  }
  if (via !== "direct") logger.warn("Repaired LLM JSON", { via, truncated, length: text.length });
  return value;
}

/**
 * Simple text completion.
 */
export async function complete(opts: {
  system: string;
  prompt: string;
  model?: string;
  maxTokens?: number;
}): Promise<string> {
  try {
    const ai = getClient();
    const modelId = opts.model ?? config.GEMINI_MODEL;
    const model = ai.getGenerativeModel({
      model: modelId,
      systemInstruction: opts.system,
      generationConfig: {
        maxOutputTokens: opts.maxTokens ?? 2048,
      },
    });
    const result = await withRetry(() => model.generateContent(opts.prompt));
    logUsage(modelId, result.response.usageMetadata);
    return result.response.text();
  } catch (geminiErr) {
    if (isORConfigured()) {
      logger.warn("Gemini complete() failed — falling back to OpenRouter");
      return orGenerateText({ system: opts.system, prompt: opts.prompt, maxTokens: opts.maxTokens });
    }
    throw geminiErr;
  }
}

/** Width of every `embedding vector(...)` column in the superadmin schema. */
// ponytail: 3072 = gemini-embedding-001 native width, best quality.
// pgvector 0.6 can't index >2000 dims — we skip the index and use sequential scan
// (fine for extraction_memory / ai_knowledge scale). Add index after upgrading to pgvector 0.8+.
export const EMBEDDING_DIMS = 3072;

/**
 * Generate embedding vector for text (extraction memory + AI Knowledge documents).
 *
 * gemini-embedding-001 returns 3072 dimensions at native width and normalises there,
 * so no re-normalisation is strictly needed — but we do it anyway so inner-product
 * and L2 searches stay honest if the model ever drifts.
 */
export async function embed(text: string): Promise<number[]> {
  if (config.EMBEDDING_PROVIDER === "openrouter") {
    if (!isORConfigured()) {
      throw new Error("EMBEDDING_PROVIDER=openrouter but OPENROUTER_API_KEY is not set");
    }
    return orEmbed(text, EMBEDDING_DIMS);
  }

  // Called over REST: @google/generative-ai SDK lacks outputDimensionality support.
  const model = config.GEMINI_EMBEDDING_MODEL;
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:embedContent?key=${config.GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: `models/${model}`,
        content: { parts: [{ text }] },
      }),
    },
  );

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    const errMsg = `Embedding failed (${res.status}): ${detail.slice(0, 200)}`;
    if (isORConfigured()) {
      logger.warn(`Gemini embed failed — falling back to OpenRouter: ${errMsg}`);
      return orEmbed(text, EMBEDDING_DIMS);
    }
    throw new Error(errMsg);
  }

  const values: number[] = (await res.json())?.embedding?.values ?? [];
  if (values.length !== EMBEDDING_DIMS) {
    throw new Error(`Embedding returned ${values.length} dims, expected ${EMBEDDING_DIMS}`);
  }

  const norm = Math.sqrt(values.reduce((sum, v) => sum + v * v, 0));
  return norm > 0 ? values.map((v) => v / norm) : values;
}

export function isConfigured(): boolean {
  return !!config.GEMINI_API_KEY;
}

/** Can embed() actually run? Not the same question as isConfigured() once EMBEDDING_PROVIDER
 *  points at the fallback key — the Gemini key is then irrelevant. */
export function isEmbedConfigured(): boolean {
  return config.EMBEDDING_PROVIDER === "openrouter" ? isORConfigured() : isConfigured();
}
