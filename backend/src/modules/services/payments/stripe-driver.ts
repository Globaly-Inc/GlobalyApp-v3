// Stripe driver — form-encoded REST over fetch, no SDK.
//
// ponytail: no `stripe` dependency. The SDK's real value is webhook signature verification and Connect, and
// this phase has neither: settlement is verify-on-return and there are no payouts. Add the SDK the day a
// webhook or a Connect account lands — this file is the only thing that changes, because every caller goes
// through the PaymentDriver interface.

import { config } from "../../../config.js";
import { createChildLogger } from "../../../shared/logger.js";
import type { CheckoutSession, PaymentDriver, PaymentRefund, PaymentSession } from "./types.js";

const logger = createChildLogger("payments-stripe");

const API = "https://api.stripe.com/v1";

async function call<T>(
  path: string,
  init: { method: "GET" | "POST"; form?: Record<string, string>; idempotencyKey?: string },
): Promise<T> {
  const headers: Record<string, string> = { Authorization: `Bearer ${config.STRIPE_SECRET_KEY}` };
  if (init.form) headers["Content-Type"] = "application/x-www-form-urlencoded";
  // Stripe scopes idempotency keys per endpoint, so a refund key cannot collide with anything else.
  if (init.idempotencyKey) headers["Idempotency-Key"] = init.idempotencyKey;

  const res = await fetch(`${API}${path}`, {
    method: init.method,
    headers,
    ...(init.form ? { body: new URLSearchParams(init.form).toString() } : {}),
  });

  const body = (await res.json()) as { error?: { message?: string; code?: string } };
  if (!res.ok) {
    logger.error("Stripe call failed", { path, status: res.status, code: body.error?.code });
    throw new Error(`Stripe: ${body.error?.message ?? `HTTP ${res.status}`}`);
  }
  return body as T;
}

interface StripeSession {
  id: string;
  payment_status: string;
  amount_total: number | null;
  currency: string | null;
  // Stripe returns either the id or the expanded object depending on the request.
  payment_intent: string | { id: string } | null;
}

interface StripeRefund {
  id: string;
  amount: number;
  status: string;
}

const intentId = (value: StripeSession["payment_intent"]): string | null =>
  !value ? null : typeof value === "string" ? value : value.id;

export const stripeDriver: PaymentDriver = {
  name: "stripe",

  async createCheckoutSession(req): Promise<CheckoutSession> {
    // Form-encoded nested keys are how Stripe takes line items over the REST API.
    const form: Record<string, string> = {
      mode: "payment",
      "line_items[0][quantity]": "1",
      "line_items[0][price_data][currency]": req.currency.toLowerCase(),
      // The amount the caller computed from the listing — never a client-supplied figure.
      "line_items[0][price_data][unit_amount]": String(req.amountMinor),
      "line_items[0][price_data][product_data][name]": req.productName,
      success_url: req.successUrl,
      cancel_url: req.cancelUrl,
      // Echoed back on the session so verification can cross-check the order it claims to settle.
      "metadata[order_id]": String(req.orderId),
    };
    if (req.description) form["line_items[0][price_data][product_data][description]"] = req.description;
    if (req.buyerEmail) form.customer_email = req.buyerEmail;

    const session = await call<{ id: string; url: string | null }>("/checkout/sessions", {
      method: "POST",
      form,
      // One checkout per order: a double-submitted Buy resumes the same session instead of creating a
      // second one the buyer could also pay.
      idempotencyKey: `service-order-checkout-${req.orderId}`,
    });
    if (!session.url) throw new Error("Stripe returned a session with no URL");
    return { sessionId: session.id, url: session.url };
  },

  async retrieveSession(sessionId: string): Promise<PaymentSession> {
    const s = await call<StripeSession>(`/checkout/sessions/${encodeURIComponent(sessionId)}`, { method: "GET" });
    return {
      sessionId: s.id,
      paymentStatus: s.payment_status,
      amountTotalMinor: s.amount_total,
      currency: s.currency,
      paymentIntentId: intentId(s.payment_intent),
    };
  },

  async listRefunds(paymentIntentId: string): Promise<PaymentRefund[]> {
    const res = await call<{ data: StripeRefund[] }>(
      `/refunds?payment_intent=${encodeURIComponent(paymentIntentId)}&limit=100`,
      { method: "GET" },
    );
    return res.data.map((r) => ({ refundId: r.id, amountMinor: r.amount, status: r.status }));
  },

  async refund(paymentIntentId: string, amountMinor: number, idempotencyKey: string): Promise<PaymentRefund> {
    const r = await call<StripeRefund>("/refunds", {
      method: "POST",
      form: { payment_intent: paymentIntentId, amount: String(amountMinor) },
      idempotencyKey,
    });
    return { refundId: r.id, amountMinor: r.amount, status: r.status };
  },
};
