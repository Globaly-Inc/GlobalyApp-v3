// Dev driver — no payment provider configured.
//
// The session facts are encoded in the session id itself rather than echoed back from the order:
//
//     dev_<paymentStatus>_<amountMinor>_<currency>_<pi|nopi>_<nonce>
//     dev_paid_5000_AUD_pi_a3f21b
//
// This matters. If retrieveSession simply mirrored the order it was being checked against, the six-point
// reconciliation in orders.service would pass vacuously and not one of its rules would be demonstrable —
// locally or in tests. A deliberately mismatched id is what proves the amount and currency rejections work.
//
// Selected only when STRIPE_SECRET_KEY is unset, and getDriver() refuses to hand it back in production. See
// index.ts for why that guard lives there and not here.

import { randomBytes } from "crypto";
import type { PaymentDriver, PaymentRefund, PaymentSession } from "./types.js";

export interface DevSessionSpec {
  paymentStatus?: string;
  amountMinor: number;
  currency: string;
  withIntent?: boolean;
}

/** Build a dev session id. The seed script and the tests are its only producers. */
export function makeDevSessionId(spec: DevSessionSpec): string {
  const status = spec.paymentStatus ?? "paid";
  const flag = spec.withIntent === false ? "nopi" : "pi";
  return `dev_${status}_${spec.amountMinor}_${spec.currency}_${flag}_${randomBytes(3).toString("hex")}`;
}

// ─── In-memory provider stand-in ───────────────────────────────────────────
// Process-local, which is all a dev driver needs. Refunds are indexed by PaymentIntent (what listRefunds
// queries) and separately by idempotency key (what a replay hits).

const refundsByIntent = new Map<string, PaymentRefund[]>();
const refundsByKey = new Map<string, PaymentRefund>();

export const devDriver: PaymentDriver = {
  name: "dev",

  async retrieveSession(sessionId: string): Promise<PaymentSession> {
    // An unparseable id is reported as an unusable session rather than throwing, so a junk `?session_id=`
    // fails reconciliation with a clear 4xx instead of a 500.
    const parts = sessionId.split("_");
    if (parts.length !== 6 || parts[0] !== "dev") {
      return { sessionId, paymentStatus: "unpaid", amountTotalMinor: null, currency: null, paymentIntentId: null };
    }
    const [, paymentStatus, amount, currency, flag, nonce] = parts;
    return {
      sessionId,
      paymentStatus,
      amountTotalMinor: /^\d+$/.test(amount) ? Number(amount) : null,
      // Lowercased on purpose: Stripe returns lowercase currency, so the case-normalising comparison in
      // orders.service is exercised here too, not only against real Stripe.
      currency: currency ? currency.toLowerCase() : null,
      paymentIntentId: flag === "nopi" ? null : `pi_dev_${nonce}`,
    };
  },

  async listRefunds(paymentIntentId: string): Promise<PaymentRefund[]> {
    return [...(refundsByIntent.get(paymentIntentId) ?? [])];
  },

  async refund(paymentIntentId: string, amountMinor: number, idempotencyKey: string): Promise<PaymentRefund> {
    const replayed = refundsByKey.get(idempotencyKey);
    if (replayed) return replayed;

    const created: PaymentRefund = {
      refundId: `re_dev_${randomBytes(6).toString("hex")}`,
      amountMinor,
      status: "succeeded",
    };
    refundsByKey.set(idempotencyKey, created);
    refundsByIntent.set(paymentIntentId, [...(refundsByIntent.get(paymentIntentId) ?? []), created]);
    return created;
  },
};

// ─── Test surface ──────────────────────────────────────────────────────────
// Called only from tests. It lives on the dev driver rather than behind an injection seam because the dev
// driver is already the non-production path — there is nothing here for production code to reach.

/** Drop every idempotency key while keeping the refunds. Simulates Stripe pruning keys after 24h. */
export function __expireIdempotencyKeys(): void {
  refundsByKey.clear();
}

/** Pre-seed a refund the provider "already holds" with no local row — the Stripe-ok/DB-failed state. */
export function __seedRefund(paymentIntentId: string, amountMinor: number): PaymentRefund {
  const seeded: PaymentRefund = {
    refundId: `re_dev_${randomBytes(6).toString("hex")}`,
    amountMinor,
    status: "succeeded",
  };
  refundsByIntent.set(paymentIntentId, [...(refundsByIntent.get(paymentIntentId) ?? []), seeded]);
  return seeded;
}

export function __countRefunds(paymentIntentId: string): number {
  return (refundsByIntent.get(paymentIntentId) ?? []).length;
}

export function __resetRefunds(): void {
  refundsByIntent.clear();
  refundsByKey.clear();
}
