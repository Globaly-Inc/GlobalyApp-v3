// Gemini LLM client for structured extraction.

import { GoogleGenerativeAI } from "@google/generative-ai";
import { config } from "../../../../config.js";
import { createChildLogger } from "../../../../shared/logger.js";

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
  return /429|503|overloaded|high demand|rate limit/i.test(msg);
}

// ponytail: simple throttle to avoid hammering free-tier Gemini (15 RPM limit)
let lastLlmCall = 0;
const MIN_LLM_GAP_MS = 4000;

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
      throw err;
    }
  }
  throw new Error("unreachable");
}

/**
 * Send a prompt to Gemini and parse JSON from the response.
 */
export async function extractJson<T>(opts: {
  system: string;
  prompt: string;
  model?: string;
  maxTokens?: number;
}): Promise<T> {
  const ai = getClient();
  const model = ai.getGenerativeModel({
    model: opts.model ?? config.GEMINI_MODEL,
    systemInstruction: opts.system,
    generationConfig: {
      maxOutputTokens: opts.maxTokens ?? 16384,
      responseMimeType: "application/json",
    },
  });

  const result = await withRetry(() => model.generateContent(opts.prompt));
  const text = result.response.text();
  const truncated = result.response.candidates?.[0]?.finishReason === "MAX_TOKENS";

  try {
    return JSON.parse(text) as T;
  } catch {
    // Gemini sometimes wraps JSON in markdown code fences
    const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
    try {
      return JSON.parse(cleaned) as T;
    } catch {
      // ponytail: try to salvage incomplete JSON regardless of finish reason
      const salvaged = salvageTruncatedJson(cleaned);
      if (salvaged) {
        logger.warn("Salvaged incomplete LLM JSON response", { truncated });
        return salvaged as T;
      }
      logger.error("LLM returned invalid JSON", { raw: text.slice(0, 500), truncated });
      throw new Error("LLM returned invalid JSON");
    }
  }
}

/** Attempt to close truncated JSON by finding the last complete array element. */
function salvageTruncatedJson(text: string): unknown | null {
  // Find last complete object in an array (e.g. courses array cut mid-object)
  const lastCompleteObj = text.lastIndexOf("},");
  if (lastCompleteObj === -1) return null;

  let attempt = text.slice(0, lastCompleteObj + 1);
  // Close open brackets/braces
  const opens = { "[": 0, "{": 0 };
  for (const ch of attempt) {
    if (ch === "[") opens["["]++;
    else if (ch === "]") opens["["]--;
    else if (ch === "{") opens["{"]++;
    else if (ch === "}") opens["{"]--;
  }
  attempt += "]".repeat(Math.max(0, opens["["]));
  attempt += "}".repeat(Math.max(0, opens["{"]));

  try {
    return JSON.parse(attempt);
  } catch {
    return null;
  }
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
  const ai = getClient();
  const model = ai.getGenerativeModel({
    model: opts.model ?? config.GEMINI_MODEL,
    systemInstruction: opts.system,
    generationConfig: {
      maxOutputTokens: opts.maxTokens ?? 2048,
    },
  });

  const result = await withRetry(() => model.generateContent(opts.prompt));
  return result.response.text();
}

/** Width of every `embedding vector(...)` column in the superadmin schema. */
export const EMBEDDING_DIMS = 768;

/**
 * Generate embedding vector for text (extraction memory + AI Knowledge documents).
 *
 * gemini-embedding-001 returns 3072 dimensions by default and only normalises at that
 * width — a truncated vector comes back with ‖v‖ ≈ 0.57, so we re-normalise here.
 * Cosine distance would cope, but storing unit vectors keeps inner-product and L2
 * searches honest too.
 */
export async function embed(text: string): Promise<number[]> {
  // Called over REST rather than through the SDK: @google/generative-ai@0.24.1 has no
  // outputDimensionality on EmbedContentRequest, and without it the model returns 3072.
  const model = config.GEMINI_EMBEDDING_MODEL;
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:embedContent?key=${config.GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: `models/${model}`,
        content: { parts: [{ text }] },
        outputDimensionality: EMBEDDING_DIMS,
      }),
    },
  );

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Embedding failed (${res.status}): ${detail.slice(0, 200)}`);
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
