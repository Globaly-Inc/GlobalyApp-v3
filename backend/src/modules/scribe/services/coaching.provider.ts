// The only door between scribe and the text model used for live coaching, the
// post-session review, and translation.
//
// FAIL CLOSED. A GEMINI_API_KEY may exist in a real deployment, but the tests
// must never depend on one — tests/setup/db-url.ts pins it empty on purpose so
// the 503 assertions keep their meaning. So this seam is injectable and nothing
// here ever reads process.env directly.
//
// ORDERING RULE, inherited from ai-knowledge/lib/embedding-provider.ts: the
// caller does every read, every guard, every ownership and consent check, and
// every credit pre-flight BEFORE asking for a provider. An unconfigured platform
// therefore answers 503 with the transcript intact and nothing charged.
//
// PARSING: V1's scribe-coaching stripped ```json fences and scribe-review did
// not, so a fenced response cost a paid generation and returned
// 500 "Failed to parse AI response". Fence stripping lives here, once, for every
// caller (defect D-E3-4).

import { AppError } from "../../../shared/errors.js";
import { config } from "../../../config.js";
import { generateText } from "../../../shared/ai/gemini.js";

export class ScribeAiUnavailableError extends AppError {
  constructor(message = "Scribe AI provider is not configured") {
    super(message, 503, "SCRIBE_AI_UNAVAILABLE");
  }
}

export interface GenerateJsonOpts {
  system: string;
  prompt: string;
  maxTokens?: number;
  temperature?: number;
}

export interface ScribeAiProvider {
  /** Recorded on the ledger entry so a model change is traceable. */
  readonly model: string;
  /** Raw model text. Callers get parsed JSON via `generateJson` below. */
  generate(opts: GenerateJsonOpts): Promise<string>;
}

let override: ScribeAiProvider | null = null;

/** Tests inject a deterministic stub; pass null to restore the real lookup. */
export function setScribeAiProvider(provider: ScribeAiProvider | null): void {
  override = provider;
}

export function isScribeAiConfigured(): boolean {
  return override !== null || Boolean(config.GEMINI_API_KEY);
}

export function assertScribeAiConfigured(): void {
  if (!isScribeAiConfigured()) throw new ScribeAiUnavailableError();
}

const liveProvider: ScribeAiProvider = {
  get model() {
    return config.GEMINI_MODEL;
  },
  generate: (opts) => generateText(opts),
};

export function getScribeAiProvider(): ScribeAiProvider {
  if (override) return override;
  if (!config.GEMINI_API_KEY) throw new ScribeAiUnavailableError();
  return liveProvider;
}

/** ```json … ``` and bare ``` … ``` both. See the header. */
export function stripCodeFence(raw: string): string {
  return raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
}

export class ScribeAiResponseError extends AppError {
  constructor(message = "The model returned an unusable response") {
    super(message, 502, "SCRIBE_AI_BAD_RESPONSE");
  }
}

/**
 * One generation, parsed as JSON. A response that will not parse is a 502 —
 * V1's scribe-coaching instead served a hard-coded `"Analyzing session..."`
 * object AND charged for it, so the counsellor paid for a fabricated result they
 * could not distinguish from a real one (defect D-E3-3). Nothing is charged on
 * this path: the caller settles only after this returns.
 */
export async function generateJson<T>(
  provider: ScribeAiProvider,
  opts: GenerateJsonOpts,
): Promise<T> {
  const raw = await provider.generate(opts);
  try {
    return JSON.parse(stripCodeFence(raw)) as T;
  } catch {
    throw new ScribeAiResponseError();
  }
}
