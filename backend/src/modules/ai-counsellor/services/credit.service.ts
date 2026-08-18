// AI counsellor credits.
//
// Backed by the shared credit ledger (modules/credits), which is the single credit table for the whole
// product — referral rewards, purchases and admin adjustments land in the same place. The
// credit_wallets row this module used to read is gone: the three balances are SUM(amount) per
// balance_type, so they cannot drift from the transactions that produced them.

import { masterKnex } from "../../../core/db/master-pool.js";
import * as ledger from "../../credits/credits.repository.js";
import { createChildLogger } from "../../../shared/logger.js";

const logger = createChildLogger("credit-service");

const SIGNUP_FREE_CREDITS = 10;

export type CreditBalance = {
  free: number;
  subscription: number;
  purchased: number;
  total: number;
};

/**
 * Grants the free starter credits once, on first access — what lazy wallet creation used to do.
 *
 * Idempotency is the credit_tx_one_signup_grant partial unique index, not a check-then-insert: two
 * concurrent first messages both see no grant, and the loser's 23505 is swallowed here. Any other
 * error propagates.
 */
export async function ensureSignupGrant(userId: number): Promise<void> {
  try {
    await masterKnex.transaction((trx) =>
      ledger.addTransaction(trx, {
        owner_type: "user",
        owner_id: userId,
        amount: SIGNUP_FREE_CREDITS,
        kind: "signup_grant",
        balance_type: "free",
        description: "Welcome credits",
      }),
    );
  } catch (err) {
    if ((err as { code?: string }).code !== "23505") throw err;
  }
}

export async function getBalance(userId: number): Promise<CreditBalance> {
  await ensureSignupGrant(userId);
  return ledger.balanceByType("user", userId);
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
  const spent = await masterKnex.transaction((trx) =>
    ledger.spend(trx, {
      owner_type: "user",
      owner_id: userId,
      amount: 1,
      kind: "ai_message",
      reference_type: "ai_message",
      reference_id: messageId,
      description: "AI counsellor message",
    }),
  );

  // Unchanged behaviour: an empty balance logs and returns rather than throwing — the user already
  // has their answer, and failing here would only lose the message.
  if (spent === null) logger.warn("Insufficient credits during deduction", { userId, messageId });
}

/** Admin-only: grant credits to a user. */
export async function grantCredits(
  userId: number,
  amount: number,
  balanceType: ledger.BalanceType,
  reason: "signup_grant" | "admin_grant" | "subscription_grant" | "purchase",
): Promise<void> {
  await masterKnex.transaction((trx) =>
    ledger.addTransaction(trx, {
      owner_type: "user",
      owner_id: userId,
      amount,
      kind: reason,
      balance_type: balanceType,
    }),
  );
}
