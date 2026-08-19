// Attribution — turning a shared link into a referral row.
//
// V3 sign-up is TWO steps, and that shapes everything here:
//
//   POST /auth/register    -> platform_users row, account_status = 0   (NOT an account yet)
//   POST /auth/verify-otp  -> account_status = 1                       (the account now exists)
//
// So registration only STORES a validated intent (platform_users.meta.pending_referral) and first
// activation MATERIALISES the referral. Recording at register would create referrals for abandoned
// registrations that never activate, permanently consuming the referrals_referred_unique slot and
// showing referrers pending rows for people who never existed.

import jwt from "jsonwebtoken";
import { config } from "../../../config.js";
import { masterKnex } from "../../../core/db/master-pool.js";
import { createChildLogger } from "../../../shared/logger.js";
import { CONSTRAINTS, PG_UNIQUE_VIOLATION, REFERRAL_CONFIG, type ReferralOwnerType } from "../consts.js";
import * as repo from "../repositories/referrals.repository.js";
import { resolveUsableCodeOwner } from "./codes.service.js";

const logger = createChildLogger("referral-attribution");

/** What the signed ref_token carries. `rcid` is referral_codes.id — never the human-readable code. */
interface RefTokenPayload {
  rcid: number;
  rtype: ReferralOwnerType;
  rid: number;
}

/** What registration stashes on the user for activation to pick up. */
export interface PendingReferral {
  rcid: number;
  rtype: ReferralOwnerType;
  rid: number;
  /** The token's own exp. Stored for forensics and admin display ONLY — never re-checked as a gate. */
  token_expires_at: string;
  registered_at: string;
}

/**
 * Mint the W1 capability token handed to an anonymous visitor at /join.
 *
 * The token carries the IMMUTABLE referral_codes.id, so if code lookup, formatting, or case-handling
 * ever changes, already-recorded referrals are untouched (INV-5). Its `exp` IS W1.
 */
export function mintRefToken(codeId: number, ownerType: ReferralOwnerType, ownerId: number): string {
  const payload: RefTokenPayload = { rcid: codeId, rtype: ownerType, rid: ownerId };
  return jwt.sign(payload, config.JWT_SECRET as jwt.Secret, {
    expiresIn: `${REFERRAL_CONFIG.w1_days}d`,
  });
}

/**
 * Validate a ref_token at registration. Pure: jwt.verify plus a shape check, no database, and it
 * NEVER throws — a referral must not be able to fail a registration (INV-7).
 *
 * Returns null for a bad signature, a malformed payload, or an expired token. An expired token IS a
 * lapsed W1: this single check is the whole of W1 enforcement, and nothing re-evaluates it later.
 */
export function validateRefToken(token: string | undefined | null): PendingReferral | null {
  if (!token) return null;
  try {
    const decoded = jwt.verify(token, config.JWT_SECRET as jwt.Secret) as Record<string, unknown>;

    // The referral token shares JWT_SECRET with access tokens, so it must not be possible to present
    // one as the other. An access token always carries sub+type; a ref token never does.
    if ("sub" in decoded || "type" in decoded) return null;

    const { rcid, rtype, rid, exp } = decoded as Partial<RefTokenPayload> & { exp?: number };
    if (typeof rcid !== "number" || typeof rid !== "number") return null;
    if (rtype !== "user" && rtype !== "business") return null;

    return {
      rcid,
      rtype,
      rid,
      token_expires_at: exp ? new Date(exp * 1000).toISOString() : "",
      registered_at: new Date().toISOString(),
    };
  } catch {
    return null; // expired, tampered, or forged — all mean "no attribution", never an error
  }
}

type Evaluation =
  | { ok: true; codeId: number; referrerType: ReferralOwnerType; referrerId: number }
  | { ok: false; reason: string };

/**
 * Decide whether a pending referral may become a referral. Read-only and deliberately OUTSIDE any
 * transaction: every rejection here is terminal, so it must be able to consume the token without a
 * rollback undoing that. The authoritative protection against a concurrent duplicate is the
 * referrals_referred_unique constraint, not read-time serialisation.
 */
async function evaluate(pending: PendingReferral, userId: number): Promise<Evaluation> {
  const code = await repo.findCodeById(pending.rcid);
  if (!code) return { ok: false, reason: "code_not_found" };

  // The DB always wins over the token. A payload disagreeing with the row is not trustworthy input.
  if (code.owner_type !== pending.rtype || code.owner_id !== pending.rid) {
    return { ok: false, reason: "token_claims_mismatch" };
  }

  // Same liveness rule as the public lookup, so the two paths cannot disagree.
  const owner = await resolveUsableCodeOwner(code.id, code.owner_type, code.owner_id);
  if (!owner) return { ok: false, reason: "referrer_inactive" };

  // Self-referral. The user is never accused of anything and sees no error.
  if (code.owner_type === "user" && code.owner_id === userId) {
    return { ok: false, reason: "self_referral" };
  }

  // Related-party: a business cannot earn off its own staff.
  //
  // In Phase 1 the referred party is ALWAYS a user, so this is the only related-party case that can
  // arise — an individual referring their own employer's business entity is not expressible, because
  // a business is never a referred entity. Any LIVE membership blocks, regardless of role/is_owner;
  // a former member (deleted_at set) is a genuine outside person and is allowed.
  if (code.owner_type === "business") {
    const member = await masterKnex("user_business_index")
      .where({ platform_user_id: userId, business_id: code.owner_id })
      .whereNull("deleted_at")
      .select("id")
      .first();
    if (member) return { ok: false, reason: "related_party" };
  }

  return { ok: true, codeId: code.id, referrerType: code.owner_type, referrerId: code.owner_id };
}

async function clearPending(userId: number): Promise<void> {
  await masterKnex("platform_users")
    .where({ id: userId })
    .update({ meta: masterKnex.raw("meta - 'pending_referral'"), updated_at: masterKnex.fn.now() });
}

/**
 * Materialise a pending referral into a referrals row. Safe and cheap to call after EVERY successful
 * OTP verification.
 *
 * There is deliberately NO isFirstActivation gate. An earlier design only ran this while
 * account_status was still 0, which meant a transient failure retained the token forever with nothing
 * left to consume it — the referral was silently lost. verify-otp being the shared login endpoint is
 * precisely what makes every later sign-in a free retry.
 *
 * FAILURE CONTRACT — which outcomes consume the token:
 *   consumed : nothing pending, unknown/mismatched code, inactive referrer, self-referral,
 *              related-party, already attributed (23505 on referrals_referred_unique)
 *   RETAINED : anything else (connection loss, deadlock, timeout) — the write transaction rolls back
 *              and a later login retries
 *
 * Only that one specific unique violation is caught. A blanket try/catch would silently discard
 * attributions on a transient database blip.
 */
export async function materialiseReferral(userId: number): Promise<void> {
  // Fast path for the overwhelmingly common case — a normal login with nothing pending. One indexed
  // read, no transaction.
  const user = await masterKnex("platform_users")
    .where({ id: userId })
    .select("meta")
    .first<{ meta: Record<string, unknown> | null } | undefined>();

  const pending = user?.meta?.pending_referral as PendingReferral | undefined;
  if (!pending) return;

  const verdict = await evaluate(pending, userId);

  if (!verdict.ok) {
    // Terminal: consume the token so this is never retried.
    await clearPending(userId);
    logger.info("referral not attributed", { userId, reason: verdict.reason });
    return;
  }

  try {
    await masterKnex.transaction(async (trx) => {
      // Clear and insert together: either this user is attributed and the token is spent, or neither
      // happened and a later login retries.
      await trx("platform_users")
        .where({ id: userId })
        .update({ meta: trx.raw("meta - 'pending_referral'"), updated_at: trx.fn.now() });

      await repo.insertReferral(trx, {
        referral_code_id: verdict.codeId,
        referrer_type: verdict.referrerType,
        referrer_id: verdict.referrerId,
        referred_type: "user",
        referred_id: userId,
      });
    });

    logger.info("referral attributed", {
      userId, referrerType: verdict.referrerType, referrerId: verdict.referrerId,
    });
  } catch (err: unknown) {
    const e = err as { code?: string; constraint?: string };

    // Already attributed: this user has their one referral (INV-3). Retrying can never succeed, so
    // it is terminal — and because the transaction rolled back, the token must be cleared separately.
    if (e.code === PG_UNIQUE_VIOLATION && e.constraint === CONSTRAINTS.referredUnique) {
      await clearPending(userId);
      logger.info("referral not attributed", { userId, reason: "already_attributed" });
      return;
    }

    // Transient. pending_referral survived the rollback, so a later login retries. Rethrow so the
    // caller logs it — the caller must never surface it to the user.
    throw err;
  }
}
