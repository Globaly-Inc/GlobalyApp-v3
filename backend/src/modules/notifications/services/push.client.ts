// The only place this module talks to a push provider (FCM) over the network.
//
// FAIL CLOSED, and for the same reason billing/services/stripe.client.ts and
// shared/ai/gemini.ts do: this deployment has no FCM credentials and no firebase
// SDK installed. A stub that reported success would put "sent" in
// notification_deliveries for a notification nobody received, and nothing
// downstream would ever find out. The honest answer is 503.
//
// WHAT WAS ALREADY DONE, AND IS NOT REDONE HERE
// Wave D3 already shipped the whole device-token REGISTRY — the `push_tokens` table
// (20260817_013), the upsert-on-token semantics, POST/DELETE
// /api/v3/notifications/push-tokens, and the push channel in the fan-out. This file
// adds only the missing half: the provider seam, so the fan-out's push branch has
// something to call when credentials do arrive, and so /push-check can answer 503
// rather than nothing at all.
//
// Plugging in the real provider is one function body — see createLiveClient().

import { config } from "../../../config.js";
import { AppError } from "../../../shared/errors.js";

export class PushUnavailableError extends AppError {
  constructor(message = "Push notifications are not configured") {
    super(message, 503, "PUSH_UNAVAILABLE");
  }
}

export interface PushMessage {
  title: string;
  body: string | null;
}

export interface PushSendResult {
  /** Devices the provider accepted. Never an assumed count. */
  sent: number;
  /** Tokens the provider rejected as dead, for pruning. */
  invalidTokens: string[];
}

export interface PushClient {
  send(tokens: string[], message: PushMessage): Promise<PushSendResult>;
}

/** True when the operator has supplied enough config for outbound FCM calls. */
export function isPushConfigured(): boolean {
  return Boolean(config.FCM_PROJECT_ID && config.FCM_SERVICE_ACCOUNT_JSON);
}

/**
 * Call before any database write or credit spend a failed send would strand.
 * Throws 503 — the request was fine, the deployment is not.
 */
export function assertPushConfigured(): void {
  if (!isPushConfigured()) throw new PushUnavailableError();
}

// ponytail: a module-level override is the whole test seam — no DI container for a
// single provider. Mirrors setStripeClient(). Nothing in src/ ever calls it.
let override: PushClient | null = null;

export function setPushClient(client: PushClient | null): void {
  override = client;
}

/**
 * Can a send actually be attempted right now? Credentials OR an injected client.
 *
 * Distinct from isPushConfigured() on purpose: the fan-out must not short-circuit
 * on "no credentials" when a test has injected a client, or the seam would be
 * unreachable from the one code path that matters.
 */
export function isPushAvailable(): boolean {
  return override !== null || isPushConfigured();
}

function createLiveClient(): PushClient {
  // firebase-admin is not a dependency of this project, so there is nothing to
  // construct. When it is added this becomes:
  //
  //   const app = initializeApp({ credential: cert(JSON.parse(config.FCM_SERVICE_ACCOUNT_JSON!)) });
  //   return { send: async (tokens, msg) => {
  //     const res = await getMessaging(app).sendEachForMulticast({ tokens, notification: {...} });
  //     return { sent: res.successCount, invalidTokens: /* tokens whose error is registration-token-not-registered */ };
  //   } };
  //
  // Until then the only honest answer is 503.
  throw new PushUnavailableError("Push SDK is not installed on this deployment");
}

/**
 * The client for the current send, or a 503. Call AFTER auth, validation and any
 * database work, so everything short of the network is still exercised offline.
 */
export function getPushClient(): PushClient {
  if (override) return override;
  assertPushConfigured();
  return createLiveClient();
}
