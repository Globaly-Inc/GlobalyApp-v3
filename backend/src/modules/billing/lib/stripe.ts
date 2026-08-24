// Subscription billing over Stripe's REST API — same form-encoded-over-fetch style as
// other-services/payments/stripe-driver.ts, kept separate because subscriptions are a different
// product shape (recurring price, customer portal, webhook-driven state) built around a business
// rather than a one-time order.
//
// ponytail: no `stripe` SDK. Webhook signature verification is one HMAC check (Stripe documents the
// exact algorithm below) — not enough to justify the dependency the rest of this codebase's payment
// code has deliberately avoided.

import { createHmac, timingSafeEqual } from "node:crypto";
import { config } from "../../../config.js";
import { createChildLogger } from "../../../shared/logger.js";

const logger = createChildLogger("billing-stripe");
const API = "https://api.stripe.com/v1";

async function call<T>(path: string, form: Record<string, string>): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.STRIPE_SECRET_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(form).toString(),
  });
  const body = (await res.json()) as { error?: { message?: string; code?: string } };
  if (!res.ok) {
    logger.error("Stripe call failed", { path, status: res.status, code: body.error?.code });
    throw new Error(`Stripe: ${body.error?.message ?? `HTTP ${res.status}`}`);
  }
  return body as T;
}

export interface SubscriptionCheckoutRequest {
  businessId: number;
  planCode: string;
  priceMinor: number;
  currency: string;
  planName: string;
  buyerEmail?: string | null;
  existingCustomerId?: string | null;
  successUrl: string;
  cancelUrl: string;
}

export async function createSubscriptionCheckoutSession(
  req: SubscriptionCheckoutRequest,
): Promise<{ sessionId: string; url: string }> {
  const form: Record<string, string> = {
    mode: "subscription",
    "line_items[0][quantity]": "1",
    "line_items[0][price_data][currency]": req.currency.toLowerCase(),
    "line_items[0][price_data][unit_amount]": String(req.priceMinor),
    "line_items[0][price_data][recurring][interval]": "month",
    "line_items[0][price_data][product_data][name]": req.planName,
    success_url: req.successUrl,
    cancel_url: req.cancelUrl,
    "metadata[business_id]": String(req.businessId),
    "metadata[plan_code]": req.planCode,
    "subscription_data[metadata][business_id]": String(req.businessId),
    "subscription_data[metadata][plan_code]": req.planCode,
  };
  if (req.existingCustomerId) form.customer = req.existingCustomerId;
  else if (req.buyerEmail) form.customer_email = req.buyerEmail;

  const session = await call<{ id: string; url: string | null }>("/checkout/sessions", form);
  if (!session.url) throw new Error("Stripe returned a subscription session with no URL");
  return { sessionId: session.id, url: session.url };
}

export async function createBillingPortalSession(
  customerId: string,
  returnUrl: string,
): Promise<{ url: string }> {
  const session = await call<{ url: string }>("/billing_portal/sessions", {
    customer: customerId,
    return_url: returnUrl,
  });
  return { url: session.url };
}

/**
 * Verifies a Stripe webhook signature by hand: the `Stripe-Signature` header carries
 * `t=<timestamp>,v1=<hex hmac>` (possibly several `v1=` pairs during secret rotation); the signed
 * payload is `${timestamp}.${rawBody}`, HMAC-SHA256'd with the endpoint secret.
 * https://docs.stripe.com/webhooks#verify-manually
 */
export function verifyWebhookSignature(rawBody: Buffer, signatureHeader: string | undefined, secret: string): boolean {
  if (!signatureHeader) return false;

  const parts = Object.fromEntries(
    signatureHeader.split(",").map((pair) => {
      const [key, value] = pair.split("=");
      return [key, value] as [string, string];
    }),
  );
  const timestamp = parts.t;
  const signatures = signatureHeader
    .split(",")
    .filter((pair) => pair.startsWith("v1="))
    .map((pair) => pair.slice(3));
  if (!timestamp || signatures.length === 0) return false;

  const expected = createHmac("sha256", secret).update(`${timestamp}.${rawBody.toString("utf8")}`).digest("hex");
  const expectedBuf = Buffer.from(expected, "hex");

  return signatures.some((sig) => {
    const sigBuf = Buffer.from(sig, "hex");
    return sigBuf.length === expectedBuf.length && timingSafeEqual(sigBuf, expectedBuf);
  });
}

export interface StripeWebhookEvent {
  id: string;
  type: string;
  data: { object: Record<string, unknown> };
}
