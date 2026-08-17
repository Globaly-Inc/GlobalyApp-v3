// Stripe webhook settlement.
//
// Two independent guarantees, because one is not enough:
//
//  1. AUTHENTICITY — the raw body must carry a valid HMAC signature under
//     STRIPE_WEBHOOK_SECRET. No secret configured means 503, never "assume it's
//     genuine". A tampered body means 400.
//  2. EXACTLY ONCE — the provider event id is claimed in `billing_events` inside
//     the same transaction that settles it, and every wallet movement additionally
//     carries a UNIQUE idempotency key. Stripe retries aggressively; a redelivery
//     must move no money.

import { masterKnex } from "../../../core/db/master-pool.js";
import { BadRequestError } from "../../../shared/errors.js";
import { createChildLogger } from "../../../shared/logger.js";
import type { BillingInterval } from "../consts.js";
import * as repo from "../repositories/billing.repository.js";
import { grantCredits } from "./credits.service.js";
import { markSubscriptionStatus, settleSubscription } from "./subscriptions.service.js";
import { config } from "../../../config.js";
import { isWebhookConfigured, StripeUnavailableError } from "./stripe.client.js";
import { SignatureVerificationError, verifySignature } from "./stripe.signature.js";

const logger = createChildLogger("billing-webhook");

/**
 * A Stripe event payload is arbitrary provider JSON — the shape is Stripe's, not
 * ours, and every read below narrows explicitly.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type StripeObject = Record<string, any>;

interface StripeEvent {
  id: string;
  type: string;
  data: { object: StripeObject };
}

export interface WebhookResult {
  received: true;
  duplicate: boolean;
  handled: boolean;
  event_type: string;
}

// ── Payload shaping ─────────────────────────────────────────────────────────

/** Pull the fields we care about out of a raw Stripe subscription object. */
export function parseRemoteSubscription(object: StripeObject) {
  const item = object.items?.data?.[0] ?? {};
  const interval: BillingInterval = item.price?.recurring?.interval === "year" ? "year" : "month";
  return {
    id: String(object.id),
    status: String(object.status ?? "incomplete"),
    price_id: item.price?.id ? String(item.price.id) : null,
    interval,
    current_period_start: object.current_period_start ?? null,
    current_period_end: object.current_period_end ?? null,
    cancel_at: object.cancel_at ?? null,
  };
}

function customerIdOf(object: StripeObject): string | null {
  const customer = object.customer;
  if (!customer) return null;
  return typeof customer === "string" ? customer : String(customer.id ?? "") || null;
}

/**
 * Which business does this event belong to? Metadata first (we set it when we
 * opened the checkout), then the subscription id, then the customer id.
 */
async function resolveBusinessId(object: StripeObject, trx: repo.Db): Promise<number | null> {
  const fromMetadata = Number(object.metadata?.business_id);
  if (Number.isInteger(fromMetadata) && fromMetadata > 0) return fromMetadata;

  const subscriptionId =
    typeof object.subscription === "string"
      ? object.subscription
      : object.object === "subscription"
        ? String(object.id)
        : null;
  if (subscriptionId) {
    const existing = await repo.findSubscriptionByStripeId(subscriptionId, trx);
    if (existing) return existing.business_id;
  }

  const customerId = customerIdOf(object);
  if (customerId) {
    const byCustomer = await repo.findSubscriptionByCustomer(customerId, trx);
    if (byCustomer) return byCustomer.business_id;
  }
  return null;
}

// ── Handlers ────────────────────────────────────────────────────────────────

async function handleCheckoutCompleted(
  event: StripeEvent,
  businessId: number,
  trx: repo.Db,
): Promise<boolean> {
  const session = event.data.object;
  if (session.metadata?.kind !== "credit_purchase") {
    // Subscription checkouts are settled by customer.subscription.created/updated,
    // whose payload already carries the period and price. No extra API call here.
    return false;
  }
  if (session.payment_status !== "paid") return false;

  const credits = Number(session.metadata?.credits ?? 0);
  if (!Number.isInteger(credits) || credits <= 0) {
    logger.warn("credit purchase webhook with no credit quantity", { eventId: event.id });
    return false;
  }

  await grantCredits(
    {
      businessId,
      amount: credits,
      transactionType: "purchase",
      bucket: "purchased",
      description: `Credit purchase (${credits} credits)`,
      referenceType: "stripe_session",
      referenceId: String(session.id),
      // Same key the browser-side verify uses, so whichever lands first wins.
      idempotencyKey: `stripe:checkout:${session.id}`,
    },
    trx,
  );
  return true;
}

async function handleSubscriptionChanged(
  event: StripeEvent,
  businessId: number,
  trx: repo.Db,
): Promise<boolean> {
  const object = event.data.object;
  await settleSubscription(
    {
      businessId,
      remote: parseRemoteSubscription(object),
      customerId: customerIdOf(object),
      planCode: object.metadata?.plan_code ?? null,
      idempotencyKey: `stripe:subscription:${object.id}:${object.current_period_start ?? "0"}`,
    },
    trx,
  );
  return true;
}

async function handleSubscriptionDeleted(businessId: number, trx: repo.Db): Promise<boolean> {
  const existing = await repo.findSubscription(businessId, trx);
  if (!existing) return false;
  await markSubscriptionStatus(existing.id, "canceled", trx);
  return true;
}

async function handlePaymentFailed(businessId: number, trx: repo.Db): Promise<boolean> {
  const existing = await repo.findSubscription(businessId, trx);
  if (!existing) return false;
  await markSubscriptionStatus(existing.id, "past_due", trx);
  return true;
}

// ── Entry point ─────────────────────────────────────────────────────────────

/**
 * Verify, de-duplicate and settle. Throws StripeUnavailableError (503) when the
 * platform cannot authenticate webhooks at all, and BadRequestError (400) when
 * the payload does not match its signature.
 */
export async function handleStripeWebhook(
  rawBody: Buffer | string,
  signatureHeader: string | undefined,
): Promise<WebhookResult> {
  if (!isWebhookConfigured()) {
    throw new StripeUnavailableError("Stripe webhooks are not configured");
  }

  try {
    verifySignature(rawBody, signatureHeader, config.STRIPE_WEBHOOK_SECRET!);
  } catch (err) {
    if (err instanceof SignatureVerificationError) {
      logger.warn("rejected webhook", { reason: err.message });
      throw new BadRequestError(`Webhook signature verification failed: ${err.message}`);
    }
    throw err;
  }

  let event: StripeEvent;
  try {
    event = JSON.parse(typeof rawBody === "string" ? rawBody : rawBody.toString("utf8"));
  } catch {
    throw new BadRequestError("Webhook body is not valid JSON");
  }
  if (!event?.id || !event?.type || !event?.data?.object) {
    throw new BadRequestError("Webhook body is not a Stripe event");
  }

  return masterKnex.transaction(async (trx) => {
    const businessId = await resolveBusinessId(event.data.object, trx);

    // Claim first: a redelivery hits the unique index and settles nothing.
    const claimed = await repo.claimEvent(
      { provider: "stripe", eventId: event.id, eventType: event.type, businessId, payload: event },
      trx,
    );
    if (!claimed) {
      logger.info("duplicate webhook ignored", { eventId: event.id, type: event.type });
      return { received: true as const, duplicate: true, handled: false, event_type: event.type };
    }

    if (businessId === null) {
      // Acknowledged so Stripe stops retrying, but recorded as unhandled — the
      // billing_events row is the audit trail for reconciliation.
      logger.warn("webhook could not be mapped to a business", { eventId: event.id, type: event.type });
      return { received: true as const, duplicate: false, handled: false, event_type: event.type };
    }

    let handled = false;
    switch (event.type) {
      case "checkout.session.completed":
        handled = await handleCheckoutCompleted(event, businessId, trx);
        break;
      case "customer.subscription.created":
      case "customer.subscription.updated":
        handled = await handleSubscriptionChanged(event, businessId, trx);
        break;
      case "customer.subscription.deleted":
        handled = await handleSubscriptionDeleted(businessId, trx);
        break;
      case "invoice.payment_failed":
        handled = await handlePaymentFailed(businessId, trx);
        break;
      default:
        logger.info("unhandled webhook type", { eventId: event.id, type: event.type });
    }

    return { received: true as const, duplicate: false, handled, event_type: event.type };
  });
}
