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
        const delay = Math.min(2000 * Math.pow(2, attempt), 15_000) + Math.random() * 1000;
        logger.warn(`Transient LLM error, retrying in ${Math.round(delay)}ms (attempt ${attempt + 1}/${MAX_RETRIES})`);
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

/**
 * Generate embedding vector for text (used by extraction memory).
 */
export async function embed(text: string): Promise<number[]> {
  const ai = getClient();
  const model = ai.getGenerativeModel({ model: config.GEMINI_EMBEDDING_MODEL });
  const result = await model.embedContent(text);
  return result.embedding.values;
}

export function isConfigured(): boolean {
  return !!config.GEMINI_API_KEY;
}
