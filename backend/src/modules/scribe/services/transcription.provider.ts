// The only door between scribe and a speech-to-text vendor.
//
// FAIL CLOSED, the same contract as billing/services/stripe.client.ts and
// ai-counsellor/services/provider.ts: this environment has NO transcription
// credential and one must not be invented, so `getTranscriptionProvider()`
// throws 503. There is deliberately no stub token and no offline mode — a fake
// ephemeral key is indistinguishable from a real one until the browser opens a
// WebSocket with it, at which point the failure surfaces in the wrong place with
// a live microphone running.
//
// Callers run auth, zod, the ownership check, the consent check and the session
// state check FIRST, and only then ask for a provider. So an unconfigured
// deployment exercises every guard and answers an honest 503 — and every
// transcript already saved stays saved (see session.service.stats, which reports
// the pending count rather than pretending the work happened).
//
// V1 SHAPE, for whoever wires the real key:
//   POST https://api.openai.com/v1/realtime/client_secrets with
//   { session: { type: "transcription", audio: { input: {
//       format: { type: "audio/pcm", rate: 24000 },
//       transcription: { model: "gpt-4o-transcribe" },
//       turn_detection: { type: "server_vad", threshold: 0.5,
//                         prefix_padding_ms: 300, silence_duration_ms: 500 } } } } }
//   credential OPENAI_API_KEY, response unwrapped as
//   `json.value ?? json.client_secret.value`.
//   V1 sent no language hint on purpose: an English prompt makes the model
//   transcribe non-English audio as phonetic English.

import { AppError } from "../../../shared/errors.js";
import { config } from "../../../config.js";

export class TranscriptionUnavailableError extends AppError {
  constructor(message = "Transcription provider is not configured") {
    super(message, 503, "TRANSCRIPTION_UNAVAILABLE");
  }
}

export interface EphemeralToken {
  token: string;
  /** Epoch seconds. V1's frontend threw this away and then could not refresh. */
  expires_at: number | null;
  model: string;
}

export interface TranscriptionProvider {
  readonly model: string;
  mintEphemeralToken(): Promise<EphemeralToken>;
}

let override: TranscriptionProvider | null = null;

/** Tests inject a deterministic stub; pass null to restore the real lookup. */
export function setTranscriptionProvider(provider: TranscriptionProvider | null): void {
  override = provider;
}

export function isTranscriptionConfigured(): boolean {
  return override !== null || Boolean(config.OPENAI_API_KEY);
}

/** Call after all DB work, before anything that assumes a token exists. */
export function assertTranscriptionConfigured(): void {
  if (!isTranscriptionConfigured()) throw new TranscriptionUnavailableError();
}

export function getTranscriptionProvider(): TranscriptionProvider {
  if (override) return override;
  // No live implementation ships here: there is no credential in this
  // environment, and a provider written against an untestable key is worse than
  // an honest 503. The V1 request shape above is the whole port.
  throw new TranscriptionUnavailableError();
}
