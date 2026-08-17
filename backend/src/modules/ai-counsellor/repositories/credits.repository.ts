import { masterKnex } from "../../../core/db/master-pool.js";
import type { Knex } from "knex";

export interface WalletRow {
  id: number;
  platform_user_id: number;
  free_balance: number;
  subscription_balance: number;
  purchased_balance: number;
  created_at: Date;
  updated_at: Date;
}

export interface TransactionRow {
  id: number;
  wallet_id: number;
  amount: number;
  balance_type: "free" | "subscription" | "purchased";
  reason: "signup_grant" | "message" | "purchase" | "admin_grant" | "subscription_grant";
  reference_type: "ai_message" | "purchase" | null;
  reference_id: number | null;
  created_at: Date;
}

const WALLETS = "credit_wallets";
const TXN = "credit_transactions";

export async function findByUserId(userId: number): Promise<WalletRow | undefined> {
  return masterKnex(WALLETS).where({ platform_user_id: userId }).first();
}

export async function createWallet(userId: number, freeBalance = 10): Promise<WalletRow> {
  // ON CONFLICT handles race conditions — two concurrent requests won't double-create
  const result = await masterKnex.raw(
    `INSERT INTO ${WALLETS} (platform_user_id, free_balance) VALUES (?, ?)
     ON CONFLICT (platform_user_id) DO NOTHING
     RETURNING *`,
    [userId, freeBalance],
  );
  // If DO NOTHING fired, the row won't be in rows — fetch it
  return result.rows?.[0] ?? (await findByUserId(userId))!;
}

export async function getForUpdate(userId: number, trx: Knex.Transaction): Promise<WalletRow | undefined> {
  return trx(WALLETS).where({ platform_user_id: userId }).forUpdate().first();
}

export async function updateBalance(
  walletId: number,
  balanceType: "free" | "subscription" | "purchased",
  delta: number,
  trx: Knex.Transaction,
): Promise<void> {
  const col = `${balanceType}_balance`;
  await trx(WALLETS)
    .where({ id: walletId })
    .update({ [col]: trx.raw(`${col} + ?`, [delta]), updated_at: trx.fn.now() });
}

export async function recordTransaction(
  walletId: number,
  data: {
    amount: number;
    balanceType: "free" | "subscription" | "purchased";
    reason: TransactionRow["reason"];
    referenceType?: "ai_message" | "purchase";
    referenceId?: number;
  },
  trx: Knex.Transaction,
): Promise<TransactionRow> {
  const [row] = await trx(TXN)
    .insert({
      wallet_id: walletId,
      amount: data.amount,
      balance_type: data.balanceType,
      reason: data.reason,
      reference_type: data.referenceType ?? null,
      reference_id: data.referenceId ?? null,
    })
    .returning("*");
  return row;
}
