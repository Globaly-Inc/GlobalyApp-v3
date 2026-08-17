// Stripe webhook signature verification.
//
// This is the real scheme, not a stand-in: HMAC-SHA256 over `${timestamp}.${body}`
// keyed by the endpoint's signing secret, compared timing-safely against the `v1`
// entries of the `Stripe-Signature` header, inside a replay window.
//
// It is implemented here rather than delegated to the `stripe` SDK because it is
// pure crypto with no network call — so the one security-critical piece of the
// integration stays testable with no keys and no package.

import { createHmac, timingSafeEqual } from "node:crypto";
import { SIGNATURE_TOLERANCE_SECONDS } from "../consts.js";

export class SignatureVerificationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SignatureVerificationError";
  }
}

interface ParsedHeader {
  timestamp: number;
  signatures: string[];
}

/** `t=1492774577,v1=abc...,v1=def...` -> { timestamp, signatures } */
export function parseSignatureHeader(header: string): ParsedHeader {
  let timestamp = Number.NaN;
  const signatures: string[] = [];

  for (const part of header.split(",")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (key === "t") timestamp = Number(value);
    else if (key === "v1") signatures.push(value);
  }

  if (!Number.isFinite(timestamp) || timestamp <= 0) {
    throw new SignatureVerificationError("Signature header is missing a valid timestamp");
  }
  if (signatures.length === 0) {
    throw new SignatureVerificationError("Signature header has no v1 signature");
  }
  return { timestamp, signatures };
}

export function computeSignature(payload: string, timestamp: number, secret: string): string {
  return createHmac("sha256", secret).update(`${timestamp}.${payload}`, "utf8").digest("hex");
}

function equalsConstantTime(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  // timingSafeEqual throws on length mismatch, which would itself leak length.
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

/**
 * Throws SignatureVerificationError unless `header` is a valid signature of
 * `rawBody` under `secret` and inside the replay window.
 */
export function verifySignature(
  rawBody: string | Buffer,
  header: string | undefined,
  secret: string,
  nowSeconds: number = Math.floor(Date.now() / 1000),
  toleranceSeconds: number = SIGNATURE_TOLERANCE_SECONDS,
): void {
  if (!header) throw new SignatureVerificationError("Missing Stripe-Signature header");

  const payload = typeof rawBody === "string" ? rawBody : rawBody.toString("utf8");
  const { timestamp, signatures } = parseSignatureHeader(header);

  if (Math.abs(nowSeconds - timestamp) > toleranceSeconds) {
    throw new SignatureVerificationError("Signature timestamp outside the tolerance window");
  }

  const expected = computeSignature(payload, timestamp, secret);
  if (!signatures.some((candidate) => equalsConstantTime(candidate, expected))) {
    throw new SignatureVerificationError("Signature does not match payload");
  }
}

/** Test/CLI helper: build the header Stripe would have sent for this payload. */
export function buildSignatureHeader(
  payload: string,
  secret: string,
  timestamp: number = Math.floor(Date.now() / 1000),
): string {
  return `t=${timestamp},v1=${computeSignature(payload, timestamp, secret)}`;
}
