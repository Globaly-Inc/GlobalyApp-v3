// The money path: charging a business for an accepted application, and voiding
// that charge (waive / refund).
//
// Behavioural spec: V1 `charge-application` + AdminApplicationCharges.tsx.
//
// ── THIS IS CREDITS, NOT STRIPE ──
// V1's `charge-application` calls `deduct_credits` against `credit_wallets`, and
// V2's `application_charges` table has no Stripe columns at all — no payment
// intent, no session, no customer. An application charge is a wallet debit and
// never touches a card, so there is no provider call to fail closed on and no
// getStripeClient() in this file. Recorded as a §3.8 / brief contradiction.
//
// The guarantees the brief asked of a provider path are all still here, expressed
// against the ledger instead:
//   * idempotency key   NOT NULL UNIQUE on application_charges, DERIVED from the
//                       application id (consts.chargeIdempotencyKey), never
//                       supplied by a caller. Handed to credits.spendCredits as
//                       well, so credit_transactions' own UNIQUE index is a second
//                       independent guard.
//   * fail closed       an unfunded wallet is a 402 and writes NOTHING: no charge
//                       row, no debit, no status change on the application.
//   * settlement last   the wallet debit is the LAST write in the transaction, so
//                       anything that throws rolls the claim and the decision back
//                       with it.
//
// The ledger itself is billing/services/credits.service.ts. There is no second
// wallet, no second ledger and no second Stripe client in this module.

import { masterKnex } from "../../../core/db/master-pool.js";
import { ConflictError, NotFoundError } from "../../../shared/errors.js";
import { createChildLogger } from "../../../shared/logger.js";
import {
  buildPaginatedResponse,
  paginationToOffset,
} from "../../../shared/pagination.js";
import * as billingRepo from "../../billing/repositories/billing.repository.js";
import * as credits from "../../billing/services/credits.service.js";
import { isEntitled } from "../../billing/services/subscriptions.service.js";
import {
  CHARGE_REFERENCE_TYPE,
  DEFAULT_APPLICATION_CREDIT_COST,
  chargeIdempotencyKey,
  refundIdempotencyKey,
} from "../consts.js";
import * as repo from "../repositories/applications.repository.js";
import type { AdminChargesInput, BusinessChargesInput } from "../schemas/applications.schema.js";

const logger = createChildLogger("application-charges");

/**
 * What one application costs this business, in credits.
 *
 * V1 read `pay_per_application_cost` off the active subscription via
 * `get_active_subscription` and fell back to 10. Same rule here, with one fix:
 * V1's RPC checked only `status`, so a plan whose paid period had lapsed still
 * priced the charge. `isEntitled()` (billing) treats a lapsed period as lapsed,
 * which is the same guard every other entitlement in V3 uses.
 */
export async function applicationCost(businessId: number, trx?: repo.Db): Promise<number> {
  const subscription = await billingRepo.findSubscription(businessId, trx);
  if (!subscription || !isEntitled(subscription)) return DEFAULT_APPLICATION_CREDIT_COST;
  const plan = await billingRepo.findPlanById(subscription.plan_id, trx);
  const cost = Number(
    (plan as unknown as { pay_per_application_cost?: number } | undefined)?.pay_per_application_cost,
  );
  return Number.isInteger(cost) && cost > 0 ? cost : DEFAULT_APPLICATION_CREDIT_COST;
}

export interface ChargeOutcome {
  charge_id: number;
  credits_charged: number;
  already_charged: boolean;
}

/**
 * Charge `businessId` for `application`, exactly once, inside `trx`.
 *
 * Called from within the accept transaction (applications.service.ts) so the
 * decision and the charge share one atomic outcome: a 402 here rolls the accept
 * back too, and the business never receives an outcome it has not paid for.
 *
 * Order is load-bearing:
 *   1. read the committed charge (fast path for a replay);
 *   2. CLAIM the charge row — the UNIQUE idempotency_key is the arbiter;
 *   3. debit the wallet LAST, with the same derived key.
 * A throw at step 3 unwinds steps 2 and the caller's decision.
 */
export async function chargeForApplication(
  application: { id: number; business_id: number; student_id: number; service_id: number | null },
  actorId: number | null,
  trx: repo.Db,
): Promise<ChargeOutcome> {
  const settled = await repo.findChargeByApplication(application.id, trx);
  if (settled) {
    return {
      charge_id: settled.id,
      credits_charged: settled.credits_charged,
      already_charged: true,
    };
  }

  const cost = await applicationCost(application.business_id, trx);
  const idempotencyKey = chargeIdempotencyKey(application.id);

  const claim = await repo.claimCharge(
    {
      business_id: application.business_id,
      application_id: application.id,
      student_id: application.student_id,
      service_id: application.service_id,
      credits_charged: cost,
      status: "charged",
      idempotency_key: idempotencyKey,
    },
    trx,
  );
  // Someone else won the race and is committing right now. No charge from us.
  if (!claim) {
    const winner = await repo.findChargeByApplication(application.id, trx);
    if (!winner) throw new ConflictError("Application is already being charged");
    return { charge_id: winner.id, credits_charged: winner.credits_charged, already_charged: true };
  }

  // LAST. Throws InsufficientCreditsError (402) rather than letting a balance go
  // negative; the throw rolls back the claim above and the caller's decision.
  const spend = await credits.spendCredits(
    application.business_id,
    {
      amount: cost,
      transaction_type: "application_charge",
      description: `Application charge: application ${application.id}`,
      reference_type: CHARGE_REFERENCE_TYPE,
      reference_id: String(application.id),
      idempotency_key: idempotencyKey,
    },
    actorId,
    trx,
  );

  await repo.attachChargeTransaction(claim.id, spend.transaction.id, trx);
  logger.info("application charged", {
    applicationId: application.id,
    businessId: application.business_id,
    credits: cost,
  });

  return { charge_id: claim.id, credits_charged: cost, already_charged: false };
}

// ── voiding a charge (admin) ────────────────────────────────────────────────

export interface VoidOutcome {
  charge_id: number;
  status: string;
  credits_returned: number;
  already_refunded: boolean;
}

/**
 * Waive or refund, exactly once. One transaction, and the STATUS TRANSITION IS
 * FIRST (repo.claimVoid compare-and-sets from 'charged'), so:
 *   * a replay matches nothing, grants nothing, and reports already_refunded;
 *   * a failed grant rolls the transition back, so the charge stays `charged` and
 *     is still voidable.
 * V1 granted the credits first and updated the status after, un-transacted — the
 * button minted credits on every press (D-G5-4).
 *
 * Both verbs return the money. V1's waive did NOT, which made "waived" mean two
 * different things depending on which button an admin happened to press; a waived
 * charge is a charge that should not have happened.
 */
async function voidCharge(
  chargeId: number,
  status: "waived" | "refunded",
  adminId: number,
): Promise<VoidOutcome> {
  const existing = await repo.findCharge(chargeId);
  if (!existing) throw new NotFoundError("Charge not found");
  if (existing.status !== "charged") {
    // Idempotent for a repeat of the SAME verb; a conflict for the other one, because
    // "waive this refunded charge" is a mistake, not a retry.
    if (existing.status === status) {
      return {
        charge_id: existing.id,
        status: existing.status,
        credits_returned: 0,
        already_refunded: true,
      };
    }
    throw new ConflictError(`Charge is already ${existing.status}`);
  }

  const outcome = await masterKnex.transaction(async (trx) => {
    const claim = await repo.claimVoid(chargeId, status, { adminId }, trx);
    if (!claim) return null; // lost the race — the winner is doing the grant

    const grant = await credits.grantCredits(
      {
        businessId: claim.business_id,
        amount: claim.credits_charged,
        transactionType: "refund",
        bucket: "purchased",
        description: `${status === "waived" ? "Waived" : "Refunded"} application charge ${claim.id}`,
        referenceType: CHARGE_REFERENCE_TYPE,
        referenceId: String(claim.application_id),
        performedBy: null,
        idempotencyKey: refundIdempotencyKey(claim.id),
      },
      trx,
    );
    await repo.attachRefundTransaction(claim.id, grant.transaction.id, trx);
    return { claim, credits: claim.credits_charged };
  });

  if (!outcome) {
    const winner = await repo.findCharge(chargeId);
    return {
      charge_id: chargeId,
      status: winner?.status ?? status,
      credits_returned: 0,
      already_refunded: true,
    };
  }

  logger.info("application charge voided", { chargeId, status, credits: outcome.credits });
  return {
    charge_id: outcome.claim.id,
    status: outcome.claim.status,
    credits_returned: outcome.credits,
    already_refunded: false,
  };
}

export const waive = (chargeId: number, adminId: number) => voidCharge(chargeId, "waived", adminId);
export const refund = (chargeId: number, adminId: number) => voidCharge(chargeId, "refunded", adminId);

// ── reads ───────────────────────────────────────────────────────────────────

const iso = (value: Date | string | null) => (value === null ? null : new Date(value).toISOString());

/**
 * The paying business's own charges. V2's projection exactly: id,
 * credits_charged, status, created_at, service_name — and nothing else.
 *
 * `service_name` is resolved against the caller's TENANT connection, because
 * business_services lives in the tenant schema and cannot be joined from master.
 * Nulls out rather than failing when the service has been deleted, which is what
 * V2's LEFT JOIN did.
 */
export async function listOwnerCharges(
  businessId: number,
  tenantDb: repo.Db,
  query: BusinessChargesInput,
) {
  const { limit, offset } = paginationToOffset(query);
  const filters = { status: query.status };
  const [rows, total] = await Promise.all([
    repo.listOwnerCharges(businessId, filters, limit, offset),
    repo.countOwnerCharges(businessId, filters),
  ]);

  const serviceIds = [...new Set(rows.map((r) => r.service_id).filter((id): id is number => id !== null))];
  const names = new Map<number, string>();
  if (serviceIds.length) {
    const services = (await tenantDb("business_services")
      .whereIn("id", serviceIds)
      .select("id", "name")) as { id: number; name: string }[];
    for (const s of services) names.set(s.id, s.name);
  }

  return buildPaginatedResponse(
    rows.map((r) => ({
      id: r.id,
      credits_charged: r.credits_charged,
      status: r.status,
      created_at: iso(r.created_at as Date),
      service_name: r.service_id === null ? null : names.get(r.service_id) ?? null,
    })),
    total,
    query,
  );
}

/** Admin cross-tenant list. Includes the student's name — see the repository header. */
export async function listAdminCharges(query: AdminChargesInput) {
  const { limit, offset } = paginationToOffset(query);
  const filters = {
    status: query.status,
    businessId: query.business_id,
    from: query.from,
    to: query.to,
  };
  const [rows, total] = await Promise.all([
    repo.listAdminCharges(filters, limit, offset),
    repo.countAdminCharges(filters),
  ]);
  return buildPaginatedResponse(
    rows.map((r) => ({
      id: r.id,
      business_id: r.business_id,
      business_name: r.business_name,
      application_id: r.application_id,
      student_id: r.student_id,
      student_name: r.student_name,
      service_id: r.service_id,
      credits_charged: r.credits_charged,
      status: r.status,
      charged_at: iso(r.charged_at),
      waived_at: iso(r.waived_at),
      refunded_at: iso(r.refunded_at),
      created_at: iso(r.created_at),
    })),
    total,
    query,
  );
}

export const stats = repo.chargeStats;
