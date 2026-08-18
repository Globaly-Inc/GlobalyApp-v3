// Referral code generation — deliberately a PURE utility.
//
// No database, config, logger, Fastify or repository imports. This file is shared by the runtime
// (codes.service.issueCode) and by the 20260818_002_referrals migration's backfill, so there is one
// alphabet and one entropy definition. A migration that reached into the service layer would
// transitively pull in masterKnex + config + logger, and an unrelated refactor or a missing env var
// could then break a historical migration that has to stay runnable forever.

import { randomBytes } from "node:crypto";

/** Alphanumerics minus 0/1/O/I/L, so a code can be read aloud or retyped without ambiguity. */
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

export const CODE_LENGTH = 10;

// 31 symbols does NOT divide 256, so `byte % 31` would favour the first few letters. Rejecting
// bytes at or above the largest multiple of 31 (248) makes the remainder uniform.
const REJECT_AT = Math.floor(256 / ALPHABET.length) * ALPHABET.length; // 248

/**
 * ~8.2e14 keyspace (31^10) — enough that walking it is impractical, which is a security property
 * and not only a UX one (see the enumeration controls on GET /referrals/lookup/:code).
 */
export function generateReferralCode(): string {
  let out = "";
  while (out.length < CODE_LENGTH) {
    // Over-draw so the common case needs a single randomBytes call despite rejections.
    for (const byte of randomBytes(CODE_LENGTH)) {
      if (byte >= REJECT_AT) continue; // biased tail — discard
      out += ALPHABET[byte % ALPHABET.length];
      if (out.length === CODE_LENGTH) break;
    }
  }
  return out;
}
