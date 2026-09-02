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
import * as platformUsersService from "../../platform-users/services/platform-users.service.js";
import * as storage from "../../../shared/storage/storageService.js";
import { logEnquiryAudit } from "../shared/audit.js";
import * as distributionsRepo from "../repositories/distributions.repository.js";
import * as threadMembersRepo from "../repositories/thread-members.repository.js";
import * as creditService from "../../ai-counsellor/services/credit.service.js";
import * as emailQueueService from "./email-queue.service.js";
import * as messagesService from "./messages.service.js";
import { markInConversation, reconcileTenantMirror, syncStatusToTenant } from "./tenant-sync.service.js";
import type { Recipient } from "../shared/recipient.js";
import { createChildLogger } from "../../../shared/logger.js";
import { buildPaginatedResponse, paginationToOffset, type PaginationInput } from "../../../shared/pagination.js";

const logger = createChildLogger("distributions-service");

export async function listForBusiness(
  db: Knex,
  recipient: Recipient,
  pagination: PaginationInput,
  filters: { status?: string; search?: string } = {},
) {
  // Every write to the tenant mirror is fire-and-forget, and a lead missing from it is
  // invisible here — so repair before reading rather than trusting writes that swallowed
  // their errors. Normally a no-op: it writes nothing when nothing is missing.
  await reconcileTenantMirror(recipient, db);
  const { limit, offset } = paginationToOffset(pagination);
  const { data, total, counts } = await distributionsRepo.listForBusinessFromTenant(db, { ...filters, limit, offset });
  // Signed here rather than in the repo: resolvePreviewUrl is an async round trip per path, and
  // only the rows on this page need one. Null passes straight through, so a locked row costs
  // nothing.
  const rows = await Promise.all(
    data.map(async (row) => ({ ...row, student_photo_url: await storage.resolvePreviewUrl(row.student_photo_url) })),
  );
  return { ...buildPaginatedResponse(rows, total, pagination), counts };
}

/**
 * What this recipient can spend, and what an unlock costs it.
 *
 * Both halves are real now: the balance is the owning user's `credit_wallets` row (the same
 * wallet the AI counsellor spends and the admin ledger reports on), and the cost is the
 * recipient's own `businesses.enquiry_coin_cost`, which superadmin can already edit per business.
 */
export async function getCreditBalance(recipient: Recipient) {
  const billing = await distributionsRepo.findRecipientBilling(recipient);
  if (!billing) throw new NotFoundError(`${recipient.kind === "institution" ? "Institution" : "Business"} not found`);
  // getBalance lazily creates the wallet with its signup grant if there isn't one; spendCredits
  // deliberately does not. Reading a balance may mint a wallet, spending never mints credits.
  const balance = await creditService.getBalance(billing.walletUserId);
  return { balance: balance.total, unlock_cost: billing.unlockCost };
}

/**
 * The student's full profile, for a recipient that has unlocked this enquiry.
 *
 * The paywall is enforced HERE, not in the UI: an unlocked distribution is the only thing that
 * grants this, and the check runs before a single profile field is read. Calling the endpoint
 * directly with a locked distribution gets 402; with another recipient's distribution, 404.
 *
 * Reuses platform-users' getProfile rather than assembling a second profile reader — it already
 * returns exactly the qualifications / language tests / academic tests / work history set with
 * storage URLs resolved. The phone number is stripped unless the student opted in, so the consent
 * rule holds on this path too and not only on the inbox listing.
 */
export async function getStudentProfile(recipient: Recipient, distributionId: string) {
  const distribution = await distributionsRepo.findForRecipient(distributionId, recipient);
  // 404, not 403 — another recipient's distribution must not be confirmable as existing.
  if (!distribution) throw new NotFoundError("Enquiry not found");
  if (distribution.unlocked_at == null) {
    throw new PaymentRequiredError("Unlock this enquiry to view the student's profile");
  }

  const enquiry = await masterKnex("enquiries")
    .where({ id: distribution.enquiry_id })
    .first("student_id", "share_contact_number");
  if (!enquiry) throw new NotFoundError("Enquiry not found");

  const profile = await platformUsersService.getProfile(Number(enquiry.student_id));

  // Same two-gate rule as the inbox listing: unlocking buys the profile, the number needs consent
  // on top. Destructured out rather than overwritten, so a later change to getProfile's shape
  // cannot reintroduce it by accident.
  const { phone, ...rest } = profile as Record<string, unknown> & { phone?: string | null };
  return {
    ...rest,
    phone: enquiry.share_contact_number ? (phone ?? null) : null,
    phone_withheld: !enquiry.share_contact_number,
  };
}

/**
 * Pay to reveal the student's contact details (PRD §5 "Unlock").
 *
 * Check order is deliberate and load-bearing:
 *   1. already unlocked  -> idempotent success, never charged twice
 *   2. closed            -> conflict
 *   3. unlock cap hit    -> conflict, with NO deduction
 *   4. short on credits  -> 402
 * Credits are only spent once every gate passes.
 *
 * The charge is part of the same transaction as everything it buys, so there is no compensating
 * refund and no window where a business has been debited for a lead it did not get. That used to
 * need a try/catch and a `refund()` because the balance lived in a process-local variable that
 * could not roll back; the wallet is a row, so it can.
 *
 * Two row locks make the concurrent cases safe: the parent enquiry (so the accept cap cannot be
 * exceeded — the old system counted without one, PRD §5 "known gaps") and the wallet inside
 * spendCredits (so two simultaneous unlocks cannot both spend the last credits).
 */
export async function unlock(recipient: Recipient, distributionId: string, userId: number) {
  const billing = await distributionsRepo.findRecipientBilling(recipient);
  if (!billing) throw new NotFoundError(`${recipient.kind === "institution" ? "Institution" : "Business"} not found`);
  const cost = billing.unlockCost;

  const result = await masterKnex.transaction(async (trx) => {
    const distribution = await distributionsRepo.findForRecipientForUpdate(trx, distributionId, recipient);
    // Also covers the cross-business case: another business's id won't match.
    if (!distribution) throw new NotFoundError("Enquiry not found");

    if (distribution.unlocked_at != null) return { alreadyUnlocked: true, distribution, creditsRemaining: null };
    if (distribution.status === "closed") {
      throw new ConflictError("This enquiry is closed and can no longer be unlocked");
    }

    const enquiry = await trx("enquiries").where({ id: distribution.enquiry_id }).forUpdate().first();
    if (!enquiry) throw new NotFoundError("Enquiry not found");
    if (enquiry.accept_count >= enquiry.max_accepts) {
      throw new ConflictError(`This enquiry has already been unlocked by ${enquiry.max_accepts} businesses`);
    }

    // Throws PaymentRequiredError (402) when the wallet is short. Inside the transaction, so
    // a failure anywhere below this line un-charges the business by rolling back.
    //
    // The description is the whole audit trail for this spend: `reference_id` is an integer and
    // a distribution id is a uuid, so the ids live here, where the admin ledger already
    // searches them.
    const spend = await creditService.spendCredits(trx, billing.walletUserId, cost, {
      reason: "enquiry_unlock",
      description: `Enquiry unlock — ${billing.name} · distribution ${distributionId}`,
    });

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

    // …and with its membership. Same transaction for the same reason: an unlocked thread must
    // never exist without an admin, or nobody can add anyone to it. The owner administers it,
    // the agent who spent the credits is on it, everyone else is invited.
    await threadMembersRepo.seedOnUnlock(trx, distributionId, recipient, userId);

    await logEnquiryAudit(userId, "distribution.unlocked", {
      entityType: "distribution",
      entityId: distributionId,
      trx,
      details: {
        old_status: distribution.status,
        new_status: "unlocked",
        recipient,
        coin_cost: cost,
      },
    });

    return { alreadyUnlocked: false, distribution: updated, creditsRemaining: spend.remaining };
  });

  // After commit: the tenant write is a different connection and cannot join the
  // transaction, so it must never run before the central row is durable.
  if (!result.alreadyUnlocked) {
    await syncStatusToTenant(recipient, result.distribution.enquiry_id, "unlocked");
    // The unlock seeded the thread's first message (seedOnUnlock above), so the
    // business's row is already past 'unlocked' by the time it can look at it. Written
    // as two steps rather than one so the tenant row is still correct if the greeting
    // ever stops being part of unlocking.
    await markInConversation(recipient, result.distribution.enquiry_id);
  }

  // Tell the student who now has their details, and that a message is waiting.
  //
  // Deliberately outside the alreadyUnlocked guard: if the first attempt's enqueue failed, a retry
  // should still be able to deliver it. The `enquiry_unlocked:<distribution>` dedup key is what
  // prevents a second mail, and it survives a restart in a way an in-memory guard would not.
  //
  // Fire-and-forget, like every other mail in this flow: the unlock is paid for and committed, and
  // a mail failure must not turn a successful purchase into an error response.
  await emailQueueService
    .enqueueUnlockedEmailToStudent(
      result.distribution.enquiry_id,
      distributionId,
      billing.name,
      // The queue's business_id FKs `businesses`, so an institution recipient records null there.
      recipient.kind === "business" ? recipient.id : null,
    )
    .catch((err) =>
      logger.error("Failed to queue the unlock notification to the student", {
        distributionId,
        error: (err as Error).message,
      }),
    );

  const contact = await distributionsRepo.findStudentContact(result.distribution.enquiry_id);

  // The consent gate has to be applied HERE too, not just in the inbox listing. This response is
  // the other way a phone number reaches a business, and spreading `contact` wholesale would hand
  // over a number the student declined to share — paying for the unlock does not buy it.
  const { share_contact_number, student_phone, ...contactRest } = contact ?? {};

  return {
    distribution_id: distributionId,
    status: "unlocked",
    already_unlocked: result.alreadyUnlocked,
    coin_cost: Number(result.distribution.coin_cost),
    // A repeat unlock charges nothing, so the balance has to be read rather than inferred from
    // a spend that did not happen.
    credits_remaining:
      result.creditsRemaining ?? (await creditService.getBalance(billing.walletUserId)).total,
    ...contactRest,
    student_phone: share_contact_number ? (student_phone ?? null) : null,
    student_phone_withheld: contact != null && !share_contact_number,
  };
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
  recipient: Recipient,
  distributionId: string,
  closeReason: string,
  userId: number,
) {
  const reason = closeReason.trim();
  if (!reason) throw new BadRequestError("A close reason is required");

  const result = await masterKnex.transaction(async (trx) => {
    const distribution = await distributionsRepo.findForRecipientForUpdate(trx, distributionId, recipient);
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
        recipient,
        close_reason: reason,
      },
    });

    return updated;
  });

  await syncStatusToTenant(recipient, result.enquiry_id, "closed");

  return {
    distribution_id: distributionId,
    status: "closed",
    close_reason: result.close_reason,
    closed_at: result.closed_at,
  };
}
