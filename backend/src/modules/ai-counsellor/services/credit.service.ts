// Wallet reads and the pre-flight spend gate for the counsellor.
//
// The spend itself lives in metering.service — a turn is charged once, at
// settlement, for the tokens delivered. This file only answers "may this scope
// start a turn at all", which is the question a 402 belongs to.
//
// Personal chats read the caller's user wallet; business chats read the business
// wallet through the billing module. Neither path can see the other's balance,
// because the scope decides which wallet is opened and the scope comes from the
// JWT, never the body.

import { masterKnex } from "../../../core/db/master-pool.js";
import * as billingCredits from "../../billing/services/credits.service.js";
import * as creditsRepo from "../repositories/credits.repository.js";
import { PaymentRequiredError } from "../../../shared/errors.js";
import type { ChatScope } from "./scope.js";

const SIGNUP_FREE_CREDITS = 10;

export type CreditBalance = {
  free: number;
  subscription: number;
  purchased: number;
  total: number;
};

/** Lazy-create the user wallet with free credits on first access. */
export async function ensureWallet(userId: number): Promise<creditsRepo.WalletRow> {
  return creditsRepo.ensureUserWallet(userId, SIGNUP_FREE_CREDITS);
}

export async function getBalance(scope: ChatScope): Promise<CreditBalance> {
  if (scope.ownerType === "business") {
    // Business wallets have no `free` bucket — that one is an AI-chat signup grant.
    const wallet = await billingCredits.getBalance(scope.businessId);
    return {
      free: 0,
      subscription: wallet.subscription_balance,
      purchased: wallet.purchased_balance,
      total: wallet.balance,
    };
  }

  const wallet = await ensureWallet(scope.userId);
  return {
    free: wallet.free_balance,
    subscription: wallet.subscription_balance,
    purchased: wallet.purchased_balance,
    total: creditsRepo.spendableTotal(wallet),
  };
}

/**
 * The gate. Runs before the provider is reached, so a refusal costs nothing and
 * writes no usage row.
 */
export async function assertSpendable(scope: ChatScope): Promise<void> {
  const balance = await getBalance(scope);
  if (balance.total <= 0) throw new PaymentRequiredError();
}

/** Admin-only: grant credits to a user. */
export async function grantCredits(
  userId: number,
  amount: number,
  balanceType: "free" | "subscription" | "purchased",
  reason: "signup_grant" | "admin_grant" | "subscription_grant" | "purchase",
): Promise<void> {
  const wallet = await ensureWallet(userId);
  await masterKnex.transaction(async (trx) => {
    const updated = await creditsRepo.updateBalance(wallet.id, balanceType, amount, trx);
    await creditsRepo.recordTransaction(
      wallet.id,
      { amount, balanceType, reason, balanceAfter: creditsRepo.spendableTotal(updated) },
      trx,
    );
  });
}
