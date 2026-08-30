import { masterKnex } from "../../../core/db/master-pool.js";
import * as creditsRepo from "../repositories/credits.repository.js";
import { createChildLogger } from "../../../shared/logger.js";

const logger = createChildLogger("credit-service");

const SIGNUP_FREE_CREDITS = 10;

export type CreditBalance = {
  free: number;
  subscription: number;
  purchased: number;
  total: number;
};

/** Lazy-create wallet with free credits on first access. */
export async function ensureWallet(userId: number): Promise<creditsRepo.WalletRow> {
  const existing = await creditsRepo.findByUserId(userId);
  if (existing) return existing;
  return creditsRepo.createWallet(userId, SIGNUP_FREE_CREDITS);
}

export async function getBalance(userId: number): Promise<CreditBalance> {
  const wallet = await ensureWallet(userId);
  return {
    free: wallet.free_balance,
    subscription: wallet.subscription_balance,
    purchased: wallet.purchased_balance,
    total: wallet.free_balance + wallet.subscription_balance + wallet.purchased_balance,
  };
}

export async function checkBalance(userId: number): Promise<boolean> {
  const balance = await getBalance(userId);
  return balance.total > 0;
}

/**
 * Deduct 1 credit using waterfall: free -> subscription -> purchased.
 * Called AFTER successful AI response — no deduction on failure.
 */
export async function deductCredit(userId: number, messageId: number): Promise<void> {
  await masterKnex.transaction(async (trx) => {
    const wallet = await creditsRepo.getForUpdate(userId, trx);
    if (!wallet) {
      logger.warn("No wallet found for deduction", { userId, messageId });
      return;
    }

    // Waterfall: free -> subscription -> purchased
    let balanceType: "free" | "subscription" | "purchased";
    if (wallet.free_balance > 0) {
      balanceType = "free";
    } else if (wallet.subscription_balance > 0) {
      balanceType = "subscription";
    } else if (wallet.purchased_balance > 0) {
      balanceType = "purchased";
    } else {
      logger.warn("Wallet empty during deduction", { userId, messageId });
      return;
    }

    await creditsRepo.updateBalance(wallet.id, balanceType, -1, trx);
    await creditsRepo.recordTransaction(
      wallet.id,
      { amount: -1, balanceType, reason: "message", referenceType: "ai_message", referenceId: messageId },
      trx,
    );
  });
}

/** Admin-only: grant credits to a user. */
export async function grantCredits(
  userId: number,
  amount: number,
  balanceType: "free" | "subscription" | "purchased",
  reason: "signup_grant" | "admin_grant" | "subscription_grant" | "purchase",
  description?: string,
): Promise<void> {
  const wallet = await ensureWallet(userId);
  await masterKnex.transaction(async (trx) => {
    await creditsRepo.updateBalance(wallet.id, balanceType, amount, trx);
    await creditsRepo.recordTransaction(wallet.id, { amount, balanceType, reason, description }, trx);
  });
}
