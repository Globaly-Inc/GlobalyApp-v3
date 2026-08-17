// Billing constants — mirrored from the V1 check constraints so the migrated data
// and the API agree on the same vocabulary.

export const TRANSACTION_TYPES = [
  "subscription_grant",
  "purchase",
  "enquiry_unlock",
  "ad_spend",
  "ai_deduct",
  "referral_reward",
  "profile_bonus",
  "refund",
  "manual_adjustment",
] as const;

export type TransactionType = (typeof TRANSACTION_TYPES)[number];

export const SUBSCRIPTION_STATUSES = [
  "trialing",
  "active",
  "past_due",
  "canceled",
  "expired",
] as const;

export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

/** Statuses that still entitle a business to its plan's features. */
export const ENTITLED_STATUSES: readonly SubscriptionStatus[] = ["trialing", "active"];

export const BILLING_INTERVALS = ["month", "year"] as const;
export type BillingInterval = (typeof BILLING_INTERVALS)[number];

/** Stripe webhook types this module knows how to settle. Anything else is logged and ack'd. */
export const HANDLED_WEBHOOK_TYPES = [
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.payment_failed",
] as const;

/** Stripe's own default replay window for `Stripe-Signature`, in seconds. */
export const SIGNATURE_TOLERANCE_SECONDS = 300;

/**
 * Price of one credit, in minor units of CREDIT_CURRENCY.
 * V1 sold 50 credits for $10 AUD (credit_transactions: "Manual grant: Stripe
 * payment verified offline ($10 AUD)", amount 50), i.e. 20c per credit.
 * ponytail: a flat rate, because V1 had exactly one rate. Move it onto
 * subscription_plans when volume tiers actually exist.
 */
export const CREDIT_UNIT_PRICE_MINOR = 20;
export const CREDIT_CURRENCY = "AUD";
