// Thin internal Stripe client — the only place the module talks to Stripe over HTTP.
//
// FAIL CLOSED. This environment has no Stripe keys and the `stripe` npm package is
// not installed. Rather than stub a success, `getStripeClient()` throws a 503 the
// moment a route needs the network. Routes still run their auth, their validation
// and their database work first, so everything except the outbound call is
// exercised offline and the caller gets an honest "billing is unavailable".
//
// Plugging in the real SDK is a single function body — see createLiveClient().

import { AppError } from "../../../shared/errors.js";
import { config } from "../../../config.js";
import type { BillingInterval } from "../consts.js";

export class StripeUnavailableError extends AppError {
  constructor(message = "Payment provider is not configured") {
    super(message, 503, "STRIPE_UNAVAILABLE");
  }
}

export interface CheckoutSessionParams {
  mode: "payment" | "subscription";
  /** Stripe price id. Null for ad-hoc line items priced by `unitAmount` below. */
  priceId: string | null;
  /** Minor units per unit, for the ad-hoc `price_data` path (credit bundles). */
  unitAmount: number | null;
  currency: string;
  productName: string;
  quantity: number;
  customerId: string | null;
  customerEmail: string | null;
  successUrl: string;
  cancelUrl: string;
  /** Our own correlation id, echoed back by verify and by the webhook. */
  clientReferenceId: string;
  metadata: Record<string, string>;
}

export interface CheckoutSession {
  id: string;
  url: string;
  status: "open" | "complete" | "expired";
  payment_status: "paid" | "unpaid" | "no_payment_required";
  amount_total: number | null;
  currency: string | null;
  customer: string | null;
  subscription: string | null;
  client_reference_id: string | null;
  metadata: Record<string, string>;
}

export interface RemoteSubscription {
  id: string;
  status: string;
  customer: string | null;
  price_id: string | null;
  interval: BillingInterval;
  current_period_start: number | null;
  current_period_end: number | null;
  cancel_at: number | null;
}

/** A Stripe Connect express account — the ambassador payout rail (Wave G4). */
export interface ConnectAccount {
  id: string;
  /** True once the account holder has finished Stripe's onboarding form. */
  details_submitted: boolean;
}

export interface Transfer {
  id: string;
  amount: number;
  currency: string;
  destination: string;
}

export interface StripeClient {
  createCheckoutSession(params: CheckoutSessionParams): Promise<CheckoutSession>;
  retrieveCheckoutSession(sessionId: string): Promise<CheckoutSession>;
  retrieveSubscription(subscriptionId: string): Promise<RemoteSubscription>;
  createBillingPortalSession(params: { customerId: string; returnUrl: string }): Promise<{ url: string }>;

  // ── Connect (money OUT, as opposed to the checkout rails above) ────────────
  createConnectAccount(params: {
    email: string | null;
    metadata: Record<string, string>;
  }): Promise<ConnectAccount>;
  retrieveConnectAccount(accountId: string): Promise<ConnectAccount>;
  createAccountLink(params: {
    accountId: string;
    refreshUrl: string;
    returnUrl: string;
  }): Promise<{ url: string }>;
  /** `idempotencyKey` is passed to Stripe's own Idempotency-Key header, so a
   *  retried transfer is deduplicated on their side as well as ours. */
  createTransfer(params: {
    amount: number;
    currency: string;
    destination: string;
    idempotencyKey: string;
    metadata: Record<string, string>;
  }): Promise<Transfer>;
}

/** True when the operator has supplied enough config for outbound Stripe calls. */
export function isStripeConfigured(): boolean {
  return Boolean(config.STRIPE_SECRET_KEY);
}

/** True when inbound webhooks can be authenticated. */
export function isWebhookConfigured(): boolean {
  return Boolean(config.STRIPE_WEBHOOK_SECRET);
}

// ponytail: a module-level override is the whole test seam — no DI container, no
// provider registry for a single provider. Tests set it in beforeAll and clear it
// in afterAll. Nothing in src/ ever calls it.
let override: StripeClient | null = null;

export function setStripeClient(client: StripeClient | null): void {
  override = client;
}

function createLiveClient(): StripeClient {
  // The `stripe` package is not a dependency of this project, so there is nothing
  // to construct. When it is added, this becomes:
  //
  //   const stripe = new Stripe(config.STRIPE_SECRET_KEY!, { apiVersion: "..." });
  //   return { createCheckoutSession: (p) => stripe.checkout.sessions.create(...), ... };
  //
  // Until then the only honest answer is 503.
  throw new StripeUnavailableError("Stripe SDK is not installed on this deployment");
}

/**
 * The client for the current request, or a 503. Call this AFTER auth, validation
 * and any database work so that everything short of the network is still verified.
 */
export function getStripeClient(): StripeClient {
  if (override) return override;
  if (!isStripeConfigured()) throw new StripeUnavailableError();
  return createLiveClient();
}
