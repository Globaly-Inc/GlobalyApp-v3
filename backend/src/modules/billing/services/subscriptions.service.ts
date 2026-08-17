// Subscription service — current plan, checkout, verify, portal, access check.
//
// Behavioural spec: V1 edge functions `create-subscription-checkout`,
// `verify-subscription`, `subscription-portal`, `check-subscription-access`.

import { masterKnex } from "../../../core/db/master-pool.js";
import { BadRequestError, ForbiddenError, NotFoundError } from "../../../shared/errors.js";
import { createChildLogger } from "../../../shared/logger.js";
import { ENTITLED_STATUSES, type BillingInterval, type SubscriptionStatus } from "../consts.js";
import { SubscriptionRequiredError } from "../errors.js";
import * as repo from "../repositories/billing.repository.js";
import { getStripeClient, StripeUnavailableError } from "./stripe.client.js";
import { grantCredits } from "./credits.service.js";
import type { SubscriptionCheckoutInput } from "../schemas/billing.schema.js";

const logger = createChildLogger("billing-subscriptions");

export interface BusinessContext {
  id: number;
  email: string | null;
  customer_id: string | null;
}

/** Unix seconds from Stripe -> Date, tolerating nulls. */
export function fromUnix(seconds: number | null | undefined): Date | null {
  return seconds ? new Date(seconds * 1000) : null;
}

/**
 * Is the business currently entitled to its plan?
 *
 * Status alone is not enough: a row can still say "active" after the period it
 * was paid for has run out (Stripe has not told us yet, or the webhook was lost).
 * A lapsed period is treated as lapsed.
 */
export function isEntitled(
  subscription: Pick<repo.SubscriptionRow, "status" | "current_period_end" | "trial_ends_at"> | undefined,
  now: Date = new Date(),
): boolean {
  if (!subscription) return false;
  if (!ENTITLED_STATUSES.includes(subscription.status)) return false;
  const endsAt = subscription.current_period_end ?? subscription.trial_ends_at;
  if (endsAt && new Date(endsAt).getTime() < now.getTime()) return false;
  return true;
}

// ── Reads ───────────────────────────────────────────────────────────────────

export async function listPublicPlans() {
  const plans = await repo.listPlans({ publicOnly: true });
  const features = await repo.listPlanFeatures(plans.map((p) => p.id));
  return plans.map((plan) => ({
    ...plan,
    features: features.filter((f) => f.plan_id === plan.id),
  }));
}

export async function getCurrent(businessId: number) {
  const subscription = await repo.findSubscription(businessId);
  if (!subscription) return { subscription: null, plan: null, entitled: false };

  const plan = await repo.findPlanById(subscription.plan_id);
  return { subscription, plan: plan ?? null, entitled: isEntitled(subscription) };
}

/**
 * V1 `check-subscription-access`. A gate, not a hint:
 *   402 when there is no live subscription (top up / resubscribe),
 *   403 when the live plan simply does not include the feature (upgrade),
 *   200 with the numeric limit when it does.
 */
export async function checkAccess(businessId: number, feature: string) {
  const subscription = await repo.findSubscription(businessId);
  if (!isEntitled(subscription)) {
    throw new SubscriptionRequiredError(feature, subscription?.status ?? "none");
  }

  const plan = await repo.findPlanById(subscription!.plan_id);
  if (!plan) throw new NotFoundError("Subscription plan not found");

  const limit = (plan.limits ?? {})[feature];
  const allowed = limit === true || (typeof limit === "number" && limit !== 0) || (typeof limit === "string" && limit !== "");
  if (!allowed) {
    throw new ForbiddenError(`Plan "${plan.code}" does not include "${feature}"`);
  }

  return {
    allowed: true,
    feature,
    limit: limit === true ? null : limit,
    plan_code: plan.code,
    status: subscription!.status,
    current_period_end: subscription!.current_period_end,
  };
}

// ── Stripe-backed writes ────────────────────────────────────────────────────

function priceIdFor(plan: repo.PlanRow, interval: BillingInterval): string {
  const priceId = interval === "year" ? plan.stripe_annual_price_id : plan.stripe_monthly_price_id;
  if (!priceId) {
    // A configuration gap, not a client mistake — fail closed like a missing key.
    throw new StripeUnavailableError(`Plan "${plan.code}" has no Stripe price for interval "${interval}"`);
  }
  return priceId;
}

export async function startCheckout(business: BusinessContext, input: SubscriptionCheckoutInput) {
  const plan = await repo.findPlanByCode(input.plan_code);
  if (!plan || !plan.is_active) throw new NotFoundError("Subscription plan not found");

  if (input.coupon_code) {
    const coupon = await repo.findCouponByCode(input.coupon_code);
    if (!coupon || !coupon.is_active) throw new NotFoundError("Coupon not found");
    const applicable: string[] = coupon.applicable_plans ?? [];
    if (applicable.length > 0 && !applicable.includes(plan.code)) {
      throw new BadRequestError(`Coupon "${coupon.code}" does not apply to plan "${plan.code}"`);
    }
  }

  const priceId = priceIdFor(plan, input.interval);

  const session = await getStripeClient().createCheckoutSession({
    mode: "subscription",
    priceId,
    unitAmount: null,
    currency: plan.currency,
    productName: plan.name,
    quantity: 1,
    customerId: business.customer_id,
    customerEmail: business.email,
    successUrl: input.success_url,
    cancelUrl: input.cancel_url,
    clientReferenceId: `subscription:${business.id}:${plan.id}:${Date.now()}`,
    metadata: {
      kind: "subscription",
      business_id: String(business.id),
      plan_code: plan.code,
      interval: input.interval,
    },
  });

  logger.info("subscription checkout opened", { businessId: business.id, plan: plan.code });
  return { session_id: session.id, url: session.url, plan_code: plan.code, interval: input.interval };
}

export async function verifySubscription(businessId: number, sessionId: string) {
  const stripe = getStripeClient();
  const session = await stripe.retrieveCheckoutSession(sessionId);

  if (session.metadata.business_id && Number(session.metadata.business_id) !== businessId) {
    throw new NotFoundError("Checkout session not found");
  }
  if (session.status !== "complete" || !session.subscription) {
    return { settled: false, status: session.status };
  }

  const remote = await stripe.retrieveSubscription(session.subscription);
  const result = await settleSubscription({
    businessId,
    remote,
    customerId: session.customer,
    planCode: session.metadata.plan_code ?? null,
    idempotencyKey: `stripe:checkout:${session.id}`,
  });

  return { settled: true, ...result };
}

export async function createPortalLink(business: BusinessContext, returnUrl: string) {
  const subscription = await repo.findSubscription(business.id);
  const customerId = business.customer_id ?? subscription?.stripe_customer_id ?? null;
  if (!customerId) {
    throw new NotFoundError("This business has no billing account yet");
  }
  const { url } = await getStripeClient().createBillingPortalSession({ customerId, returnUrl });
  return { url };
}

// ── Settlement (shared by verify and the webhook) ───────────────────────────

export interface SettleInput {
  businessId: number;
  remote: {
    id: string;
    status: string;
    price_id: string | null;
    interval: BillingInterval;
    current_period_start: number | null;
    current_period_end: number | null;
    cancel_at: number | null;
  };
  customerId: string | null;
  planCode: string | null;
  /** Grants are keyed by this so a redelivery cannot double-credit the wallet. */
  idempotencyKey: string;
}

/** Map a Stripe subscription status onto our own vocabulary. */
export function mapStatus(remoteStatus: string): SubscriptionStatus {
  switch (remoteStatus) {
    case "trialing":
      return "trialing";
    case "active":
      return "active";
    case "past_due":
    case "unpaid":
      return "past_due";
    case "canceled":
      return "canceled";
    default:
      return "expired";
  }
}

/**
 * Write the subscription row, sync `businesses`, and grant the plan's monthly
 * credits — all in one transaction so a partial settlement is impossible.
 */
export async function settleSubscription(input: SettleInput, existingTrx?: repo.Db) {
  const run = async (trx: repo.Db) => {
    const plan =
      (input.planCode ? await repo.findPlanByCode(input.planCode, trx) : undefined) ??
      (input.remote.price_id ? await repo.findPlanByStripePrice(input.remote.price_id, trx) : undefined);
    if (!plan) throw new NotFoundError("Could not resolve a plan for this subscription");

    const status = mapStatus(input.remote.status);
    const periodEnd = fromUnix(input.remote.current_period_end);

    const subscription = await repo.upsertSubscription(
      input.businessId,
      {
        plan_id: plan.id,
        status,
        billing_interval: input.remote.interval,
        stripe_subscription_id: input.remote.id,
        stripe_customer_id: input.customerId,
        current_period_start: fromUnix(input.remote.current_period_start),
        current_period_end: periodEnd,
        trial_ends_at: status === "trialing" ? periodEnd : null,
        canceled_at: status === "canceled" ? new Date() : null,
        downgrade_at: fromUnix(input.remote.cancel_at),
        monthly_credit_grant: plan.monthly_credit_grant,
        personal_credit_per_member: plan.personal_credit_per_member,
      },
      trx,
    );

    let granted = 0;
    if (plan.monthly_credit_grant > 0 && ENTITLED_STATUSES.includes(status)) {
      const { transaction, duplicate } = await grantCredits(
        {
          businessId: input.businessId,
          amount: plan.monthly_credit_grant,
          transactionType: "subscription_grant",
          bucket: "subscription",
          description: `Monthly grant for plan ${plan.code}`,
          referenceType: "subscription",
          referenceId: input.remote.id,
          idempotencyKey: `${input.idempotencyKey}:grant`,
        },
        trx,
      );
      granted = duplicate ? 0 : transaction.amount;
    }

    return { subscription, plan_code: plan.code, status, granted };
  };

  return existingTrx ? run(existingTrx) : masterKnex.transaction(run);
}

/** Status-only update used by cancellation / payment-failure webhooks. */
export async function markSubscriptionStatus(
  subscriptionId: number,
  status: SubscriptionStatus,
  trx: repo.Db,
) {
  await trx("business_subscriptions")
    .where({ id: subscriptionId })
    .update({
      status,
      canceled_at: status === "canceled" ? new Date() : null,
      updated_at: trx.fn.now(),
    });
}
