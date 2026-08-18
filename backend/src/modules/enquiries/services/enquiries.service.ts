// Enquiry service — student create/read, business inbox, and the credit-gated
// unlock. Behavioural spec: V1 `distribute-enquiry` + `unlock-enquiry`, and V2
// `apps/core-api/src/routes/enquiries.ts`.

import { masterKnex } from "../../../core/db/master-pool.js";
import { NotFoundError } from "../../../shared/errors.js";
import {
  buildPaginatedResponse,
  paginationToOffset,
  type PaginationInput,
} from "../../../shared/pagination.js";
import { createChildLogger } from "../../../shared/logger.js";
import * as credits from "../../billing/services/credits.service.js";
import {
  ENQUIRY_RATE_LIMIT,
  ENQUIRY_RATE_WINDOW_HOURS,
  MESSAGE_PREVIEW_CHARS,
  UNLOCK_REFERENCE_TYPE,
  unlockIdempotencyKey,
} from "../consts.js";
import { EnquiryClosedError, EnquiryRateLimitError } from "../errors.js";
import * as repo from "../repositories/enquiries.repository.js";
import type {
  AdminListQuery,
  CreateEnquiryInput,
  ListInboxQuery,
  ListMyEnquiriesQuery,
} from "../schemas/enquiries.schema.js";
import { distribute, priceLead } from "./distribution.service.js";

const logger = createChildLogger("enquiries");

// ── Student ─────────────────────────────────────────────────────────────────

/**
 * Create an enquiry and immediately fan it out.
 *
 * V1 made this two client calls (insert, then POST distribute) and swallowed a
 * failed distribute, leaving orphan enquiries nobody ever saw. One call, one
 * outcome.
 */
export async function createEnquiry(studentId: number, input: CreateEnquiryInput) {
  // V1's `validate_enquiry_rate_limit` trigger, enforced in the service so the
  // caller gets a 429 with a message instead of a raw Postgres exception.
  const recent = await repo.countRecentEnquiries(studentId, ENQUIRY_RATE_WINDOW_HOURS);
  if (recent >= ENQUIRY_RATE_LIMIT) throw new EnquiryRateLimitError();

  // `enquiries.course_id` has no FK behind it (20260817_961: the target is staging
  // data the extraction tail hard-deletes), so this check is the only thing that
  // keeps a freshly written reference resolvable. Before the insert, so a bad
  // course does not cost the student one of their three enquiries per 24h.
  if (input.course_id != null && !(await repo.courseExists(input.course_id))) {
    throw new NotFoundError("Course not found");
  }

  const enquiry = await repo.insertEnquiry({
    student_id: studentId,
    message: input.message,
    preferred_intake: input.preferred_intake ?? null,
    preferred_year: input.preferred_year ?? null,
    service_id: input.service_id ?? null,
    course_id: input.course_id ?? null,
    target_org_type: input.target_org_type ?? null,
    target_org_id: input.target_org_id ?? null,
    agent_business_id: input.agent_business_id ?? null,
  });

  const distribution = await distribute(enquiry);
  logger.info("enquiry created", { enquiryId: enquiry.id, studentId, ...distribution });

  return {
    id: enquiry.id,
    status: enquiry.status,
    created_at: enquiry.created_at,
    ...distribution,
  };
}

export async function listMyEnquiries(studentId: number, query: ListMyEnquiriesQuery) {
  const { limit, offset } = paginationToOffset(query);
  const [rows, total] = await Promise.all([
    repo.listEnquiriesByStudent(studentId, query.status, limit, offset),
    repo.countEnquiriesByStudent(studentId, query.status),
  ]);
  return buildPaginatedResponse(rows, total, query as PaginationInput);
}

export async function getMyEnquiry(studentId: number, enquiryId: number) {
  const enquiry = await repo.findEnquiryWithCourse(enquiryId);
  if (!enquiry) throw new NotFoundError("Enquiry not found");
  // Not a 403: a student must not be able to probe which enquiry ids exist.
  if (enquiry.student_id !== studentId) throw new NotFoundError("Enquiry not found");

  return { ...enquiry, unlocked_by_count: await repo.countUnlocksForEnquiry(enquiryId) };
}

// ── Business inbox ──────────────────────────────────────────────────────────

function preview(message: string): string {
  return message.length <= MESSAGE_PREVIEW_CHARS
    ? message
    : `${message.slice(0, MESSAGE_PREVIEW_CHARS).trimEnd()}…`;
}

/**
 * Shape one inbox row for the wire.
 *
 * The masked payload does not carry the contact fields with empty values — it
 * does not carry the KEYS. A `null` email in a response is still an assertion
 * that an email field exists for this lead, and every client that renders it
 * would have to be trusted to hide it. Locked rows get a truncated preview and a
 * first name; everything else only exists once the lead is paid for.
 */
export function toInboxItem(row: repo.InboxRow) {
  const shared = {
    id: row.id,
    enquiry_id: row.enquiry_id,
    status: row.status,
    enquiry_status: row.enquiry_status,
    coin_cost: row.coin_cost,
    distance_km: row.distance_km == null ? null : Number(row.distance_km),
    preferred_intake: row.preferred_intake,
    preferred_year: row.preferred_year,
    created_at: row.created_at,
    // Distribution-level, so they belong on both sides of the paywall: a business
    // that closed a lead it never paid for still has to see that it did.
    closed_at: row.closed_at,
    close_reason: row.close_reason,
  };

  if (row.unlock_id == null) {
    return {
      ...shared,
      unlocked: false,
      message_preview: preview(row.message),
      student: {
        first_name: row.student_first_name,
        photo_url: row.student_photo_url,
      },
    };
  }

  return {
    ...shared,
    unlocked: true,
    unlocked_at: row.unlocked_at,
    credits_spent: row.credits_spent,
    message: row.message,
    service_id: row.service_id,
    student: {
      id: row.student_id,
      first_name: row.student_first_name,
      last_name: row.student_last_name,
      email: row.student_email,
      phone: row.student_phone,
      photo_url: row.student_photo_url,
      city_of_residence: row.student_city,
      nationality_id: row.student_nationality_id,
      country_of_residence_id: row.student_country_of_residence_id,
    },
  };
}

export async function listInbox(businessId: number, query: ListInboxQuery) {
  const { limit, offset } = paginationToOffset(query);
  const filters = { status: query.status, unlocked: query.unlocked };
  const [rows, total] = await Promise.all([
    repo.listInbox(businessId, filters, limit, offset),
    repo.countInbox(businessId, filters),
  ]);
  return buildPaginatedResponse(rows.map(toInboxItem), total, query as PaginationInput);
}

export async function getInboxItem(businessId: number, distributionId: number) {
  const row = await repo.findInboxItem(distributionId, businessId);
  // Cross-tenant isolation: the query is scoped by business_id, so another
  // business's distribution is indistinguishable from one that does not exist.
  if (!row) throw new NotFoundError("Enquiry not found in this inbox");
  return toInboxItem(row);
}

/**
 * Credit balance + per-lead price for the inbox's own widget.
 *
 * Deliberately thin: the wallet is billing's, and this reads it through
 * `credits.getBalance` rather than touching `credit_wallets` — one balance
 * calculation in the codebase, not two that can disagree. `unlock_cost` is the
 * caller's own `businesses.enquiry_coin_cost` run through the same `priceLead`
 * the distributor uses, so the number shown is the number that will be charged
 * on the next lead. (An existing distribution keeps the price frozen at its own
 * `coin_cost`; that is on the row, and the row is what unlock spends.)
 */
export async function getCreditBalance(businessId: number) {
  const [wallet, coinCost] = await Promise.all([
    credits.getBalance(businessId),
    repo.findEnquiryCoinCost(businessId),
  ]);
  return { balance: wallet.balance, unlock_cost: priceLead(coinCost) };
}

// ── Close (housekeeping) ────────────────────────────────────────────────────

/**
 * Retire one distribution from one business's inbox.
 *
 * Allowed from every status except 'closed', and that is a decision, not an
 * oversight. A distribution is a business's private copy of a lead, and closing
 * it destroys nothing: the unlock row, the ledger entry, the student's enquiry
 * and every other business's copy are all untouched. So there is no status from
 * which "I am finished with this lead" is incoherent — not 'pending' (never
 * interested), not 'viewed' (paid, worked, dead), and not 'responded', where a
 * rule would be actively harmful: it is the one status a lead reaches by going
 * *well*, and blocking close there would strand those rows in the inbox for ever
 * with no way to clear them. `closed` itself is the no-op below.
 *
 * Free, and reveals nothing. The response is distribution-level only, so close
 * cannot be used to read around the unlock paywall.
 */
export async function closeDistribution(
  businessId: number,
  distributionId: number,
  closeReason: string | null,
) {
  const distribution = await repo.findDistributionForBusiness(distributionId, businessId);
  // Same cross-tenant story as the rest of this file: the lookup is scoped by
  // business_id, so another business's distribution is a 404, never a 403.
  if (!distribution) throw new NotFoundError("Enquiry not found in this inbox");

  const closed = await repo.closeDistribution(distributionId, businessId, closeReason);
  if (!closed) {
    // Nothing matched, and the lookup above proved the row is ours — so it was
    // already closed. Report the close that actually happened, not this attempt:
    // the first reason is the one on the record.
    return {
      id: distribution.id,
      status: distribution.status,
      already_closed: true as const,
      closed_at: distribution.closed_at,
      close_reason: distribution.close_reason,
    };
  }

  logger.info("enquiry distribution closed", { businessId, distributionId });
  return {
    id: closed.id,
    status: closed.status,
    already_closed: false as const,
    closed_at: closed.closed_at,
    close_reason: closed.close_reason,
  };
}

// ── Unlock (the monetised path) ─────────────────────────────────────────────

/**
 * Spend credits to reveal a lead. Exactly-once under concurrency.
 *
 * The whole thing is one master transaction, and the FIRST write is the
 * `enquiry_unlocks` insert, whose UNIQUE (distribution_id) is the arbiter:
 *
 *   * two simultaneous unlocks — the loser blocks on the index until the winner
 *     commits, then its ON CONFLICT DO NOTHING returns no row, so it reports
 *     "already unlocked" and never reaches the debit. One charge, one ledger row.
 *   * not enough credits — `spendCredits` throws (402), the transaction rolls
 *     back, and the claim row vanishes with it, so a later top-up can retry.
 *   * a replayed request — the unlock row is already committed, so the fast path
 *     below returns it, and even if that read raced, the wallet debit carries
 *     `idempotency_key = enquiry_unlock:<id>` (UNIQUE on credit_transactions) as
 *     a second, independent guard.
 */
export async function unlockEnquiry(
  businessId: number,
  distributionId: number,
  actorId: number | null,
) {
  const distribution = await repo.findDistributionForBusiness(distributionId, businessId);
  if (!distribution) throw new NotFoundError("Enquiry not found in this inbox");

  // Before anything is claimed or charged. The transaction below sets the status
  // to 'viewed', which on a closed row would drag it back out of 'closed' while
  // leaving closed_at and close_reason set — a row asserting both at once — and
  // would bill a business for a lead it had already declared finished with.
  if (distribution.status === "closed") throw new EnquiryClosedError();

  const settled = await repo.findUnlock(distributionId);
  if (settled) return unlockResponse(businessId, distributionId, settled, true);

  const claimed = await masterKnex.transaction(async (trx) => {
    const claim = await repo.claimUnlock(
      {
        distribution_id: distribution.id,
        enquiry_id: distribution.enquiry_id,
        business_id: businessId,
        unlocked_by: actorId,
        credits_spent: distribution.coin_cost,
      },
      trx,
    );
    if (!claim) return null; // someone else won the race — no charge from us

    const spend = await credits.spendCredits(
      businessId,
      {
        amount: distribution.coin_cost,
        transaction_type: "enquiry_unlock",
        description: `Enquiry unlock: enquiry ${distribution.enquiry_id}`,
        reference_type: UNLOCK_REFERENCE_TYPE,
        reference_id: String(distribution.enquiry_id),
        idempotency_key: unlockIdempotencyKey(distribution.id),
      },
      actorId,
      trx,
    );

    await repo.attachTransaction(claim.id, spend.transaction.id, trx);
    await repo.setDistributionStatus(distribution.id, "viewed", trx);
    // Only ever an upgrade: an enquiry the student already converted must not be
    // dragged back to 'viewed' by a late unlock.
    await trx("enquiries")
      .where({ id: distribution.enquiry_id, status: "pending" })
      .update({ status: "viewed", updated_at: trx.fn.now() });

    return claim;
  });

  if (!claimed) {
    const winner = await repo.findUnlock(distributionId);
    if (!winner) throw new NotFoundError("Enquiry not found in this inbox");
    return unlockResponse(businessId, distributionId, winner, true);
  }

  logger.info("enquiry unlocked", {
    businessId,
    distributionId,
    credits: distribution.coin_cost,
  });
  return unlockResponse(businessId, distributionId, claimed, false);
}

async function unlockResponse(
  businessId: number,
  distributionId: number,
  unlock: repo.UnlockRow,
  alreadyUnlocked: boolean,
) {
  const [item, balance] = await Promise.all([
    getInboxItem(businessId, distributionId),
    credits.getBalance(businessId),
  ]);
  return {
    unlocked: true,
    already_unlocked: alreadyUnlocked,
    credits_spent: unlock.credits_spent,
    balance: balance.balance,
    enquiry: item,
  };
}

// ── Admin monitoring ────────────────────────────────────────────────────────

export async function listForAdmin(query: AdminListQuery) {
  const { limit, offset } = paginationToOffset(query);
  const filters = {
    status: query.status,
    studentId: query.student_id,
    businessId: query.business_id,
  };
  const [rows, total] = await Promise.all([
    repo.listAdminEnquiries(filters, limit, offset),
    repo.countAdminEnquiries(filters),
  ]);
  return buildPaginatedResponse(rows, total, query as PaginationInput);
}

export async function statsForAdmin() {
  return repo.adminStats();
}
