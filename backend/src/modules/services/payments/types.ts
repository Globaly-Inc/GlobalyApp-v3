// The payment driver contract.
//
// retrieveSession reports the *raw* session facts and makes no judgement about them. Deciding whether a
// session may settle an order is the order service's job (the six-point reconciliation), not the driver's —
// a driver that returned a bare `paid: boolean` would throw away the amount and currency Stripe exposes
// precisely so the caller can verify them.

export interface PaymentSession {
  sessionId: string;
  /** Stripe's own value: "paid" | "unpaid" | "no_payment_required". Deliberately not a boolean. */
  paymentStatus: string;
  /** Stripe `amount_total`, in minor units. Null when the session has no total. */
  amountTotalMinor: number | null;
  /** Stripe returns this lowercase ("aud"), so any comparison must normalise case. */
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

export interface CheckoutRequest {
  orderId: number;
  amountMinor: number;
  currency: string;
  productName: string;
  description?: string | null;
  buyerEmail?: string | null;
  successUrl: string;
  cancelUrl: string;
}

export interface CheckoutSession {
  sessionId: string;
  /** Where to send the buyer to pay. */
  url: string;
}

export interface PaymentDriver {
  readonly name: "stripe" | "dev";
  createCheckoutSession(request: CheckoutRequest): Promise<CheckoutSession>;
  retrieveSession(sessionId: string): Promise<PaymentSession>;
  /** Every refund the provider already holds for this PaymentIntent. The long-delay recovery path. */
  listRefunds(paymentIntentId: string): Promise<PaymentRefund[]>;
  /**
   * Create a refund. `idempotencyKey` must be deterministic per order so a retry is the *same* request.
   * That only covers Stripe's 24h replay guarantee — see the service layer's listRefunds check for the rest.
   */
  refund(paymentIntentId: string, amountMinor: number, idempotencyKey: string): Promise<PaymentRefund>;
}
