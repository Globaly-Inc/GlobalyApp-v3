import type { Knex } from "knex";
import { masterKnex } from "../../../core/db/master-pool.js";
import type { CreditReason, ReferenceType } from "../consts.js";

export interface WalletRow {
  id: number;
  business_id: number;
  balance: number;
}

/** Read-only, no lock — for status displays outside a spend/grant transaction. */
export async function findByBusinessId(businessId: number): Promise<WalletRow | undefined> {
  return masterKnex("business_credit_wallets").where({ business_id: businessId }).first();
}

/**
 * Row-locked find, creating the wallet on first touch — mirrors the enquiry-unlock placeholder's
 * per-business isolation, but backed by a real row lock instead of an in-memory variable.
 */
export async function lockOrCreate(trx: Knex.Transaction, businessId: number): Promise<WalletRow> {
  const existing = await trx("business_credit_wallets").where({ business_id: businessId }).forUpdate().first();
  if (existing) return existing;

  const [created] = await trx("business_credit_wallets")
    .insert({ business_id: businessId, balance: 0 })
    .returning("*");
  return created;
}

export async function updateBalance(trx: Knex.Transaction, walletId: number, balance: number): Promise<void> {
  await trx("business_credit_wallets").where({ id: walletId }).update({ balance, updated_at: trx.fn.now() });
}

export async function insertTransaction(
  trx: Knex.Transaction,
  params: {
    walletId: number;
    amount: number;
    reason: CreditReason;
    referenceType?: ReferenceType | null;
    referenceId?: string | null;
  },
): Promise<void> {
  await trx("business_credit_transactions").insert({
    wallet_id: params.walletId,
    amount: params.amount,
    reason: params.reason,
    reference_type: params.referenceType ?? null,
    reference_id: params.referenceId ?? null,
  });
}
