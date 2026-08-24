// Stripe Connect (Express) — onboarding an ambassador to receive payouts. Same form-encoded-over-fetch
// style as the rest of this codebase's Stripe calls; no SDK.
//
// Scope note: this file gets an ambassador ONBOARDED onto a Connect account. Actually paying them
// (Transfers) needs an earnings ledger that doesn't exist yet — that is the next step, not this one.

import { config } from "../../../config.js";
import { createChildLogger } from "../../../shared/logger.js";

const logger = createChildLogger("ambassadors-stripe-connect");
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
    logger.error("Stripe Connect call failed", { path, status: res.status, code: body.error?.code });
    throw new Error(`Stripe: ${body.error?.message ?? `HTTP ${res.status}`}`);
  }
  return body as T;
}

export async function createExpressAccount(email: string): Promise<{ id: string }> {
  return call<{ id: string }>("/accounts", {
    type: "express",
    email,
    "capabilities[transfers][requested]": "true",
  });
}

export async function createAccountLink(
  accountId: string,
  refreshUrl: string,
  returnUrl: string,
): Promise<{ url: string }> {
  return call<{ url: string }>("/account_links", {
    account: accountId,
    refresh_url: refreshUrl,
    return_url: returnUrl,
    type: "account_onboarding",
  });
}

export interface ConnectAccountStatus {
  detailsSubmitted: boolean;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
}

export async function retrieveAccountStatus(accountId: string): Promise<ConnectAccountStatus> {
  const res = await fetch(`${API}/accounts/${encodeURIComponent(accountId)}`, {
    headers: { Authorization: `Bearer ${config.STRIPE_SECRET_KEY}` },
  });
  const body = (await res.json()) as {
    details_submitted?: boolean;
    charges_enabled?: boolean;
    payouts_enabled?: boolean;
    error?: { message?: string };
  };
  if (!res.ok) throw new Error(`Stripe: ${body.error?.message ?? `HTTP ${res.status}`}`);
  return {
    detailsSubmitted: !!body.details_submitted,
    chargesEnabled: !!body.charges_enabled,
    payoutsEnabled: !!body.payouts_enabled,
  };
}
