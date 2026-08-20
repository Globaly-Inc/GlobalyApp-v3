// Distributions service — the business's side of an enquiry: list its inbox, unlock
// a lead (paywall), and close one with a reason.
//
// Listing is sourced from the business's own tenant `business_enquiries` table
// (synced by tenant-sync.service.ts). Unlock and close write the central
// `enquiry_distributions` row and then mirror the new status onto that tenant row,
// because the listing is what reads it.

import type { Knex } from "knex";
import { masterKnex } from "../../../core/db/master-pool.js";
import { BadRequestError, ConflictError, NotFoundError, PaymentRequiredError } from "../../../shared/errors.js";
import { logEnquiryAudit } from "../shared/audit.js";
import * as distributionsRepo from "../repositories/distributions.repository.js";
import * as creditsService from "./credits.service.js";
import * as messagesService from "./messages.service.js";
import { syncStatusToTenant } from "./tenant-sync.service.js";

export async function listForBusiness(
  db: Knex,
  filters: { status?: string; limit?: number; offset?: number },
) {
  return distributionsRepo.listForBusinessFromTenant(db, filters);
}

/** One shared pool, so this takes no business — see credits.service.ts. */
export function getCreditBalance() {
  return { balance: creditsService.getBalance(), unlock_cost: creditsService.UNLOCK_COST };
}

/**
 * Pay to reveal the student's contact details (PRD §5 "Unlock").
 *
 * Check order is deliberate and load-bearing:
 *   1. already unlocked  -> idempotent success, never charged twice
 *   2. closed            -> conflict
 *   3. unlock cap hit    -> conflict, with NO deduction
 *   4. short on credits  -> 402
 * Credits are only spent once every gate passes, and refunded if the transaction
 * fails afterwards — the in-memory pool is not part of the DB transaction and so
 * cannot roll back with it.
 *
 * The cap is checked while holding a row lock on the parent enquiry, which is what
 * makes concurrent unlocks safe. The old system counted without a lock and could
 * exceed max_accepts (PRD §5, "known gaps").
 */
export async function unlock(businessId: number, distributionId: string, userId: number) {
  const cost = creditsService.UNLOCK_COST;
  let charged = false;

  try {
    const result = await masterKnex.transaction(async (trx) => {
      const distribution = await distributionsRepo.findForBusinessForUpdate(trx, distributionId, businessId);
      // Also covers the cross-business case: another business's id won't match.
      if (!distribution) throw new NotFoundError("Enquiry not found");

      if (distribution.unlocked_at != null) return { alreadyUnlocked: true, distribution };
      if (distribution.status === "closed") {
        throw new ConflictError("This enquiry is closed and can no longer be unlocked");
      }

      const enquiry = await trx("enquiries").where({ id: distribution.enquiry_id }).forUpdate().first();
      if (!enquiry) throw new NotFoundError("Enquiry not found");
      if (enquiry.accept_count >= enquiry.max_accepts) {
        throw new ConflictError(`This enquiry has already been unlocked by ${enquiry.max_accepts} businesses`);
      }

      if (creditsService.deduct(cost) === null) {
        throw new PaymentRequiredError(
          `Insufficient credits — unlocking costs ${cost}, balance is ${creditsService.getBalance()}`,
        );
      }
      charged = true;

      const updated = await distributionsRepo.markUnlocked(trx, distributionId, {
        coinCost: cost,
        unlockedBy: userId,
      });

      await trx("enquiries")
        .where({ id: distribution.enquiry_id })
        .update({
          accept_count: enquiry.accept_count + 1,
          status: "unlocked",
          updated_at: trx.fn.now(),
        });

      // The conversation is what the unlock buys, so it opens with a message in the same
      // transaction rather than waiting for someone to type one.
      await messagesService.seedOnUnlock(trx, distributionId, userId);

      await logEnquiryAudit(userId, "distribution.unlocked", {
        entityType: "distribution",
        entityId: distributionId,
        trx,
        details: {
          old_status: distribution.status,
          new_status: "unlocked",
          business_id: businessId,
          coin_cost: cost,
        },
      });

      return { alreadyUnlocked: false, distribution: updated };
    });

    // After commit: the tenant write is a different connection and cannot join the
    // transaction, so it must never run before the central row is durable.
    if (!result.alreadyUnlocked) {
      await syncStatusToTenant(businessId, result.distribution.enquiry_id, "unlocked");
    }

    const contact = await distributionsRepo.findStudentContact(result.distribution.enquiry_id);
    return {
      distribution_id: distributionId,
      status: "unlocked",
      already_unlocked: result.alreadyUnlocked,
      coin_cost: Number(result.distribution.coin_cost),
      credits_remaining: creditsService.getBalance(),
      ...contact,
    };
  } catch (err) {
    if (charged) creditsService.refund(cost);
    throw err;
  }
}

/**
 * Close a lead with a reason.
 *
 * The reason lives on `enquiry_distributions`, NOT `enquiries`: an enquiry goes to
 * several businesses and each closes it for its own reason, so a single column on
 * the parent could only record one of them.
 *
 * Unlocking first is NOT required — declining a lead you never paid for is a
 * legitimate action.
 */
export async function close(
  businessId: number,
  distributionId: string,
  closeReason: string,
  userId: number,
) {
  const reason = closeReason.trim();
  if (!reason) throw new BadRequestError("A close reason is required");

  const result = await masterKnex.transaction(async (trx) => {
    const distribution = await distributionsRepo.findForBusinessForUpdate(trx, distributionId, businessId);
    if (!distribution) throw new NotFoundError("Enquiry not found");
    if (distribution.status === "closed") throw new ConflictError("This enquiry is already closed");

    const updated = await distributionsRepo.markClosed(trx, distributionId, reason);

    await logEnquiryAudit(userId, "distribution.closed", {
      entityType: "distribution",
      entityId: distributionId,
      trx,
      details: {
        old_status: distribution.status,
        new_status: "closed",
        business_id: businessId,
        close_reason: reason,
      },
    });

    return updated;
  });

  await syncStatusToTenant(businessId, result.enquiry_id, "closed");

  return {
    distribution_id: distributionId,
    status: "closed",
    close_reason: result.close_reason,
    closed_at: result.closed_at,
  };
}
