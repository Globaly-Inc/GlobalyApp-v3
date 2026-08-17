// AI-counsellor credit wallet access.
//
// `credit_wallets` / `credit_transactions` are ONE polymorphic pair shared with the
// billing module (see 20260816_004_credit_wallets.ts). Everything here is scoped to
// owner_type='user'; business wallets belong to billing and are never touched from
// this module.

import { masterKnex } from "../../../core/db/master-pool.js";
import type { Knex } from "knex";

export type BalanceType = "free" | "subscription" | "purchased";
export type CreditReason =
  | "signup_grant"
  | "message"
  | "purchase"
  | "admin_grant"
  | "subscription_grant";

/**
 * The ledger's `transaction_type` keeps V1's controlled vocabulary, so an AI-chat
 * reason is recorded as its closest V1 type and the exact reason is kept alongside
 * it in `reason`. `signup_grant` maps to `profile_bonus`: credits the platform gave
 * away rather than sold.
 */
const TRANSACTION_TYPE_BY_REASON: Record<CreditReason, string> = {
  signup_grant: "profile_bonus",
  message: "ai_deduct",
  purchase: "purchase",
  admin_grant: "manual_adjustment",
  subscription_grant: "subscription_grant",
};

export interface WalletRow {
  id: number;
  owner_type: "user" | "business";
  platform_user_id: number | null;
  business_id: number | null;
  /** Monetary total: subscription_balance + purchased_balance. Excludes free_balance. */
  balance: number;
  free_balance: number;
  subscription_balance: number;
  purchased_balance: number;
  lifetime_earned: number;
  lifetime_spent: number;
  created_at: Date;
  updated_at: Date;
}

export interface TransactionRow {
  id: number;
  wallet_id: number;
  transaction_type: string;
  amount: number;
  balance_after: number;
  balance_type: BalanceType | null;
  reason: CreditReason | null;
  reference_type: string | null;
  reference_id: string | null;
  created_at: Date;
}

const WALLETS = "credit_wallets";
const TXN = "credit_transactions";

/** Spendable total the AI-chat user sees, and what lands in `balance_after`. */
export function spendableTotal(wallet: WalletRow): number {
  return wallet.free_balance + wallet.subscription_balance + wallet.purchased_balance;
}

export async function findByUserId(userId: number): Promise<WalletRow | undefined> {
  return masterKnex<WalletRow>(WALLETS)
    .where({ platform_user_id: userId, owner_type: "user" })
    .whereNull("deleted_at")
    .first();
}

export async function createWallet(userId: number, freeBalance = 10): Promise<WalletRow> {
  // ON CONFLICT DO NOTHING handles race conditions — two concurrent requests won't
  // double-create. No conflict target: the uniqueness rule is a partial index
  // (credit_wallets_user_unique), and an untargeted DO NOTHING covers it.
  const result = await masterKnex.raw(
    `INSERT INTO ${WALLETS} (owner_type, platform_user_id, free_balance)
     VALUES ('user', ?, ?)
     ON CONFLICT DO NOTHING
     RETURNING *`,
    [userId, freeBalance],
  );
  // If DO NOTHING fired, the row won't be in rows — fetch it
  return result.rows?.[0] ?? (await findByUserId(userId))!;
}

export async function getForUpdate(userId: number, trx: Knex.Transaction): Promise<WalletRow | undefined> {
  return trx<WalletRow>(WALLETS)
    .where({ platform_user_id: userId, owner_type: "user" })
    .whereNull("deleted_at")
    .forUpdate()
    .first();
}

/**
 * Move one bucket by `delta` and return the updated wallet.
 *
 * `balance` and the lifetime counters track the monetary buckets only, so a move on
 * `free_balance` leaves them alone — that is what keeps
 * `credit_wallets_balance_split_check` (balance = subscription + purchased) true.
 */
export async function updateBalance(
  walletId: number,
  balanceType: BalanceType,
  delta: number,
  trx: Knex.Transaction,
): Promise<WalletRow> {
  const col = `${balanceType}_balance`;
  const monetary = balanceType !== "free";
  const result = await trx.raw(
    `UPDATE ${WALLETS}
        SET ${col}          = ${col} + :delta,
            balance         = balance + :balanceDelta,
            lifetime_earned = lifetime_earned + :earned,
            lifetime_spent  = lifetime_spent + :spent,
            updated_at      = now()
      WHERE id = :walletId AND deleted_at IS NULL
      RETURNING *`,
    {
      delta,
      balanceDelta: monetary ? delta : 0,
      earned: monetary && delta > 0 ? delta : 0,
      spent: monetary && delta < 0 ? -delta : 0,
      walletId,
    },
  );
  const row: WalletRow | undefined = result.rows?.[0];
  if (!row) throw new Error(`Wallet ${walletId} not found`);
  return row;
}

export async function recordTransaction(
  walletId: number,
  data: {
    amount: number;
    balanceType: BalanceType;
    reason: CreditReason;
    /** Spendable total after the move — see spendableTotal(). */
    balanceAfter: number;
    referenceType?: string;
    referenceId?: number;
  },
  trx: Knex.Transaction,
): Promise<TransactionRow> {
  const [row] = await trx<TransactionRow>(TXN)
    .insert({
      wallet_id: walletId,
      transaction_type: TRANSACTION_TYPE_BY_REASON[data.reason],
      amount: data.amount,
      balance_after: data.balanceAfter,
      balance_type: data.balanceType,
      reason: data.reason,
      reference_type: data.referenceType ?? null,
      // Text in V1 (uuids); AI-chat references are numeric platform ids.
      reference_id: data.referenceId === undefined ? null : String(data.referenceId),
    })
    .returning("*");
  return row;
}
