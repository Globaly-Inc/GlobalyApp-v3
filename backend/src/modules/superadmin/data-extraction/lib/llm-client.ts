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
    // Gemini sometimes wraps JSON in markdown code fences or adds trailing junk
    let cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
    try {
      return JSON.parse(cleaned) as T;
    } catch {
      // ponytail: strip trailing garbage after the last balanced brace
      // Gemini often emits an extra } or }} after valid JSON
      const lastBrace = findBalancedEnd(cleaned);
      if (lastBrace > 0 && lastBrace < cleaned.length - 1) {
        const trimmed = cleaned.slice(0, lastBrace + 1);
        try {
          return JSON.parse(trimmed) as T;
        } catch { /* fall through */ }
      }

      // Try to salvage incomplete/truncated JSON
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

/** Find the position of the closing brace/bracket that balances the first opening one. */
function findBalancedEnd(text: string): number {
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (escape) { escape = false; continue; }
    if (ch === "\\") { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === "{" || ch === "[") depth++;
    else if (ch === "}" || ch === "]") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/**
 * Salvage truncated JSON from Gemini.
 * Walks backward through candidate cut points (complete value boundaries)
 * and tries to close the JSON at each one. First successful parse wins.
 */
function salvageTruncatedJson(text: string): unknown | null {
  // Collect candidate cut points — positions right after a complete value
  // boundary: `},` `],` `",` `null,` `true,` `false,` or digit+comma
  // Also try `}` `]` without trailing comma (end of array/object).
  const candidates: number[] = [];
  const re = /\}[\s,]|\][\s,]|",|null[,\s\]}]|true[,\s\]}]|false[,\s\]}]|\d[,\s\]}]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    // Cut point is right after the value, before the comma/whitespace
    candidates.push(m.index + 1);
  }

  // Try from the end (longest valid prefix first)
  for (let i = candidates.length - 1; i >= 0; i--) {
    const result = tryCloseJson(text.slice(0, candidates[i]));
    if (result) return result;
  }

  return null;
}

/** Close unclosed brackets/braces in correct nesting order and try to parse. */
function tryCloseJson(partial: string): unknown | null {
  // If we're inside an open string, close it first
  let inString = false;
  let escape = false;
  for (const ch of partial) {
    if (escape) { escape = false; continue; }
    if (ch === "\\") { escape = true; continue; }
    if (ch === '"') inString = !inString;
  }
  let attempt = inString ? partial + '"' : partial;

  // Track nesting stack so we close in the correct reverse order
  // e.g. {"courses":[{"name":"X" → needs }]} not ]}}
  const stack: string[] = [];
  inString = false;
  escape = false;
  for (const ch of attempt) {
    if (escape) { escape = false; continue; }
    if (ch === "\\") { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === "{") stack.push("}");
    else if (ch === "[") stack.push("]");
    else if (ch === "}" || ch === "]") stack.pop();
  }
  attempt += stack.reverse().join("");

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
