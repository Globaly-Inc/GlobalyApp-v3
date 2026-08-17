// Credit wallet service — balance, ledger, spend, grant, and Stripe top-up.
//
// Behavioural spec: V1 edge functions `purchase-credits` / `verify-credit-purchase`.

import { masterKnex } from "../../../core/db/master-pool.js";
import { NotFoundError } from "../../../shared/errors.js";
import {
  buildPaginatedResponse,
  paginationToOffset,
  type PaginationInput,
} from "../../../shared/pagination.js";
import { createChildLogger } from "../../../shared/logger.js";
import { CREDIT_CURRENCY, CREDIT_UNIT_PRICE_MINOR, type TransactionType } from "../consts.js";
import { InsufficientCreditsError } from "../errors.js";
import * as repo from "../repositories/billing.repository.js";
import { getStripeClient } from "./stripe.client.js";
import type { PurchaseCreditsInput, SpendCreditsInput } from "../schemas/billing.schema.js";

const logger = createChildLogger("billing-credits");

export interface CreditMovement {
  businessId: number;
  amount: number;
  transactionType: TransactionType;
  bucket: "subscription" | "purchased";
  description?: string | null;
  referenceType?: string | null;
  referenceId?: string | null;
  performedBy?: number | null;
  /** Present for anything an external system can retry. Enforced by a UNIQUE index. */
  idempotencyKey?: string | null;
}

// ── Reads ───────────────────────────────────────────────────────────────────

export async function getBalance(businessId: number) {
  const wallet = await repo.findBusinessWallet(businessId);
  // A business that has never transacted has no wallet row yet; report zeroes
  // rather than 404, so the UI does not need a special "not provisioned" state.
  return {
    balance: wallet?.balance ?? 0,
    subscription_balance: wallet?.subscription_balance ?? 0,
    purchased_balance: wallet?.purchased_balance ?? 0,
    lifetime_earned: wallet?.lifetime_earned ?? 0,
    lifetime_spent: wallet?.lifetime_spent ?? 0,
    credit_unit_price_minor: CREDIT_UNIT_PRICE_MINOR,
    currency: CREDIT_CURRENCY,
  };
}

export async function listTransactions(businessId: number, pagination: PaginationInput) {
  const wallet = await repo.findBusinessWallet(businessId);
  if (!wallet) return buildPaginatedResponse([], 0, pagination);

  const { limit, offset } = paginationToOffset(pagination);
  const [rows, total] = await Promise.all([
    repo.listTransactions(wallet.id, limit, offset),
    repo.countTransactions(wallet.id),
  ]);
  return buildPaginatedResponse(rows, total, pagination);
}

// ── Writes ──────────────────────────────────────────────────────────────────

/**
 * Add credits and write the matching ledger row, atomically.
 *
 * When `idempotencyKey` is supplied a replay hits the UNIQUE index on
 * credit_transactions.idempotency_key, the whole transaction rolls back, and the
 * already-settled row is returned. That is what makes a duplicated Stripe
 * delivery settle exactly once even if the billing_events claim is bypassed.
 */
export async function grantCredits(movement: CreditMovement, existingTrx?: repo.Db) {
  const run = async (trx: repo.Db) => {
    if (movement.idempotencyKey) {
      const already = await trx<repo.TransactionRow>("credit_transactions")
        .where({ idempotency_key: movement.idempotencyKey })
        .first();
      if (already) return { transaction: already, duplicate: true as const };
    }

    const wallet = await repo.ensureBusinessWallet(movement.businessId, trx);
    const updated = await repo.creditWallet(wallet.id, movement.amount, movement.bucket, trx);

    const transaction = await repo.insertTransaction(
      {
        wallet_id: wallet.id,
        transaction_type: movement.transactionType,
        amount: movement.amount,
        balance_after: updated.balance,
        subscription_amount: movement.bucket === "subscription" ? movement.amount : null,
        purchased_amount: movement.bucket === "purchased" ? movement.amount : null,
        description: movement.description ?? null,
        reference_type: movement.referenceType ?? null,
        reference_id: movement.referenceId ?? null,
        performed_by: movement.performedBy ?? null,
        idempotency_key: movement.idempotencyKey ?? null,
      },
      trx,
    );

    return { transaction, duplicate: false as const };
  };

  return existingTrx ? run(existingTrx) : masterKnex.transaction(run);
}

/**
 * Debit credits. Throws InsufficientCreditsError (402) rather than ever letting a
 * balance go negative — see repo.debitWallet for the locking that makes this safe
 * when many spends land at once.
 */
export async function spendCredits(
  businessId: number,
  input: SpendCreditsInput,
  performedBy: number | null,
  existingTrx?: repo.Db,
) {
  const run = async (trx: repo.Db) => {
    if (input.idempotency_key) {
      const already = await trx<repo.TransactionRow>("credit_transactions")
        .where({ idempotency_key: input.idempotency_key })
        .first();
      if (already) return { transaction: already, balance: already.balance_after, duplicate: true as const };
    }

    const wallet = await repo.ensureBusinessWallet(businessId, trx);
    const updated = await repo.debitWallet(wallet.id, input.amount, trx);
    if (!updated) {
      // Re-read under the same transaction so the reported figure is the one the
      // guard actually rejected against.
      const current = await repo.findBusinessWallet(businessId, trx);
      throw new InsufficientCreditsError(input.amount, current?.balance ?? 0);
    }

    const subscriptionSpent = Number(updated.subscription_spent);
    const transaction = await repo.insertTransaction(
      {
        wallet_id: wallet.id,
        transaction_type: input.transaction_type,
        amount: -input.amount,
        balance_after: updated.balance,
        subscription_amount: subscriptionSpent > 0 ? -subscriptionSpent : null,
        purchased_amount:
          input.amount - subscriptionSpent > 0 ? -(input.amount - subscriptionSpent) : null,
        description: input.description ?? null,
        reference_type: input.reference_type ?? null,
        reference_id: input.reference_id ?? null,
        performed_by: performedBy,
        idempotency_key: input.idempotency_key ?? null,
      },
      trx,
    );

    return { transaction, balance: updated.balance, duplicate: false as const };
  };

  return existingTrx ? run(existingTrx) : masterKnex.transaction(run);
}

// ── Stripe top-up ───────────────────────────────────────────────────────────

/**
 * V1 `purchase-credits`. Everything except the outbound call runs first: the
 * wallet is provisioned, the coupon is validated, the amount is priced. Only then
 * do we reach for Stripe — which is a 503 when the platform has no keys.
 */
export async function startCreditPurchase(
  business: { id: number; email: string | null; customer_id: string | null },
  input: PurchaseCreditsInput,
  performedBy: number,
) {
  const wallet = await repo.ensureBusinessWallet(business.id);
  const amountMinor = input.credits * CREDIT_UNIT_PRICE_MINOR;

  if (input.coupon_code) {
    const coupon = await repo.findCouponByCode(input.coupon_code);
    if (!coupon || !coupon.is_active) throw new NotFoundError("Coupon not found");
  }

  const clientReferenceId = `credits:${business.id}:${wallet.id}:${Date.now()}`;

  const session = await getStripeClient().createCheckoutSession({
    mode: "payment",
    priceId: null,
    unitAmount: CREDIT_UNIT_PRICE_MINOR,
    currency: CREDIT_CURRENCY,
    productName: `${input.credits} GlobalyHub credits`,
    quantity: input.credits,
    customerId: business.customer_id,
    customerEmail: business.email,
    successUrl: input.success_url,
    cancelUrl: input.cancel_url,
    clientReferenceId,
    metadata: {
      kind: "credit_purchase",
      business_id: String(business.id),
      credits: String(input.credits),
      performed_by: String(performedBy),
    },
  });

  logger.info("credit checkout opened", { businessId: business.id, credits: input.credits, amountMinor });
  return { session_id: session.id, url: session.url, credits: input.credits, amount_minor: amountMinor };
}

/**
 * V1 `verify-credit-purchase`. Polled by the browser on return from Stripe; the
 * webhook settles the same session with the same idempotency key, so whichever
 * arrives first wins and the other is a no-op.
 */
export async function verifyCreditPurchase(businessId: number, sessionId: string, performedBy: number) {
  const session = await getStripeClient().retrieveCheckoutSession(sessionId);

  if (session.metadata.business_id && Number(session.metadata.business_id) !== businessId) {
    throw new NotFoundError("Checkout session not found");
  }
  if (session.payment_status !== "paid") {
    return { settled: false, payment_status: session.payment_status, balance: (await getBalance(businessId)).balance };
  }

  const credits = Number(session.metadata.credits ?? 0);
  if (!Number.isInteger(credits) || credits <= 0) {
    throw new NotFoundError("Checkout session carries no credit quantity");
  }

  const { transaction, duplicate } = await grantCredits({
    businessId,
    amount: credits,
    transactionType: "purchase",
    bucket: "purchased",
    description: `Credit purchase (${credits} credits)`,
    referenceType: "stripe_session",
    referenceId: session.id,
    performedBy,
    idempotencyKey: `stripe:checkout:${session.id}`,
  });

  return { settled: true, duplicate, balance: transaction.balance_after, credits };
}
