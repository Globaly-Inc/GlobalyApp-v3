// Webhook signature verification. No database, no keys, no network — the whole
// point of implementing Stripe's scheme in-house instead of behind the SDK.

import { describe, expect, it } from "vitest";
import {
  buildSignatureHeader,
  computeSignature,
  parseSignatureHeader,
  SignatureVerificationError,
  verifySignature,
} from "../../src/modules/billing/services/stripe.signature.js";

const SECRET = "whsec_test_secret";
const NOW = 1_760_000_000;
const PAYLOAD = JSON.stringify({ id: "evt_1", type: "checkout.session.completed" });

describe("parseSignatureHeader", () => {
  it("extracts the timestamp and every v1 signature", () => {
    expect(parseSignatureHeader("t=123,v1=aaa,v0=zzz,v1=bbb")).toEqual({
      timestamp: 123,
      signatures: ["aaa", "bbb"],
    });
  });

  it("rejects a header with no timestamp", () => {
    expect(() => parseSignatureHeader("v1=aaa")).toThrow(SignatureVerificationError);
  });

  it("rejects a header with no v1 signature", () => {
    expect(() => parseSignatureHeader("t=123,v0=aaa")).toThrow(SignatureVerificationError);
  });

  it("rejects a non-numeric timestamp", () => {
    expect(() => parseSignatureHeader("t=soon,v1=aaa")).toThrow(SignatureVerificationError);
  });
});

describe("verifySignature", () => {
  const header = buildSignatureHeader(PAYLOAD, SECRET, NOW);

  it("accepts a genuine signature", () => {
    expect(() => verifySignature(PAYLOAD, header, SECRET, NOW)).not.toThrow();
  });

  it("accepts the payload as a Buffer, byte for byte", () => {
    expect(() => verifySignature(Buffer.from(PAYLOAD, "utf8"), header, SECRET, NOW)).not.toThrow();
  });

  it("rejects a tampered payload", () => {
    const tampered = JSON.stringify({ id: "evt_1", type: "checkout.session.completed", extra: 1 });
    expect(() => verifySignature(tampered, header, SECRET, NOW)).toThrow(/does not match/);
  });

  it("rejects a single flipped byte", () => {
    const tampered = PAYLOAD.replace("evt_1", "evt_2");
    expect(tampered).not.toBe(PAYLOAD);
    expect(() => verifySignature(tampered, header, SECRET, NOW)).toThrow(SignatureVerificationError);
  });

  it("rejects a signature made with a different secret", () => {
    const forged = buildSignatureHeader(PAYLOAD, "whsec_attacker", NOW);
    expect(() => verifySignature(PAYLOAD, forged, SECRET, NOW)).toThrow(/does not match/);
  });

  it("rejects a replay outside the tolerance window", () => {
    const stale = buildSignatureHeader(PAYLOAD, SECRET, NOW - 3600);
    expect(() => verifySignature(PAYLOAD, stale, SECRET, NOW)).toThrow(/tolerance window/);
  });

  it("accepts a signature inside the tolerance window", () => {
    const recent = buildSignatureHeader(PAYLOAD, SECRET, NOW - 60);
    expect(() => verifySignature(PAYLOAD, recent, SECRET, NOW)).not.toThrow();
  });

  it("rejects a missing header", () => {
    expect(() => verifySignature(PAYLOAD, undefined, SECRET, NOW)).toThrow(/Missing Stripe-Signature/);
  });

  it("rejects a truncated signature rather than crashing on the length mismatch", () => {
    const truncated = `t=${NOW},v1=${computeSignature(PAYLOAD, NOW, SECRET).slice(0, 10)}`;
    expect(() => verifySignature(PAYLOAD, truncated, SECRET, NOW)).toThrow(/does not match/);
  });

  it("binds the signature to the timestamp, not just the body", () => {
    // Same digest, different claimed timestamp — must not validate.
    const digest = computeSignature(PAYLOAD, NOW, SECRET);
    expect(() => verifySignature(PAYLOAD, `t=${NOW + 1},v1=${digest}`, SECRET, NOW)).toThrow(
      /does not match/,
    );
  });
});
