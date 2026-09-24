// Gemini LLM client for structured extraction.
//
// Every structured call also (1) records what it cost, attributed to the job and call kind in
// the ambient LLM context, and (2) goes through a result cache keyed on the exact input — see
// docs/data-extraction/2026-09-15-extraction-cost-reduction-design.md §3.1–3.2. Both are
// best-effort: a database hiccup must never fail an extraction that Gemini answered.

import { AsyncLocalStorage } from "node:async_hooks";
import { createHash } from "node:crypto";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { config } from "../../../../config.js";
import { createChildLogger } from "../../../../shared/logger.js";
import { parseModelJson } from "../../../../shared/ai/parse-model-json.js";
import { isORConfigured, orExtractJson, orGenerateText, orEmbed } from "../../../../shared/ai/openrouter.js";
import * as realStore from "./llm-store.js";

const logger = createChildLogger("llm-client");

// ── Ambient context: which job, which kind of call ──

export interface LlmContext {
  jobId?: string;
  /** 'course_extraction' | 'secondary' | 'pdf_vision' | 'verify' | 'site_analysis' | 'step:<name>' | … */
  kind: string;
}

const contextStore = new AsyncLocalStorage<LlmContext>();

/**
 * Attribute every model call for the rest of this async flow to a job and a call kind.
 *
 * enterWith, not run(): the workers' consume callbacks are 300-line bodies that would otherwise
 * need re-indenting into a closure. It must be the first thing after the message is parsed —
 * before any await that could reach the model — and each callback sets its own, so nothing
 * inherits a previous message's job. Use withLlmKind() for a scoped override inside one.
 */
export function setLlmContext(ctx: LlmContext): void {
  contextStore.enterWith(ctx);
}

/** Run fn with a more specific call kind, keeping the ambient jobId. */
export function withLlmKind<T>(kind: string, fn: () => Promise<T>): Promise<T> {
  return contextStore.run({ ...(contextStore.getStore() ?? {}), kind }, fn);
}

export function getLlmContext(): LlmContext | undefined {
  return contextStore.getStore();
}

// ── Test seam ──
// Gemini and the database are the two things a test cannot have. Everything else is the logic
// under test, so these two are the only injection points.

type Usage = { promptTokenCount?: number; candidatesTokenCount?: number; cachedContentTokenCount?: number };

interface Generated {
  text: string;
  usage?: Usage;
  truncated: boolean;
}

async function geminiGenerate(modelId: string, system: string, prompt: string, maxTokens: number, json: boolean): Promise<Generated> {
  const model = getClient().getGenerativeModel({
    model: modelId,
    systemInstruction: system,
    generationConfig: {
      maxOutputTokens: maxTokens,
      ...(json ? { responseMimeType: "application/json" } : {}),
    },
  });
  const result = await withRetry(() => model.generateContent(prompt));
  return {
    text: result.response.text(),
    usage: result.response.usageMetadata,
    truncated: result.response.candidates?.[0]?.finishReason === "MAX_TOKENS",
  };
}

export const _llmDeps = {
  generate: geminiGenerate,
  store: realStore as Pick<typeof realStore, "insertUsage" | "findCached" | "saveCached" | "bumpCacheHit">,
};

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

// A wait longer than this is never absorbed inline: blocking a worker slot (and, transitively,
// the caller's "processing" claim on whatever queue item this call is for) for however long the
// provider feels like asking is what let a legitimate rate-limit turn into a false stale-reclaim
// in the first place. Anything under this is short enough that just waiting it out here is simpler
// and cheaper than the caller re-dispatching a whole new attempt.
const INLINE_RETRY_CEILING_MS = 60_000;

async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const now = Date.now();
      const wait = MIN_LLM_GAP_MS - (now - lastLlmCall);
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      lastLlmCall = Date.now();
      return await fn();
    } catch (err) {
      if (!isTransient(err)) throw err;

      const serverDelay = parseRetryDelay(err);
      // The provider's own requested wait is honoured in full — never truncated — but a long one
      // is hard availability information ("don't bother before this"), not a cue to retry sooner.
      // Rather than block this call (and the caller's queue claim) for the whole thing, surface it
      // immediately so the caller can release its claim and schedule its own deferred retry — see
      // extraction-page.worker.ts's ai_5xx handling for retry_after_ms.
      if (serverDelay != null && serverDelay > INLINE_RETRY_CEILING_MS) {
        throw new Error(`AI_TRANSIENT: retry_after_ms=${serverDelay} ${err instanceof Error ? err.message : String(err)}`, { cause: err });
      }
      if (attempt < MAX_RETRIES) {
        const delay = (serverDelay ?? Math.min(2000 * Math.pow(2, attempt), 15_000)) + Math.random() * 1000;
        logger.warn(`Transient LLM error, retrying in ${Math.round(delay / 1000)}s (attempt ${attempt + 1}/${MAX_RETRIES})`);
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
      throw new Error(`AI_TRANSIENT: ${err instanceof Error ? err.message : String(err)}`, { cause: err });
    }
  }
  throw new Error("unreachable");
}

/**
 * One usage row (and one log line) per model call, attributed to the ambient job and kind.
 * A cache hit records a row with zero tokens so the hit rate is visible next to the spend.
 * Fire-and-forget: the answer is already in hand, and losing one accounting row beats
 * failing the extraction that produced it.
 */
export function recordUsage(model: string, usage: Usage | undefined, opts: { cacheHit?: boolean; kind?: string } = {}): void {
  const ctx = getLlmContext();
  const row: realStore.UsageRow = {
    job_id: ctx?.jobId ?? null,
    kind: opts.kind ?? ctx?.kind ?? "unknown",
    model,
    prompt_tokens: usage?.promptTokenCount ?? 0,
    output_tokens: usage?.candidatesTokenCount ?? 0,
    cached_tokens: usage?.cachedContentTokenCount ?? 0,
    cache_hit: opts.cacheHit ?? false,
  };
  logger.info("llm usage", { ...row });
  _llmDeps.store.insertUsage(row).catch((err) => logger.warn("Failed to record LLM usage", { err: String(err) }));
}

// ── Result cache ──

/** Env kill-switch for a brand-new cache in a production pipeline: LLM_RESULT_CACHE=0. */
const CACHE_ENABLED = process.env.LLM_RESULT_CACHE !== "0";

/**
 * The cache key. The prompt already embeds the page, the guidance notes, the site intel and
 * the memory addendum, so hashing the full input needs no version constant: change any of
 * them and the key moves by itself. The model id is in the key so switching GEMINI_MODEL
 * never serves the old model's answers as the new model's.
 */
export function inputHash(modelId: string, system: string, prompt: string): string {
  return createHash("sha256").update(modelId).update("\0").update(system).update("\0").update(prompt).digest("hex");
}

/**
 * Only a clean, complete answer is worth remembering. A repaired-JSON answer parsed, but the
 * model didn't say that; a MAX_TOKENS answer is missing its tail. Either one cached would
 * be sticky-wrong for that input forever.
 */
export function shouldCache(value: unknown, truncated: boolean, via: string): boolean {
  return value !== null && !truncated && via === "direct";
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
  /** Skip the result cache for this call (and don't store its answer). The admin
   *  "re-extract" action uses it to overwrite a sticky bad answer. */
  noCache?: boolean;
}): Promise<T> {
  const modelId = opts.model
    ?? (opts.tier === "lite" && config.GEMINI_MODEL_LITE ? config.GEMINI_MODEL_LITE : config.GEMINI_MODEL);
  const useCache = CACHE_ENABLED && !opts.noCache;
  const hash = useCache ? inputHash(modelId, opts.system, opts.prompt) : null;

  if (hash) {
    // A lookup failure is a miss, never an error — the model is still there to ask.
    const cached = await _llmDeps.store.findCached(hash).catch((err) => {
      logger.warn("LLM cache lookup failed — treating as miss", { err: String(err) });
      return undefined;
    });
    if (cached !== undefined) {
      recordUsage(modelId, undefined, { cacheHit: true });
      _llmDeps.store.bumpCacheHit(hash).catch(() => { /* counter only */ });
      return cached as T;
    }
  }

  let generated: Generated;
  try {
    generated = await _llmDeps.generate(modelId, opts.system, opts.prompt, opts.maxTokens ?? 16384, true);
  } catch (geminiErr) {
    if (isORConfigured()) {
      // Not cached and not metered: a different model's answer under this model's key would
      // be wrong, and orExtractJson reports no usage. Rare path; the log line is the record.
      // The reason matters: a 403 "dunning decision is deny" is a suspended billing account, and
      // every extraction then silently runs on the fallback model until someone notices.
      logger.warn("Gemini extractJson failed — falling back to OpenRouter", { model: modelId, err: String((geminiErr as Error)?.message ?? geminiErr).slice(0, 300) });
      return orExtractJson<T>({ system: opts.system, prompt: opts.prompt, maxTokens: opts.maxTokens });
    }
    throw geminiErr;
  }
  recordUsage(modelId, generated.usage);

  const { value, via } = parseModelJson<T>(generated.text);
  if (value === null) {
    logger.error("LLM returned invalid JSON", { raw: generated.text.slice(0, 500), truncated: generated.truncated, length: generated.text.length });
    throw new Error("LLM returned invalid JSON");
  }
  if (via !== "direct") logger.warn("Repaired LLM JSON", { via, truncated: generated.truncated, length: generated.text.length });

  if (hash && shouldCache(value, generated.truncated, via)) {
    _llmDeps.store.saveCached({
      input_hash: hash,
      model: modelId,
      result: value,
      job_id: getLlmContext()?.jobId ?? null,
      prompt_tokens: generated.usage?.promptTokenCount ?? 0,
      output_tokens: generated.usage?.candidatesTokenCount ?? 0,
    }).catch((err) => logger.warn("Failed to store LLM cache row", { err: String(err) }));
  }
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
  const modelId = opts.model ?? config.GEMINI_MODEL;
  try {
    const generated = await _llmDeps.generate(modelId, opts.system, opts.prompt, opts.maxTokens ?? 2048, false);
    recordUsage(modelId, generated.usage);
    return generated.text;
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
