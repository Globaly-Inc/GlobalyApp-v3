// Stripe Connect onboarding for an ambassador. Payouts (Transfers) are a later step — this only
// gets an ambassador to a payable state and tracks it on the ambassadors row.

import { config } from "../../../config.js";
import { ConflictError, NotFoundError } from "../../../shared/errors.js";
import { createChildLogger } from "../../../shared/logger.js";
import * as userRepo from "../../platform-users/repositories/platform-users.repository.js";
import * as repo from "../repositories/ambassadors.repository.js";
import * as stripeConnect from "../lib/stripe-connect.js";

const logger = createChildLogger("ambassadors-connect");

export async function listMine(userId: number) {
  return repo.listForUser(userId);
}

export async function startOnboarding(ambassadorId: number, userId: number): Promise<{ url: string }> {
  if (!config.STRIPE_SECRET_KEY) throw new ConflictError("Payouts are not configured on this environment yet");

  const ambassador = await repo.findByIdForUser(ambassadorId, userId);
  if (!ambassador) throw new NotFoundError("Ambassador record not found");

  let accountId = ambassador.stripe_connect_account_id;
  if (!accountId) {
    const user = await userRepo.findByIdFull(userId);
    if (!user) throw new NotFoundError("User not found");
    const account = await stripeConnect.createExpressAccount(user.email);
    accountId = account.id;
    await repo.updateConnectAccount(ambassadorId, {
      stripe_connect_account_id: accountId,
      connect_onboarding_status: "pending",
    });
    logger.info("Created Connect account for ambassador", { ambassadorId, accountId });
  }

  const returnTo = `${config.WEB_APP_URL}/personal/earn/ambassadors/${ambassadorId}`;
  const link = await stripeConnect.createAccountLink(accountId, returnTo, returnTo);
  return { url: link.url };
}

/** Call on return from the onboarding flow — Connect has no return-time token, so this re-checks the account directly. */
export async function syncOnboardingStatus(ambassadorId: number, userId: number) {
  const ambassador = await repo.findByIdForUser(ambassadorId, userId);
  if (!ambassador) throw new NotFoundError("Ambassador record not found");
  if (!ambassador.stripe_connect_account_id) throw new ConflictError("Onboarding has not been started yet");

  const status = await stripeConnect.retrieveAccountStatus(ambassador.stripe_connect_account_id);
  const onboardingStatus = status.payoutsEnabled ? "complete" : "pending";

  return repo.updateConnectAccount(ambassadorId, { connect_onboarding_status: onboardingStatus });
}
