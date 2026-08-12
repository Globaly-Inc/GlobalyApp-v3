// Stripe driver — three form-encoded REST calls, no SDK.
//
// ponytail: no `stripe` dependency. The SDK's real value is webhook signature verification and Connect,
// and this phase has neither: settlement is verify-on-return and there are no payouts. Add the SDK the day
// a webhook or a Connect account lands — this file is the only thing that changes, because every caller
// goes through PaymentDriver.

import { config } from "../../../config.js";
import { createChildLogger } from "../../../shared/logger.js";
import type { PaymentDriver, PaymentRefund, PaymentSession } from "./types.js";

const logger = createChildLogger("payments-stripe");

const API = "https://api.stripe.com/v1";

async function call<T>(
  path: string,
  init: { method: "GET" | "POST"; form?: Record<string, string>; idempotencyKey?: string },
): Promise<T> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${config.STRIPE_SECRET_KEY}`,
  };
  if (init.form) headers["Content-Type"] = "application/x-www-form-urlencoded";
  // Stripe scopes idempotency keys per-endpoint, so the same key on refunds cannot collide with anything else.
  if (init.idempotencyKey) headers["Idempotency-Key"] = init.idempotencyKey;

  const res = await fetch(`${API}${path}`, {
    method: init.method,
    headers,
    ...(init.form ? { body: new URLSearchParams(init.form).toString() } : {}),
  });

  const body = (await res.json()) as { error?: { message?: string; code?: string } };
  if (!res.ok) {
    const message = body.error?.message ?? `Stripe ${res.status}`;
    logger.error("Stripe call failed", { path, status: res.status, code: body.error?.code });
    throw new Error(`Stripe: ${message}`);
  }
  return body as T;
}

interface StripeSession {
  id: string;
  payment_status: string;
  amount_total: number | null;
  currency: string | null;
  // Expanded or not, Stripe returns either the id or the object depending on the request.
  payment_intent: string | { id: string } | null;
}

interface StripeRefund {
  id: string;
  amount: number;
  status: string;
}

function intentId(value: StripeSession["payment_intent"]): string | null {
  if (!value) return null;
  return typeof value === "string" ? value : value.id;
}

export const stripeDriver: PaymentDriver = {
  name: "stripe",

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
