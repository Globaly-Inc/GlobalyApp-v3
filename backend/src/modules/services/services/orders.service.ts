// Order lifecycle. Everything that happens *after* an order exists: reads, payment verification,
// mutual completion confirmation, dispute, cancel and refund.
//
// Order creation is deliberately absent — a buyer acquires a service on the public marketplace, which this
// phase does not build. See the PRD's scope section.

import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from "../../../shared/errors.js";
import { createChildLogger } from "../../../shared/logger.js";
import { masterKnex } from "../../../core/db/master-pool.js";
import { withTransaction } from "../../../core/db/transaction.js";
import * as repo from "../repositories/services.repository.js";
import { getDriver } from "../payments/index.js";
import { TERMINAL_ORDER_STATUSES } from "../schemas/services.schema.js";

const logger = createChildLogger("services-orders");

export type OrderRole = "buyer" | "provider";

export interface OrderDto {
  id: number;
  listing_id: number;
  listing_title: string;
  listing_deleted: boolean;
  amount_minor: number;
  currency: string;
  status: string;
  /** Decided server-side from the order row. The client never infers which side it is on. */
  role: OrderRole;
  counterparty_name: string;
  buyer_confirmed: boolean;
  provider_confirmed: boolean;
  /** True when this caller still owes a confirmation on a paid order — drives the row's action flag. */
  awaiting_my_confirmation: boolean;
  can_review: boolean;
  has_review: boolean;
  notes: string | null;
  payment_refund_id: string | null;
  created_at: string;
  paid_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  refunded_at: string | null;
}

const iso = (value: Date | null) => (value ? new Date(value).toISOString() : null);

function toDto(row: repo.HydratedOrderRow, viewerId: number): OrderDto {
  const role: OrderRole = row.buyer_id === viewerId ? "buyer" : "provider";
  const mineConfirmed = role === "buyer" ? row.buyer_confirmed : row.provider_confirmed;
  return {
    id: row.id,
    listing_id: row.listing_id,
    listing_title: row.listing_title,
    listing_deleted: !!row.listing_deleted,
    amount_minor: row.amount_minor,
    currency: row.currency,
    status: row.status,
    role,
    counterparty_name: role === "buyer" ? row.provider_name : row.buyer_name,
    buyer_confirmed: row.buyer_confirmed,
    provider_confirmed: row.provider_confirmed,
    awaiting_my_confirmation: row.status === "paid" && !mineConfirmed,
    // Reviews are the buyer's alone, and only once the order actually closed.
    can_review: role === "buyer" && row.status === "completed" && row.review_id === null,
    has_review: row.review_id !== null,
    notes: row.notes,
    payment_refund_id: row.payment_refund_id,
    created_at: new Date(row.created_at).toISOString(),
    paid_at: iso(row.paid_at),
    completed_at: iso(row.completed_at),
    cancelled_at: iso(row.cancelled_at),
    refunded_at: iso(row.refunded_at),
  };
}

export async function listPurchases(buyerId: number): Promise<OrderDto[]> {
  const rows = await repo.listOrdersAsBuyer(buyerId);
  return rows.map((r) => toDto(r, buyerId));
}

export async function listReceived(providerId: number): Promise<OrderDto[]> {
  const rows = await repo.listOrdersAsProvider(providerId);
  return rows.map((r) => toDto(r, providerId));
}

/** Either party may read an order; nobody else may know it exists. */
export async function getOne(orderId: number, userId: number): Promise<OrderDto> {
  const row = await repo.findOrderById(orderId);
  if (!row) throw new NotFoundError("Order not found");
  if (row.buyer_id !== userId && row.provider_id !== userId) throw new NotFoundError("Order not found");
  return toDto(row, userId);
}

// ─── Payment verification ──────────────────────────────────────────────────

/**
 * Settle an order from a Checkout session.
 *
 * Stripe exposes `amount_total`, `currency`, `payment_intent` and `payment_status` so a caller can
 * reconcile them against what it believes it charged. Trusting `payment_status` alone means a future
 * checkout-integration bug — a session built with the wrong amount, in the wrong currency, or against the
 * wrong order — settles as a valid payment and the seller is told they were paid an amount nobody sent.
 * All six checks below must hold before the order moves.
 *
 * Idempotent: returning to this URL, or reloading it, must never look like a failure and must never
 * increment the listing's order count twice.
 */
export async function verifyPayment(
  userId: number,
  sessionId: string,
): Promise<{ success: true; order_id: number; already_verified: boolean }> {
  const order = await repo.findOrderBySessionId(sessionId);
  if (!order) throw new NotFoundError("No order found for this payment session");

  // (6) Caller identity, and (5) session↔order agreement, are checked before any outbound call, so probing
  // session ids cannot be used to make this server talk to Stripe.
  if (order.buyer_id !== userId) throw new ForbiddenError("This payment belongs to another account");
  if (order.payment_session_id !== sessionId) throw new BadRequestError("Payment session does not match this order");

  // Already settled — the reload case. Report success without touching anything.
  if (order.status !== "pending_payment") {
    const settled = order.status === "paid" || order.status === "completed";
    if (!settled) throw new ConflictError(`This order is ${order.status.replace("_", " ")} and cannot be paid`);
    return { success: true, order_id: order.id, already_verified: true };
  }

  const session = await getDriver().retrieveSession(sessionId);

  // (1) Stripe's own verdict.
  if (session.paymentStatus !== "paid") {
    throw new BadRequestError("This payment has not completed yet");
  }
  // (2) Amount. The one check that stops the wrong sum being recorded as settled.
  if (session.amountTotalMinor !== order.amount_minor) {
    logger.error("Payment amount does not match the order", {
      orderId: order.id,
      expected: order.amount_minor,
      actual: session.amountTotalMinor,
    });
    throw new BadRequestError("The amount paid does not match this order");
  }
  // (3) Currency. Stripe returns it lowercase, so normalise both sides rather than comparing raw.
  if ((session.currency ?? "").toUpperCase() !== order.currency.toUpperCase()) {
    logger.error("Payment currency does not match the order", {
      orderId: order.id,
      expected: order.currency,
      actual: session.currency,
    });
    throw new BadRequestError("The currency paid does not match this order");
  }
  // (4) A PaymentIntent must exist, or the order could never be refunded.
  if (!session.paymentIntentId) {
    throw new BadRequestError("This payment has no payment intent and cannot be reconciled");
  }

  return withTransaction(masterKnex, async (trx) => {
    // Re-read under a lock: two returns to the success URL at once would otherwise both pass the checks
    // above and both increment the listing's order count.
    const locked = await repo.lockOrder(order.id, trx);
    if (!locked) throw new NotFoundError("Order not found");
    if (locked.status !== "pending_payment") {
      return { success: true as const, order_id: locked.id, already_verified: true };
    }

    await repo.updateOrder(
      locked.id,
      {
        status: "paid",
        paid_at: new Date(),
        payment_intent_id: session.paymentIntentId,
        payment_provider: getDriver().name,
      },
      trx,
    );
    await repo.incrementListingOrders(locked.listing_id, trx);

    return { success: true as const, order_id: locked.id, already_verified: false };
  });
}

// ─── Completion ────────────────────────────────────────────────────────────

/**
 * Confirm completion as whichever party the caller actually is.
 *
 * The flag set is derived from the order row, never from the request body, so a buyer cannot confirm on the
 * provider's behalf. The order closes only when both flags are true; one-sided confirmation leaves it
 * exactly where it was, and neither party is told it finished.
 *
 * `completed` means both parties confirmed. It is not a payout — no money moves in this phase.
 */
export async function confirmCompletion(orderId: number, userId: number): Promise<OrderDto> {
  await withTransaction(masterKnex, async (trx) => {
    const order = await repo.lockOrder(orderId, trx);
    if (!order) throw new NotFoundError("Order not found");

    const role: OrderRole | null =
      order.buyer_id === userId ? "buyer" : order.provider_id === userId ? "provider" : null;
    if (!role) throw new ForbiddenError("You are not part of this order");

    if (order.status !== "paid") {
      throw new ConflictError(`Only a held payment can be confirmed — this order is ${order.status.replace("_", " ")}`);
    }

    const alreadyMine = role === "buyer" ? order.buyer_confirmed : order.provider_confirmed;
    if (alreadyMine) throw new ConflictError("You have already confirmed this order");

    const buyerConfirmed = role === "buyer" ? true : order.buyer_confirmed;
    const providerConfirmed = role === "provider" ? true : order.provider_confirmed;
    const both = buyerConfirmed && providerConfirmed;

    await repo.updateOrder(
      orderId,
      {
        buyer_confirmed: buyerConfirmed,
        provider_confirmed: providerConfirmed,
        ...(both ? { status: "completed" as const, completed_at: new Date() } : {}),
      },
      trx,
    );
  });

  return getOne(orderId, userId);
}

// ─── Dispute ───────────────────────────────────────────────────────────────

/** Report a problem. Produces `disputed`, which is read-only until Ops resolves it — resolution is not built here. */
export async function dispute(orderId: number, userId: number, reason: string): Promise<OrderDto> {
  await withTransaction(masterKnex, async (trx) => {
    const order = await repo.lockOrder(orderId, trx);
    if (!order) throw new NotFoundError("Order not found");
    if (order.buyer_id !== userId && order.provider_id !== userId) {
      throw new ForbiddenError("You are not part of this order");
    }
    if (order.status !== "paid") {
      throw new ConflictError(`Only a held payment can be disputed — this order is ${order.status.replace("_", " ")}`);
    }

    const stamp = new Date().toISOString();
    const note = `[${stamp}] Problem reported: ${reason}`;
    await repo.updateOrder(
      orderId,
      { status: "disputed", notes: order.notes ? `${order.notes}\n${note}` : note },
      trx,
    );
  });

  return getOne(orderId, userId);
}

// ─── Cancel ────────────────────────────────────────────────────────────────

/** Cancel an order that was never paid. No money is involved, so either party may do it. */
export async function cancel(orderId: number, userId: number): Promise<OrderDto> {
  await withTransaction(masterKnex, async (trx) => {
    const order = await repo.lockOrder(orderId, trx);
    if (!order) throw new NotFoundError("Order not found");
    if (order.buyer_id !== userId && order.provider_id !== userId) {
      throw new ForbiddenError("You are not part of this order");
    }
    if (order.status !== "pending_payment") {
      throw new ConflictError(
        order.status === "paid"
          ? "This payment is already held — refund it instead of cancelling"
          : `This order is ${order.status.replace("_", " ")} and cannot be cancelled`,
      );
    }
    await repo.updateOrder(orderId, { status: "cancelled", cancelled_at: new Date() }, trx);
  });

  return getOne(orderId, userId);
}

// ─── Refund ────────────────────────────────────────────────────────────────

const refundKey = (orderId: number) => `service-order-refund-${orderId}`;

/**
 * Refund a held payment. The provider's call — refunding money the platform already holds needs no Connect
 * account, so unlike payouts this is genuinely real.
 *
 * Stripe and Postgres cannot share a transaction, and the dangerous interleaving is Stripe succeeding while
 * the DB write fails: a naive retry issues a *second* refund, because Stripe accepts repeated partial
 * refunds against a PaymentIntent until the refundable amount is exhausted.
 *
 * An idempotency key alone does not close this. Stripe guarantees idempotent replay for 24 hours and may
 * prune keys after that, so a retry days later — an operator clearing a stuck order, a weekly job — reads
 * as a brand-new request. The key covers the short window; asking Stripe what refunds it already holds
 * covers the long one. Both are here, in that order.
 */
export async function refund(orderId: number, userId: number): Promise<OrderDto> {
  const order = await repo.findOrderById(orderId);
  if (!order) throw new NotFoundError("Order not found");
  if (order.provider_id !== userId) {
    throw new ForbiddenError("Only the provider can refund an order");
  }

  // (2) Already reconciled locally — idempotent success, and no outbound call at all.
  if (order.payment_refund_id) return toDto(order, userId);

  if (order.status !== "paid") {
    throw new ConflictError(`Only a held payment can be refunded — this order is ${order.status.replace("_", " ")}`);
  }
  if (!order.payment_intent_id) {
    throw new ConflictError("This order has no payment intent to refund against");
  }

  const driver = getDriver();

  // (3) Ask Stripe what it already did. Authoritative however much time has passed, and unaffected by
  // whether the idempotency key still exists.
  const existing = await driver.listRefunds(order.payment_intent_id);
  const reusable = existing.find((r) => r.status !== "failed" && r.status !== "canceled");

  // (4) A refund already exists with no local row — the exact state a failed persist leaves behind.
  // Reconcile it. Never issue a second one.
  const result = reusable
    ? (logger.warn("Reconciling a refund Stripe already held — a previous attempt did not persist", {
        orderId,
        refundId: reusable.refundId,
      }),
      reusable)
    // (5) Create it, keyed deterministically so a near-term retry and any concurrent double-submit racing
    // step (3) both replay instead of duplicating.
    : await driver.refund(order.payment_intent_id, order.amount_minor, refundKey(orderId));

  // (6) Persist. If this throws, the endpoint is safe to call again at any delay: step (3) finds the refund
  // and step (4) reconciles it.
  await withTransaction(masterKnex, async (trx) => {
    const locked = await repo.lockOrder(orderId, trx);
    if (!locked) throw new NotFoundError("Order not found");
    if (locked.payment_refund_id) return;
    await repo.updateOrder(
      orderId,
      {
        status: "refunded",
        refunded_at: new Date(),
        payment_refund_id: result.refundId,
        payment_provider: driver.name,
      },
      trx,
    );
  });

  return getOne(orderId, userId);
}

// ─── Summary ───────────────────────────────────────────────────────────────

export interface SummaryDto {
  /**
   * Per-currency order-value totals, never converted between currencies.
   *
   * `held_minor` is paid-but-unconfirmed order value and `confirmed_minor` is completed order value.
   * Neither is money the seller has received: there are no payouts in this phase, which `payouts_live`
   * states explicitly so the client cannot present these as earnings in hand.
   */
  totals: repo.CurrencyTotals[];
  listings_count: number;
  purchases_count: number;
  received_count: number;
  payouts_live: false;
}

export async function summary(userId: number): Promise<SummaryDto> {
  const [totals, listingsCount, purchasesCount] = await Promise.all([
    repo.summariseProviderOrders(userId),
    repo.countListings(userId),
    repo.countPurchases(userId),
  ]);
  return {
    totals,
    listings_count: listingsCount,
    purchases_count: purchasesCount,
    received_count: totals.reduce((sum, t) => sum + t.orders_count, 0),
    payouts_live: false,
  };
}

export { TERMINAL_ORDER_STATUSES };
