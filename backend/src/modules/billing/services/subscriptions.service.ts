// Business subscriptions — plan selection, Stripe Checkout (subscription mode), the billing
// portal, and the webhook handlers that keep `businesses.subscription_id/customer_id/plan_code`
// and the credit wallet in sync with what Stripe actually holds.
//
// Unlike other-services/payments' verify-on-return orders, a subscription's state changes on
// Stripe's own schedule (renewals, cancellations, failed invoices) with nobody's browser open to
// trigger a return-URL check — so this module is webhook-driven, not poll-on-return.

import { config } from "../../../config.js";
import { BadRequestError, ConflictError, NotFoundError } from "../../../shared/errors.js";
import { createChildLogger } from "../../../shared/logger.js";
import * as businessRepo from "../../businesses/repositories/businesses.repository.js";
import * as plansRepo from "../repositories/plans.repository.js";
import * as stripe from "../lib/stripe.js";
import * as wallet from "./wallet.service.js";

const logger = createChildLogger("billing-subscriptions");

export async function listPlans() {
  return plansRepo.listActivePlans();
}

export async function getStatus(businessId: string) {
  const business = await businessRepo.findBusinessById(businessId);
  if (!business) throw new NotFoundError("Business not found");
  const balance = await wallet.getBalance(Number(businessId));

  const plan = business.plan_code ? await plansRepo.findByCode(business.plan_code) : undefined;
  return {
    plan_code: business.plan_code ?? null,
    plan_name: plan?.name ?? null,
    subscription_id: business.subscription_id ?? null,
    currency: business.currency ?? null,
    credit_balance: balance,
    has_customer: !!business.customer_id,
  };
}

export async function startSubscriptionCheckout(
  businessId: string,
  planCode: string,
  buyerEmail: string | null,
): Promise<{ url: string }> {
  if (!config.STRIPE_SECRET_KEY) {
    throw new ConflictError("Subscriptions are not configured on this environment yet");
  }

  const business = await businessRepo.findBusinessById(businessId);
  if (!business) throw new NotFoundError("Business not found");

  const plan = await plansRepo.findByCode(planCode);
  if (!plan) throw new BadRequestError("Unknown plan");

  const returnTo = `${config.WEB_APP_URL}/business/billing`;
  const session = await stripe.createSubscriptionCheckoutSession({
    businessId: Number(businessId),
    planCode: plan.code,
    priceMinor: plan.price_minor,
    currency: plan.currency,
    planName: plan.name,
    buyerEmail,
    existingCustomerId: business.customer_id ?? null,
    successUrl: `${returnTo}?checkout=success`,
    cancelUrl: `${returnTo}?checkout=cancelled`,
  });

  return { url: session.url };
}

export async function openBillingPortal(businessId: string): Promise<{ url: string }> {
  const business = await businessRepo.findBusinessById(businessId);
  if (!business) throw new NotFoundError("Business not found");
  if (!business.customer_id) throw new ConflictError("This business has no billing account yet — subscribe to a plan first");

  return stripe.createBillingPortalSession(business.customer_id, `${config.WEB_APP_URL}/business/billing`);
}

// ─── Webhook ────────────────────────────────────────────────────────────────

function readBusinessId(obj: Record<string, unknown>): number | null {
  const metadata = obj.metadata as Record<string, string> | undefined;
  const raw = metadata?.business_id;
  return raw ? Number(raw) : null;
}

export async function handleWebhookEvent(event: stripe.StripeWebhookEvent): Promise<void> {
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as { subscription?: string; customer?: string; mode?: string; metadata?: Record<string, string> };
      if (session.mode !== "subscription") return;
      const businessId = readBusinessId(session as unknown as Record<string, unknown>);
      const planCode = session.metadata?.plan_code;
      if (!businessId || !planCode) {
        logger.warn("checkout.session.completed missing business_id/plan_code metadata", { sessionId: (session as any).id });
        return;
      }

      await businessRepo.updateBusinessProfile(String(businessId), {
        subscription_id: session.subscription ?? null,
        customer_id: session.customer ?? null,
        plan_code: planCode,
      });

      const plan = await plansRepo.findByCode(planCode);
      if (plan?.included_credits) {
        await wallet.grant(businessId, plan.included_credits, "subscription_grant", {
          type: "stripe_checkout_session",
          id: String((session as any).id ?? ""),
        });
      }
      logger.info("Subscription activated", { businessId, planCode });
      return;
    }

    case "customer.subscription.updated": {
      const sub = event.data.object as { id: string; status: string; metadata?: Record<string, string> };
      const businessId = readBusinessId(sub as unknown as Record<string, unknown>);
      if (!businessId) return;
      // Stripe's own cancellation states — treat anything not actively billable as "no plan".
      if (["canceled", "unpaid", "incomplete_expired"].includes(sub.status)) {
        await businessRepo.updateBusinessProfile(String(businessId), { plan_code: null, subscription_id: null });
        logger.info("Subscription ended via update event", { businessId, status: sub.status });
      }
      return;
    }

    case "customer.subscription.deleted": {
      const sub = event.data.object as { metadata?: Record<string, string> };
      const businessId = readBusinessId(sub as unknown as Record<string, unknown>);
      if (!businessId) return;
      await businessRepo.updateBusinessProfile(String(businessId), { plan_code: null, subscription_id: null });
      logger.info("Subscription cancelled", { businessId });
      return;
    }

    default:
      // Every other event type (invoice.*, payment_intent.*, ...) is intentionally ignored for now —
      // the three above are what keeps `businesses` and the wallet correct.
      return;
  }
}
