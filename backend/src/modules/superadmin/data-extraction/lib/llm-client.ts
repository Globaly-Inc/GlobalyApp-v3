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

// ponytail: throttle between LLM calls — 500ms for paid keys, raise if on free tier.
// Read per call, not at module load, so a run can be slowed down (LLM_THROTTLE_MS=700
// ≈ 85 RPM for a free-tier embedding key) without a rebuild, and so tests can zero it.
let lastLlmCall = 0;
const minLlmGapMs = () => Number(process.env.LLM_THROTTLE_MS) || 500;

/**
 * Take a turn, then wait out the gap. Callers queue on a promise chain rather than
 * each comparing `now` against `lastLlmCall` independently — with N concurrent
 * callers the latter has every one of them compute the same wait, sleep for it, and
 * then fire together as a burst of N, which is not a rate limit at all.
 *
 * Measured, not theorised: the embed worker takes several queue messages at once, so
 * the knowledge backfill sent bursts into a 100-requests-per-minute key, got 429s,
 * backed off ~58s in lockstep, and burst again — 21 chunks embedded in five minutes
 * out of a budget that should have carried ~400.
 *
 * The provider's limit is per key, so the gate has to be per process, not per call
 * site. It is deliberately not a semaphore: one call at a time, spaced, is exactly
 * what a requests-per-minute quota wants.
 */
let llmGate: Promise<void> = Promise.resolve();

function takeLlmTurn(): Promise<void> {
  const turn = llmGate.then(async () => {
    const wait = minLlmGapMs() - (Date.now() - lastLlmCall);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastLlmCall = Date.now();
  });
  // A rejected turn must not wedge the queue for everyone behind it.
  llmGate = turn.catch(() => undefined);
  return turn;
}

// ponytail: parse "retryDelay":"52s" from Gemini 429 errors
function parseRetryDelay(err: unknown): number | null {
  const msg = err instanceof Error ? err.message : String(err);
  const match = msg.match(/retryDelay.*?(\d+)s/i) || msg.match(/retry in (\d+)/i);
  return match ? Number(match[1]) * 1000 : null;
}

async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      await takeLlmTurn();
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
 * One model round-trip. The default talks to Gemini; tests inject a fixture so the
 * JSON-repair chain below can be exercised on real malformed output without a
 * provider — and without a key, which the suite pins empty on purpose.
 */
export type LlmGenerate = (req: {
  model: string;
  system: string;
  prompt: string;
  maxTokens: number;
  json: boolean;
}) => Promise<{ text: string; truncated: boolean }>;

const geminiGenerate: LlmGenerate = async (req) => {
  const ai = getClient();
  const model = ai.getGenerativeModel({
    model: req.model,
    systemInstruction: req.system,
    generationConfig: {
      maxOutputTokens: req.maxTokens,
      ...(req.json ? { responseMimeType: "application/json" } : {}),
    },
  });
  const result = await model.generateContent(req.prompt);
  return {
    text: result.response.text(),
    truncated: result.response.candidates?.[0]?.finishReason === "MAX_TOKENS",
  };
};

/**
 * Send a prompt to Gemini and parse JSON from the response.
 */
export async function extractJson<T>(opts: {
  system: string;
  prompt: string;
  model?: string;
  maxTokens?: number;
  generate?: LlmGenerate;
}): Promise<T> {
  const { text, truncated } = await withRetry(() =>
    (opts.generate ?? geminiGenerate)({
      model: opts.model ?? config.GEMINI_MODEL,
      system: opts.system,
      prompt: opts.prompt,
      maxTokens: opts.maxTokens ?? 16384,
      json: true,
    }),
  );

  const direct = asObject<T>(text);
  if (direct) return direct;

  // Gemini sometimes wraps JSON in markdown code fences or adds trailing junk
  const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  const fenced = asObject<T>(cleaned);
  if (fenced) return fenced;

  // ponytail: strip trailing garbage after the last balanced brace
  // Gemini often emits an extra } or }} after valid JSON
  const lastBrace = findBalancedEnd(cleaned);
  if (lastBrace > 0 && lastBrace < cleaned.length - 1) {
    const trimmed = asObject<T>(cleaned.slice(0, lastBrace + 1));
    if (trimmed) return trimmed;
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

/**
 * Parse, but only accept an object or array.
 *
 * `null`, `42` and `"sorry"` are all valid JSON, so a plain JSON.parse hands the
 * caller a value that satisfies no extraction shape and fails much later as a
 * TypeError on `.courses`. Every caller of extractJson is typed to an object;
 * anything else is a non-answer and has to fail closed here, where the error still
 * says what happened and the page worker can classify it as a parse error.
 */
function asObject<T>(text: string): T | null {
  try {
    const value: unknown = JSON.parse(text);
    return value !== null && typeof value === "object" ? (value as T) : null;
  } catch {
    return null;
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

/** Close unclosed brackets/braces in correct nesting order and try to parse an object. */
function tryCloseJson(partial: string): object | null {
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

  // Object-only, for the reason asObject spells out: `"42,"` truncates to a valid
  // JSON number, and returning 42 as an extraction result would be a fabrication.
  return asObject<object>(attempt);
}

/**
 * Simple text completion.
 */
export async function complete(opts: {
  system: string;
  prompt: string;
  model?: string;
  maxTokens?: number;
  generate?: LlmGenerate;
}): Promise<string> {
  const { text } = await withRetry(() =>
    (opts.generate ?? geminiGenerate)({
      model: opts.model ?? config.GEMINI_MODEL,
      system: opts.system,
      prompt: opts.prompt,
      maxTokens: opts.maxTokens ?? 2048,
      json: false,
    }),
  );
  return text;
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
 *
 * Goes through withRetry() for the same reason generateContent() does, learned by
 * measurement: publishing the 207-document knowledge corpus onto the embed queue at
 * once made the consumer run documents concurrently, Gemini's per-minute limit
 * rejected 184 of them with a 429, and queueService nacks with requeue=false — so
 * those documents were dropped and only 39 of 8,075 chunks were embedded. withRetry
 * both serialises every Gemini call in the process (one shared inter-call gap) and
 * honours the `retryDelay` the 429 body carries. A wrong-width vector is *not*
 * transient and is still rejected on the first attempt.
 */
export async function embed(text: string): Promise<number[]> {
  // Called over REST: @google/generative-ai SDK lacks outputDimensionality support.
  const model = config.GEMINI_EMBEDDING_MODEL;

  return withRetry(async () => {
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
      // 500, not 200: Gemini puts its RetryInfo.retryDelay at the *end* of the error
      // body, so a 200-char slice threw away the one hint worth having and left
      // parseRetryDelay() guessing. Observed on the real 429s from this corpus run.
      throw new Error(`Embedding failed (${res.status}): ${detail.slice(0, 500)}`);
    }

    const values: number[] = (await res.json())?.embedding?.values ?? [];
    if (values.length !== EMBEDDING_DIMS) {
      throw new Error(`Embedding returned ${values.length} dims, expected ${EMBEDDING_DIMS}`);
    }

    const norm = Math.sqrt(values.reduce((sum, v) => sum + v * v, 0));
    return norm > 0 ? values.map((v) => v / norm) : values;
  });
}

export function isConfigured(): boolean {
  return !!config.GEMINI_API_KEY;
}
