// Machine-to-machine authentication for the GlobalyAI feed (§3.4).
//
// HOW THESE AUTHENTICATE. A pre-shared secret, per direction, carried in a header —
// which is what V1 did (export-courses: `Authorization: Bearer $GLOBALY_AI_SYNC_SECRET`;
// receive-institution-data: `x-webhook-secret: $WEBHOOK_INGEST_SECRET`) and the
// contract the other side is already written against, so it is kept. There is no JWT
// here on purpose: the caller is another service, not a user, so there is no subject,
// no tenant and no session to resolve.
//
// NEITHER SECRET EXISTS IN THIS ENVIRONMENT, and none is invented. An unset secret
// makes its endpoint answer 503 — not 200, and not "open because unconfigured".
// V1 got this half right: it checked `!SYNC_SECRET || token !== SYNC_SECRET` and
// returned 401, so an unconfigured deployment at least refused, but it reported the
// operator's missing configuration as the caller's bad credential. 503 says the
// true thing, and keeps 401 meaning "your token is wrong".
//
// Two secrets, not one: pulling the catalogue and pushing into staging are different
// privileges, and a partner allowed to read must not thereby be allowed to write.

import { createHash, timingSafeEqual } from "node:crypto";

import { config } from "../../../config.js";
import { AppError, UnauthorizedError } from "../../../shared/errors.js";

export class CrossAppNotConfiguredError extends AppError {
  constructor(message = "Cross-app sync is not configured") {
    super(message, 503, "CROSS_APP_NOT_CONFIGURED");
  }
}

/**
 * Constant-time secret comparison.
 *
 * Hashed first so both buffers are always 32 bytes: `timingSafeEqual` throws on a
 * length mismatch, and catching that throw is itself a length oracle.
 */
export function secretsMatch(presented: string | undefined, expected: string): boolean {
  if (!presented) return false;
  const a = createHash("sha256").update(presented).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

/** `Authorization: Bearer <token>` → token, or undefined. */
export function bearerToken(header: string | undefined): string | undefined {
  if (!header) return undefined;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match?.[1]?.trim() || undefined;
}

function assertSecret(configured: string | undefined, presented: string | undefined): void {
  if (!configured) throw new CrossAppNotConfiguredError();
  if (!secretsMatch(presented, configured)) throw new UnauthorizedError();
}

/** Outbound feed: GLOBALY_AI_SYNC_SECRET as a bearer token. */
export function assertExportAuthorized(headers: Record<string, unknown>): void {
  assertSecret(config.GLOBALY_AI_SYNC_SECRET, bearerToken(headers.authorization as string | undefined));
}

/** Inbound webhook: WEBHOOK_INGEST_SECRET in x-webhook-secret. */
export function assertIngestAuthorized(headers: Record<string, unknown>): void {
  const presented = headers["x-webhook-secret"];
  assertSecret(
    config.WEBHOOK_INGEST_SECRET,
    typeof presented === "string" ? presented : undefined,
  );
}
