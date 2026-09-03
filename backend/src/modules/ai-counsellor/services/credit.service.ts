import type { Knex } from "knex";
import { masterKnex } from "../../../core/db/master-pool.js";
import * as creditsRepo from "../repositories/credits.repository.js";
import { PaymentRequiredError } from "../../../shared/errors.js";
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

/** Order the waterfall spends balances in: the ones the user did not pay for go first. */
const WATERFALL = ["free", "subscription", "purchased"] as const;

/**
 * Spend `amount` credits, across balance types if one alone does not cover it.
 *
 * The general form of `deductCredit` above, which can only ever spend exactly 1 credit from
 * exactly one balance type. An enquiry unlock costs whatever the business is configured for
 * (`businesses.enquiry_coin_cost`, 30 by default), which routinely straddles two balances.
 *
 * Differences from `deductCredit` that callers need to know about:
 *   - It THROWS `PaymentRequiredError` when the balance is short, rather than logging and
 *     returning. A spend that buys something (contact details, in the unlock case) must not
 *     silently succeed without charging.
 *   - It runs inside the caller's transaction. That is the whole point: the charge and the thing
 *     being bought commit or roll back together, so there is no compensating refund to get wrong.
 *
 * One ledger row per balance type touched, because `credit_transactions.balance_type` is NOT
 * NULL and a single row cannot describe a spend that crossed two of them. The admin ledger's
 * running-balance CTE handles multiple rows at the same timestamp correctly.
 *
 * The wallet row is locked FOR UPDATE before it is read, so two concurrent spends serialise
 * instead of both seeing the pre-spend balance.
 */
export async function spendCredits(
  trx: Knex.Transaction,
  userId: number,
  amount: number,
  opts: { reason: creditsRepo.TransactionRow["reason"]; description: string },
): Promise<{ spent: number; remaining: number }> {
  if (amount <= 0) throw new Error(`spendCredits called with a non-positive amount: ${amount}`);

  const wallet = await creditsRepo.getForUpdate(userId, trx);
  const balances = {
    free: wallet?.free_balance ?? 0,
    subscription: wallet?.subscription_balance ?? 0,
    purchased: wallet?.purchased_balance ?? 0,
  };
  const total = balances.free + balances.subscription + balances.purchased;

  // Checked before anything is written, so a short wallet leaves no partial spend behind even
  // though the transaction would have rolled it back anyway.
  if (!wallet || total < amount) {
    throw new PaymentRequiredError(`Insufficient credits — this costs ${amount}, balance is ${total}`);
  }

  let outstanding = amount;
  for (const balanceType of WATERFALL) {
    if (outstanding === 0) break;
    const take = Math.min(balances[balanceType], outstanding);
    if (take === 0) continue;
    await creditsRepo.updateBalance(wallet.id, balanceType, -take, trx);
    await creditsRepo.recordTransaction(
      wallet.id,
      { amount: -take, balanceType, reason: opts.reason, description: opts.description },
      trx,
    );
    outstanding -= take;
  }

  return { spent: amount, remaining: total - amount };
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
