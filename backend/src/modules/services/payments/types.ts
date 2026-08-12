// The payment driver contract.
//
// retrieveSession reports the *raw* session facts and makes no judgement about them. Deciding whether a
// session may settle an order is the order service's job (six-point reconciliation), not the driver's — a
// driver that returns a bare `paid: boolean` throws away the amount and currency Stripe exposes precisely
// so the caller can verify them.

export interface PaymentSession {
  sessionId: string;
  /** Stripe's own value: "paid" | "unpaid" | "no_payment_required". Not normalised to a boolean. */
  paymentStatus: string;
  /** Stripe `amount_total`, in minor units. Null when the session has no total yet. */
  amountTotalMinor: number | null;
  /** Stripe returns this lowercase ("aud"). Comparison must normalise case. */
  currency: string | null;
  /** `payment_intent` — what a refund is issued against. */
  paymentIntentId: string | null;
}

export interface PaymentRefund {
  refundId: string;
  amountMinor: number;
  /** Stripe's own value: "succeeded" | "pending" | "failed" | "canceled". */
  status: string;
}

export interface PaymentDriver {
  readonly name: "stripe" | "dev";
  retrieveSession(sessionId: string): Promise<PaymentSession>;
  /** Every refund Stripe already holds for this PaymentIntent. The long-delay recovery path. */
  listRefunds(paymentIntentId: string): Promise<PaymentRefund[]>;
  /**
   * Create a refund. `idempotencyKey` must be deterministic per order so a retry is the *same* request.
   * Note this only covers Stripe's 24h replay guarantee — see the service layer's listRefunds check.
   */
  refund(paymentIntentId: string, amountMinor: number, idempotencyKey: string): Promise<PaymentRefund>;
}
