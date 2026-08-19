// Qualification.
//
// Credits are a separate feature now, so this module does NOT touch the credit ledger. A referral still
// runs its whole loop and records that it earned a reward — the payout is linked in later.
//
// Layering is unchanged: the two entry points own the BUSINESS RULES (what qualified, and which business
// did it); attemptQualify owns only the claim MECHANIC. That is what keeps the Phase 3 velocity cap, and
// the eventual payout step, a change in one place.

import { masterKnex } from "../../../core/db/master-pool.js";
import { createChildLogger } from "../../../shared/logger.js";
import { REFERRAL_CONFIG, type ReferralActionType } from "../consts.js";
import * as repo from "../repositories/referrals.repository.js";

const logger = createChildLogger("referral-qualification");

const DAY_MS = 24 * 60 * 60 * 1000;

/** Internal: a late qualification. Rolls the claim back so the row stays `signed_up`. */
class W2Elapsed extends Error {}

/**
 * Claim a `signed_up` referral and mark it qualified, atomically.
 *
 * CONCURRENCY: the transaction opens with a conditional UPDATE whose WHERE names the required source
 * state. Under Postgres READ COMMITTED, a concurrent UPDATE that blocks on the row lock RE-EVALUATES its
 * WHERE against the committed row version once the lock releases — so the loser sees state='qualified',
 * matches zero rows, and returns. The predicate IS the mutex: no advisory lock, no SELECT ... FOR UPDATE
 * preamble, no application-level "did I already do this?" read.
 *
 * Ten simultaneous qualification events therefore mark the referral exactly once. That mattered when this
 * also moved money, and it still matters: it is what will make the later payout step safe to attach here,
 * and what stops a referral being counted twice in the referrer's stats.
 *
 * Safe to call redundantly, from anywhere, any number of times.
 */
async function attemptQualify(
  referralId: number,
  actionType: ReferralActionType,
  qualifyingBusinessId: number | null,
): Promise<boolean> {
  try {
    return await masterKnex.transaction(async (trx) => {
      // qualified_at comes from the DATABASE clock, never a caller or a client: signed_up_at is
      // DB-stamped too, so W2 arithmetic cannot be skewed by app-server clocks and no route can
      // influence the window.
      const claimed = await trx("referrals")
        .where({ id: referralId, state: "signed_up" })
        .update({
          state: "qualified",
          action_type: actionType,
          qualifying_business_id: qualifyingBusinessId,
          qualified_at: trx.fn.now(),
          updated_at: trx.fn.now(),
        })
        .returning(["id", "referrer_type", "referrer_id", "signed_up_at", "qualified_at"]);

      if (claimed.length === 0) return false; // lost the race, or already settled — silent no-op

      const row = claimed[0] as {
        referrer_type: "user" | "business";
        referrer_id: number;
        signed_up_at: Date;
        qualified_at: Date;
      };

      // W2, enforced HERE against timestamps rather than against a stored `expired` label, so a delayed
      // expiry sweep can never widen the window. Both operands are absolute DB-generated instants
      // (timestamptz), so a fixed-day offset is exact and DST cannot shift the boundary.
      const deadline = new Date(row.signed_up_at.getTime() + REFERRAL_CONFIG.w2_days * DAY_MS);
      if (row.qualified_at > deadline) throw new W2Elapsed();

      logger.info("referral qualified", {
        referralId,
        actionType,
        // No ledger write: credits are a separate feature. The reward this earns is resolved from
        // action_type when payouts are linked in.
        ownerType: row.referrer_type,
        ownerId: row.referrer_id,
      });
      return true;
    });
  } catch (err) {
    if (err instanceof W2Elapsed) {
      // The claim rolled back, so the row is still `signed_up` and nothing is lost. A late qualification
      // simply never qualifies.
      logger.info("referral not qualified: W2 elapsed", { referralId, actionType });
      return false;
    }
    throw err;
  }
}

/**
 * The referred individual reached 100% profile completion.
 *
 * Called from the platform-users completion sync. Must NOT mutate any profile-completion input, or
 * qualify -> profile write -> syncCompletion -> qualify would form a pointless cycle.
 */
export async function onIndividualQualified(userId: number): Promise<void> {
  const referral = await repo.findReferralByReferred("user", userId);
  if (!referral || referral.state !== "signed_up") return;
  await attemptQualify(referral.id, "student_referral", null);
}

/**
 * A business owned by a referred user completed verification.
 *
 * Every precondition is re-verified here from a fresh read: a route is only one caller, and this must be
 * safe for all of them (a future admin bulk action, a backfill, a retry). The admin route passes an
 * integer id taken from the row it already loaded rather than its `:id` param, because that param is
 * validated as a UUID while businesses.id is an integer — a pre-existing mismatch this sidesteps.
 */
export async function onBusinessVerified(businessId: number): Promise<void> {
  const business = await masterKnex("businesses")
    .where({ id: businessId })
    .whereNull("deleted_at")
    .select("id", "owner_id", "status")
    .first<{ id: number; owner_id: number | null; status: string } | undefined>();

  if (!business) return;
  if (business.status !== "verified") return;
  if (!business.owner_id) return;

  // businesses.owner_id is the AUTHORITATIVE ownership link — not user_business_index, which is a
  // CASCADE-FK membership index holding many members per business. That table is used only for the
  // related-party block during attribution.
  const owner = await masterKnex("platform_users")
    .where({ id: business.owner_id })
    .whereNull("deleted_at")
    .select("id")
    .first();
  if (!owner) return;

  const referral = await repo.findReferralByReferred("user", business.owner_id);
  if (!referral || referral.state !== "signed_up") return;

  // The FIRST business a referred user gets verified within W2 is the one that qualifies. A second
  // verification finds state='qualified' and no-ops — no extra bookkeeping needed.
  await attemptQualify(referral.id, "business_referral", business.id);
}
