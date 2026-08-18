// The only seam between the counsellor and a model vendor.
//
// FAIL CLOSED, exactly as billing/services/stripe.client.ts does for Stripe. This
// environment is not guaranteed a GEMINI_API_KEY, so rather than stub an answer or
// open an SSE stream that never produces a token, `getAiProvider()` throws a 503.
// Routes run their auth, their zod parse, their session/db work and their credit
// gate first, then assert the provider before a single SSE byte is written — so an
// unconfigured platform returns an honest HTTP 503, never a fabricated reply and
// never a silent empty stream.
//
// `setAiProvider()` swaps in a deterministic stub, which is what makes every path
// here — including the mid-stream failure — testable with no network and no key.

import { AppError } from "../../../shared/errors.js";
import { config } from "../../../config.js";
import { geminiProvider } from "../lib/gemini-stream.js";

export class AiProviderUnavailableError extends AppError {
  constructor(message = "AI provider is not configured") {
    super(message, 503, "AI_PROVIDER_UNAVAILABLE");
  }
}

export interface StreamChatOpts {
  system: string;
  history: Array<{ role: "user" | "model"; parts: Array<{ text: string }> }>;
  userMessage: string;
  onChunk: (text: string) => void;
  signal?: AbortSignal;
}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface StreamChatResult {
  fullText: string;
  usage: TokenUsage;
}

export interface AiProvider {
  /** Recorded on every usage event. */
  readonly model: string;
  streamChat(opts: StreamChatOpts): Promise<StreamChatResult>;
  generateTitle(content: string): Promise<string>;
}

let override: AiProvider | null = null;

/** Tests inject a stub here; pass null to restore the live (or absent) provider. */
export function setAiProvider(provider: AiProvider | null): void {
  override = provider;
}

/** True when the operator has supplied enough config for outbound model calls. */
export function isProviderConfigured(): boolean {
  return override !== null || Boolean(config.GEMINI_API_KEY);
}

/** Call before writing SSE headers, so an unconfigured platform 503s cleanly. */
export function assertProviderConfigured(): void {
  if (!isProviderConfigured()) throw new AiProviderUnavailableError();
}

export function getAiProvider(): AiProvider {
  if (override) return override;
  if (!config.GEMINI_API_KEY) throw new AiProviderUnavailableError();
  return geminiProvider;
}
