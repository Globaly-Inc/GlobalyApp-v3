// Qualification and award.
//
// Layering: the two entry points own the BUSINESS RULES (what qualified, and which business paid
// out); attemptAward owns only the claim-and-credit MECHANIC. Keeping them apart is what makes the
// Phase 3 velocity cap a change in one place rather than a widening of a generic function.

import { masterKnex } from "../../../core/db/master-pool.js";
import { createChildLogger } from "../../../shared/logger.js";
import { addReferralReward } from "../../credits/credits.repository.js";
import { REFERRAL_CONFIG, REWARD_BY_ACTION, type ReferralActionType } from "../consts.js";
import * as repo from "../repositories/referrals.repository.js";

const logger = createChildLogger("referral-qualification");

const DAY_MS = 24 * 60 * 60 * 1000;

/** Internal: a late qualification. Rolls the claim back so the row stays `signed_up`. */
class W2Elapsed extends Error {}

/**
 * Claim a `signed_up` referral and credit the referrer, atomically.
 *
 * CONCURRENCY (INV-1): the transaction opens with a conditional UPDATE whose WHERE names the required
 * source state. Under Postgres READ COMMITTED, a concurrent UPDATE that blocks on the row lock
 * RE-EVALUATES its WHERE against the committed row version once the lock releases — so the loser sees
 * state='credited', matches zero rows, and returns. No advisory lock, no SELECT ... FOR UPDATE
 * preamble, and no application-level "did I already do this?" read: the predicate IS the mutex.
 *
 * Ten simultaneous qualification events therefore produce exactly ONE reward. Even if two claims
 * somehow both succeeded, credit_tx_one_referral_reward (INV-2) would abort the second transaction.
 *
 * Safe to call redundantly, from anywhere, any number of times — that is the whole point of INV-1.
 */
async function attemptAward(
  referralId: number,
  actionType: ReferralActionType,
  qualifyingBusinessId: number | null,
): Promise<boolean> {
  const amount = REWARD_BY_ACTION[actionType];

  try {
    return await masterKnex.transaction(async (trx) => {
      // 1. CLAIM. qualified_at/credited_at come from the DATABASE clock, never from a caller or a
      //    client: signed_up_at is DB-stamped too, so W2 arithmetic cannot be skewed by app-server
      //    clocks, and no route can influence the window.
      const claimed = await trx("referrals")
        .where({ id: referralId, state: "signed_up" })
        .update({
          state: "credited",
          action_type: actionType,
          qualifying_business_id: qualifyingBusinessId,
          qualified_at: trx.fn.now(),
          credited_at: trx.fn.now(),
          credits_awarded: amount,
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

      // 2. W2, enforced HERE in Phase 1 — against timestamps, not against a stored `expired` label.
      //    The Phase 2 sweep only MATERIALISES that label for display; if it never runs, no money
      //    moves incorrectly. Both operands are absolute DB-generated instants (timestamptz), so a
      //    fixed-day offset is exact and DST cannot shift the boundary.
      const deadline = new Date(row.signed_up_at.getTime() + REFERRAL_CONFIG.w2_days * DAY_MS);
      if (row.qualified_at > deadline) throw new W2Elapsed();

      // 3. Credit the REFERRER — never the invitee. The wallet is chosen by referrer_type, so a
      //    business referrer is credited to the BUSINESS ENTITY, not to the member who shared.
      const tx = await addReferralReward(trx, {
        owner_type: row.referrer_type,
        owner_id: row.referrer_id,
        amount,
        description: "Referral reward",
        referral_id: referralId,
      });

      await trx("referrals").where({ id: referralId }).update({ credit_transaction_id: tx.id });

      logger.info("referral credited", {
        referralId, actionType, amount,
        ownerType: row.referrer_type, ownerId: row.referrer_id,
      });
      return true;
    });
  } catch (err) {
    if (err instanceof W2Elapsed) {
      // The claim rolled back, so the row is still `signed_up` and nothing is lost. A late
      // qualification simply never credits.
      logger.info("referral not credited: W2 elapsed", { referralId, actionType });
      return false;
    }
    throw err;
  }
}

/**
 * The referred individual reached 100% profile completion.
 *
 * Called from the platform-users completion sync. Must NOT mutate any profile-completion input, or
 * award -> profile write -> syncCompletion -> award would form a pointless cycle (INV-1 would stop the
 * double payment, but the repeated work and the confusing stack are still wrong).
 */
export async function onIndividualQualified(userId: number): Promise<void> {
  const referral = await repo.findReferralByReferred("user", userId);
  if (!referral || referral.state !== "signed_up") return;
  await attemptAward(referral.id, "student_referral", null);
}

/**
 * A business owned by a referred user completed verification.
 *
 * Every precondition is re-verified here from a fresh read: a route is only one caller, and this must
 * be safe for all of them (a future admin bulk action, a backfill, a retry). The admin route passes an
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

  // businesses.owner_id is the AUTHORITATIVE ownership link for a payout — not user_business_index,
  // which is a CASCADE-FK membership index holding many members per business. That table is used only
  // for the related-party block during attribution, never to justify money.
  const owner = await masterKnex("platform_users")
    .where({ id: business.owner_id })
    .whereNull("deleted_at")
    .select("id")
    .first();
  if (!owner) return;

  const referral = await repo.findReferralByReferred("user", business.owner_id);
  if (!referral || referral.state !== "signed_up") return;

  // The FIRST business a referred user gets verified within W2 is the one that qualifies. A second
  // verification finds state='credited' and no-ops (INV-4) — no extra bookkeeping needed.
  await attemptAward(referral.id, "business_referral", business.id);
}
