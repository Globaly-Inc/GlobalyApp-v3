// Ambassador payouts — the only path in this module that moves money.
//
// Behavioural spec: V1 `create-ambassador-connect`,
// `ambassador-connect-onboarding`, `process-ambassador-payout`.
//
// ── fail closed ──
// The Stripe client comes from the billing module (`getStripeClient`), which is
// the single place this deployment talks to Stripe. There are no Stripe keys
// here, so it raises StripeUnavailableError → 503. That call is made LAST, after
// auth, validation and the database work, so everything short of the network is
// still exercised offline and the caller gets an honest "payouts are
// unavailable" rather than a fabricated success.
//
// ── exactly once ──
// `requestPayout` runs one transaction:
//   1. re-read the payout by idempotency key → a replay returns the original
//      payout without touching Stripe or the balance;
//   2. SELECT ... FOR UPDATE the ambassador row, so two concurrent requests
//      serialise instead of both reading the same balance;
//   3. validate onboarding + minimum + sufficient balance;
//   4. INSERT the payout row (UNIQUE idempotency_key) and debit the balance;
//   5. call Stripe.
// A 503 in step 5 rolls the whole transaction back: no payout row, no debit, no
// withdrawn earnings, so the caller may retry with the same key. A success
// commits all of it together.

import type { Knex } from "knex";
import { masterKnex } from "../../../core/db/master-pool.js";
import { config } from "../../../config.js";
import { BadRequestError, ForbiddenError, PaymentRequiredError } from "../../../shared/errors.js";
import { getStripeClient } from "../../billing/services/stripe.client.js";
import { MIN_PAYOUT_MINOR, payoutIdempotencyKey } from "../consts.js";
import * as repo from "../repositories/programs.repository.js";
import * as money from "../repositories/payouts.repository.js";
import { requireAmbassador } from "./me.service.js";

function returnUrl(explicit?: string): string {
  const base = config.WEB_APP_URL.replace(/\/$/, "");
  return explicit ?? `${base}/personal/earn/ambassadors`;
}

/**
 * Create (or return) the ambassador's Stripe Connect express account.
 * The DB write happens only after Stripe hands back an account id, so a 503
 * leaves no dangling `stripe_account_id`.
 */
export async function createConnectAccount(userId: number, email: string) {
  const ambassador = await requireAmbassador(userId);
  if (ambassador.stripe_account_id) {
    return { account_id: ambassador.stripe_account_id, created: false };
  }

  const account = await getStripeClient().createConnectAccount({
    email,
    metadata: { ambassador_id: String(ambassador.id), user_id: String(userId) },
  });

  await repo.updateAmbassador(ambassador.id, {
    stripe_account_id: account.id,
    stripe_onboarding_complete: account.details_submitted,
  });
  return { account_id: account.id, created: true };
}

/** Onboarding link, or `already_complete` when Stripe says the form is done. */
export async function createOnboardingLink(userId: number, explicitReturnUrl?: string) {
  const ambassador = await requireAmbassador(userId);
  if (!ambassador.stripe_account_id) {
    throw new BadRequestError("No Stripe account yet — create one first");
  }

  const stripe = getStripeClient();
  const account = await stripe.retrieveConnectAccount(ambassador.stripe_account_id);
  if (account.details_submitted) {
    await repo.updateAmbassador(ambassador.id, { stripe_onboarding_complete: true });
    return { already_complete: true, url: null };
  }

  const link = await stripe.createAccountLink({
    accountId: ambassador.stripe_account_id,
    refreshUrl: returnUrl(explicitReturnUrl),
    returnUrl: returnUrl(explicitReturnUrl),
  });
  return { already_complete: false, url: link.url };
}

export interface PayoutRequest {
  amount_minor: number;
  idempotency_key: string;
}

export async function requestPayout(userId: number, body: PayoutRequest) {
  const ambassador = await requireAmbassador(userId);
  const key = payoutIdempotencyKey(ambassador.id, body.idempotency_key);

  // V1: "Minimum withdrawal is $20". Checked before any database work.
  if (body.amount_minor < MIN_PAYOUT_MINOR) {
    throw new BadRequestError(
      `Minimum withdrawal is ${(MIN_PAYOUT_MINOR / 100).toFixed(2)} ${ambassador.currency}`,
    );
  }

  return masterKnex.transaction(async (trx: Knex.Transaction) => {
    const replay = await money.findPayoutByKey(key, trx);
    if (replay) return { payout: replay, replayed: true };

    const locked = await money.lockAmbassador(ambassador.id, trx);
    if (!locked) throw new ForbiddenError("Ambassador is not payable");
    if (!locked.stripe_account_id || !locked.stripe_onboarding_complete) {
      throw new BadRequestError("Complete Stripe onboarding first");
    }
    if (Number(locked.available_earnings_minor) < body.amount_minor) {
      throw new PaymentRequiredError("Insufficient available earnings");
    }

    const payout = await money.insertPayout(
      {
        ambassador_id: ambassador.id,
        amount_minor: body.amount_minor,
        currency: locked.currency,
        idempotency_key: key,
        status: "processing",
      },
      trx,
    );

    await trx("ambassadors")
      .where({ id: ambassador.id })
      .decrement("available_earnings_minor", body.amount_minor);
    await money.attachEarningsToPayout(ambassador.id, payout.id, trx);

    // LAST. Throws StripeUnavailableError (503) with no key configured, which
    // rolls back everything above — see the header.
    const transfer = await getStripeClient().createTransfer({
      amount: body.amount_minor,
      currency: locked.currency.toLowerCase(),
      destination: locked.stripe_account_id,
      idempotencyKey: key,
      metadata: { payout_id: String(payout.id), ambassador_id: String(ambassador.id) },
    });

    const settled = await money.updatePayout(
      payout.id,
      {
        status: "completed",
        stripe_transfer_id: transfer.id,
        processed_at: trx.fn.now(),
        completed_at: trx.fn.now(),
      },
      trx,
    );
    return { payout: settled, replayed: false };
  });
}
