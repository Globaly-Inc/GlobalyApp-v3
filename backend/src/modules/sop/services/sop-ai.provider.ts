// The only door between the SOP generator and a model vendor.
//
// FAIL CLOSED. A GEMINI_API_KEY may exist in a real deployment, but the tests must
// never depend on one — tests/setup/db-url.ts pins it empty on purpose so the 503
// assertions keep their meaning. So this seam is injectable and nothing here reads
// process.env directly.
//
// ORDERING RULE, inherited from superadmin/ai-knowledge/lib/embedding-provider.ts and
// followed by scribe's coaching.provider.ts: the caller does every read, every
// ownership check, every database write it can, and the credit pre-flight BEFORE
// asking for a provider. An unconfigured platform therefore answers 503 with the
// questionnaire intact, the session honestly marked `pending_provider`, an audit row
// written, and nothing charged.
//
// V1 got this backwards: `resolveAIProvider()` ran before the session was touched and
// threw a plain Error, which its outer catch turned into **HTTP 500** carrying the raw
// internal message "Neither LOVABLE_API_KEY nor GEMINI_API_KEY is configured" straight
// to the browser (defect D-E5-2). §1.6 specifies 503, and an operator's key-management
// state is not a client's business.

import { AppError } from "../../../shared/errors.js";
import { config } from "../../../config.js";
import { generateText } from "../../../shared/ai/gemini.js";
import { estimateTokens } from "../../ai-counsellor/consts.js";

export class SopAiUnavailableError extends AppError {
  constructor(message = "SOP generation is not available on this deployment") {
    super(message, 503, "SOP_AI_UNAVAILABLE");
  }
}

/**
 * A model that failed, timed out, or answered with nothing usable.
 *
 * 502, never a stub. V1's scribe-coaching sibling returned a hard-coded
 * `"Analyzing session..."` object on a parse failure AND charged for it, so the caller
 * paid for a fabricated result they could not tell from a real one (defect D-E3-3).
 * A student's statement of purpose is the last thing that should ever be invented.
 */
export class SopAiResponseError extends AppError {
  constructor(message = "The model returned an unusable draft") {
    super(message, 502, "SOP_AI_BAD_RESPONSE");
  }
}

export interface SopGenerateOpts {
  system: string;
  prompt: string;
  maxTokens?: number;
  temperature?: number;
}

export interface SopTokenUsage {
  promptTokens: number;
  completionTokens: number;
}

export interface SopGenerateResult {
  text: string;
  usage: SopTokenUsage;
}

export interface SopAiProvider {
  /** Recorded on the usage event so a model change stays traceable. */
  readonly model: string;
  generate(opts: SopGenerateOpts): Promise<SopGenerateResult>;
}

let override: SopAiProvider | null = null;

/** Tests inject a deterministic stub; pass null to restore the real lookup. */
export function setSopAiProvider(provider: SopAiProvider | null): void {
  override = provider;
}

export function isSopAiConfigured(): boolean {
  return override !== null || Boolean(config.GEMINI_API_KEY);
}

/** Call after every database write and after the credit gate. See the header. */
export function assertSopAiConfigured(): void {
  if (!isSopAiConfigured()) throw new SopAiUnavailableError();
}

/**
 * The live provider.
 *
 * `shared/ai/gemini.generateText` returns prose only, so token counts are estimated
 * over the prompt sent and the text delivered — the same ~4-chars-per-token
 * approximation ai-counsellor applies to a stream that died before the provider
 * reported figures. It can never invent tokens that were not in the exchange.
 */
const liveProvider: SopAiProvider = {
  get model() {
    return config.GEMINI_MODEL;
  },
  async generate(opts) {
    const text = await generateText(opts);
    return {
      text,
      usage: {
        promptTokens: estimateTokens(opts.system + opts.prompt),
        completionTokens: estimateTokens(text),
      },
    };
  },
};

export function getSopAiProvider(): SopAiProvider {
  if (override) return override;
  if (!config.GEMINI_API_KEY) throw new SopAiUnavailableError();
  return liveProvider;
}

/**
 * One generation, with both failure modes closed at the seam rather than at each
 * caller.
 *
 * A model that THROWS — a timeout, a refusal, a gateway 500 — is an upstream failure,
 * so it becomes a 502. Left as a bare Error it would reach the shared error handler as
 * an unrecognised throw and be reported as a 500, which says "this service is broken"
 * about someone else's outage. V1 did exactly that: every provider fault, including a
 * missing key, came back as 500 with the raw message attached.
 *
 * A model that returns WHITESPACE is also a failure, not an empty statement of purpose.
 * V1 would have written it to `content` (a NOT NULL column that '' satisfies) and
 * charged the student for it.
 */
export async function generateDraft(
  provider: SopAiProvider,
  opts: SopGenerateOpts,
): Promise<SopGenerateResult> {
  let result: SopGenerateResult;
  try {
    result = await provider.generate(opts);
  } catch (err) {
    // An AppError the provider raised on purpose (a 503, say) keeps its own status.
    if (err instanceof AppError) throw err;
    throw new SopAiResponseError();
  }
  const text = result.text?.trim() ?? "";
  if (!text) throw new SopAiResponseError();
  return { text, usage: result.usage };
}
