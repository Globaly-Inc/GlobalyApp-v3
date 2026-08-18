// ai_usage_events plus the user-wallet debit that settles alongside it.
//
// Business wallets are NOT touched here — those go through billing's own
// spendCredits/debitWallet, which this module calls rather than reimplements.

import type { Knex } from "knex";

const TABLE = "ai_usage_events";

export interface UsageEventRow {
  id: number;
  idempotency_key: string;
  owner_type: "user" | "business";
  platform_user_id: number | null;
  business_id: number | null;
  session_id: number | null;
  message_id: number | null;
  provider: string;
  model: string;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  cost_micros: string;
  credits_charged: number;
  outcome: "complete" | "interrupted";
  created_at: Date;
}

export type UsageEventInsert = Omit<UsageEventRow, "id" | "created_at" | "cost_micros"> & {
  cost_micros: number;
};

/**
 * Claim a turn. Returns the row on the first settlement and `undefined` on every
 * later one: `idempotency_key` is UNIQUE, so a concurrent second caller blocks on
 * the first's insert, then finds the conflict and takes nothing. This is the whole
 * exactly-once gate — the debit below only runs when this returned a row, and both
 * live in the caller's single transaction.
 */
export async function claimUsageEvent(
  values: UsageEventInsert,
  trx: Knex.Transaction,
): Promise<UsageEventRow | undefined> {
  // Untyped builder: cost_micros is a bigint, which pg reads back as a string but
  // is written as a number.
  const rows = (await trx(TABLE)
    .insert(values)
    .onConflict("idempotency_key")
    .ignore()
    .returning("*")) as UsageEventRow[];
  return rows[0];
}

export async function setCreditsCharged(
  id: number,
  credits: number,
  trx: Knex.Transaction,
): Promise<void> {
  await trx(TABLE).where({ id }).update({ credits_charged: credits });
}

export interface UserDebitResult {
  charged: number;
  fromFree: number;
  fromSubscription: number;
  fromPurchased: number;
  balanceAfter: number;
}

/**
 * Debit a user wallet by up to `amount`, spending free → subscription → purchased.
 *
 * Clamped, not guarded: a turn that has already been answered must always settle,
 * so the wallet gives what it has and `charged` reports what actually moved. The
 * pre-flight gate is what refuses an empty wallet with a 402; this is the tail end
 * of a turn that was already allowed.
 *
 * Concurrency safety is the `FOR UPDATE` in the CTE — every competing debit queues
 * on the same row and re-reads the committed balances before its own split is
 * computed, exactly as billing's debitWallet does. `balance` and `lifetime_spent`
 * move only for the monetary buckets, which is what keeps
 * credit_wallets_balance_split_check true.
 */
export async function debitUserWallet(
  walletId: number,
  amount: number,
  trx: Knex.Transaction,
): Promise<UserDebitResult> {
  const result = await trx.raw(
    `WITH locked AS (
       SELECT id, free_balance, subscription_balance, purchased_balance
         FROM credit_wallets
        WHERE id = :walletId AND deleted_at IS NULL
        FOR UPDATE
     ), split AS (
       SELECT id,
              LEAST(:amount, free_balance) AS from_free,
              LEAST(
                GREATEST(:amount - free_balance, 0),
                subscription_balance
              ) AS from_sub,
              LEAST(
                GREATEST(:amount - free_balance - subscription_balance, 0),
                purchased_balance
              ) AS from_pur
         FROM locked
     )
     UPDATE credit_wallets c
        SET free_balance         = c.free_balance - s.from_free,
            subscription_balance = c.subscription_balance - s.from_sub,
            purchased_balance    = c.purchased_balance - s.from_pur,
            balance              = c.balance - (s.from_sub + s.from_pur),
            lifetime_spent       = c.lifetime_spent + (s.from_sub + s.from_pur),
            updated_at           = now()
       FROM split s
      WHERE c.id = s.id
      RETURNING s.from_free, s.from_sub, s.from_pur,
                c.free_balance + c.subscription_balance + c.purchased_balance AS balance_after`,
    { walletId, amount },
  );

  const row = result.rows[0];
  if (!row) throw new Error(`Wallet ${walletId} not found`);

  const fromFree = Number(row.from_free);
  const fromSubscription = Number(row.from_sub);
  const fromPurchased = Number(row.from_pur);
  return {
    charged: fromFree + fromSubscription + fromPurchased,
    fromFree,
    fromSubscription,
    fromPurchased,
    balanceAfter: Number(row.balance_after),
  };
}
