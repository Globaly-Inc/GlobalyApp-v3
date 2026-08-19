// Referral code issuance and lookup.
//
// INV-10: every live platform_user / business CONVERGES to exactly one code. At-most-one is a DB
// constraint (referral_codes_owner_unique); at-least-one is EVENTUAL — issueCode never throws, so a
// registration can legitimately complete with no code until the reconciliation worker
// (workers/backfill-referral-codes.worker.ts) repairs it. No product surface ever creates a code.

import { masterKnex } from "../../../core/db/master-pool.js";
import { createChildLogger } from "../../../shared/logger.js";
import { CONSTRAINTS, PG_UNIQUE_VIOLATION, type ReferralOwnerType } from "../consts.js";
import * as repo from "../repositories/referrals.repository.js";
import { generateReferralCode } from "../utils/generate-referral-code.js";

const logger = createChildLogger("referral-codes");

const MAX_CODE_ATTEMPTS = 3;

/**
 * Issue a code for an entity. Idempotent, and **never throws** — callers are registration paths, and
 * INV-7 says a referral concern must never endanger account creation.
 *
 * Returns the code on success, or null when issuance failed and the worker must repair it.
 */
export async function issueCode(ownerType: ReferralOwnerType, ownerId: number): Promise<string | null> {
  for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt++) {
    try {
      const inserted = await repo.insertCode(ownerType, ownerId, generateReferralCode());
      if (inserted) return inserted.code;

      // DO NOTHING fired: this owner already has a code (backfill, or a concurrent writer won the
      // race). Not an error — read it back and return it.
      const existing = await repo.findCodeByOwner(ownerType, ownerId);
      if (existing) return existing.code;

      // Neither inserted nor found: something else deleted it between the two statements, which
      // should be impossible since codes are never deleted. Retry rather than guess.
      continue;
    } catch (err: unknown) {
      const e = err as { code?: string; constraint?: string; message?: string };

      // Two DIFFERENT unique constraints live on this table, and 23505 alone is ambiguous.
      // Retrying with a fresh code fixes a code collision, is pointless for an owner conflict, and
      // is actively wrong for anything else — so branch on the constraint name, never the message.
      if (e.code === PG_UNIQUE_VIOLATION && e.constraint === CONSTRAINTS.codeLowerUnique) {
        continue; // ~8.2e14 keyspace, so this is vanishingly rare — but it is the retryable case
      }

      if (e.code === PG_UNIQUE_VIOLATION && e.constraint === CONSTRAINTS.codeOwnerUnique) {
        const existing = await repo.findCodeByOwner(ownerType, ownerId);
        if (existing) return existing.code;
      }

      // Not a collision: a real fault (connection loss, permissions, schema drift). Do not retry.
      logger.error("referral code issuance failed", {
        ownerType, ownerId, constraint: e.constraint, code: e.code, err: e.message,
      });
      return null;
    }
  }

  // Structured and alertable: this is the signal that the reconciliation worker has work to do.
  logger.error("referral code issuance failed", {
    ownerType, ownerId, reason: `${MAX_CODE_ATTEMPTS} code collisions`,
  });
  return null;
}

/** The public-facing owner of a code, or null when the code is unknown OR unusable. */
export interface CodeOwner {
  code_id: number;
  owner_type: ReferralOwnerType;
  owner_id: number;
  /**
   * Full name for an individual, business name for a business — and nothing else, ever.
   *
   * A product decision: showing the person who actually invited you converts better than a bare first
   * name. It does mean a successful code guess reveals a full name rather than a first name, so the
   * controls that bound that are load-bearing rather than nice-to-have: a 31^10 keyspace, the 20/min
   * per-route rate limit, and a byte-identical 404 for unknown and unusable codes alike.
   */
  display_name: string;
}

/**
 * Resolve a human-readable code to its owner, for the public /join lookup.
 *
 * A HISTORICAL code is not a PUBLICLY USABLE code: the referral_codes row is retained forever so past
 * attributions stay resolvable (INV-5), but an inactive owner resolves to null here so /join cannot
 * announce someone's name after their account was deleted. materialiseReferral applies the same
 * liveness rule, so the two paths cannot disagree.
 */
export async function resolveUsableCode(code: string): Promise<CodeOwner | null> {
  const row = await repo.findCodeByCode(code);
  if (!row) return null;
  return resolveUsableCodeOwner(row.id, row.owner_type, row.owner_id);
}

/** Same liveness rules, entered from an already-known code id (the attribution path). */
export async function resolveUsableCodeOwner(
  codeId: number,
  ownerType: ReferralOwnerType,
  ownerId: number,
): Promise<CodeOwner | null> {
  if (ownerType === "user") {
    const user = await masterKnex("platform_users")
      .where({ id: ownerId })
      .whereNull("deleted_at")
      .where("account_status", 1) // never-activated accounts cannot refer
      .select("first_name", "last_name")
      .first<{ first_name: string; last_name: string | null } | undefined>();
    if (!user) return null;
    // Name ONLY — never email, phone, photo, institution, country, or any id. The two columns are
    // selected explicitly rather than spreading the row, so a future column cannot leak through here.
    const displayName = [user.first_name, user.last_name].filter(Boolean).join(" ").trim();
    return { code_id: codeId, owner_type: ownerType, owner_id: ownerId, display_name: displayName };
  }

  const business = await masterKnex("businesses")
    .where({ id: ownerId })
    .whereNull("deleted_at")
    .where("account_status", 1)
    .select("business_name")
    .first<{ business_name: string } | undefined>();
  if (!business) return null;
  // Business display name is already public on the business profile — no additional exposure.
  return { code_id: codeId, owner_type: ownerType, owner_id: ownerId, display_name: business.business_name };
}
