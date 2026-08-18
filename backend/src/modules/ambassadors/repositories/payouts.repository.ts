// Earnings + payouts. Knex only. See 20260817_603 for why this is a ledger.

import type { Knex } from "knex";
import { masterKnex } from "../../../core/db/master-pool.js";
import type { EarningStatus, EarningType, PayoutStatus } from "../consts.js";

export type Db = Knex | Knex.Transaction;

export function db(trx?: Db): Db {
  return trx ?? masterKnex;
}

export interface EarningRow {
  id: number;
  ambassador_id: number;
  inquiry_id: number | null;
  type: EarningType;
  amount_minor: number;
  net_amount_minor: number;
  currency: string;
  status: EarningStatus;
  payout_id: number | null;
  description: string | null;
  available_at: Date | null;
  created_at: Date;
}

export interface PayoutRow {
  id: number;
  ambassador_id: number;
  amount_minor: number;
  currency: string;
  method: "stripe" | "manual";
  status: PayoutStatus;
  stripe_transfer_id: string | null;
  idempotency_key: string;
  failure_reason: string | null;
  requested_at: Date;
  processed_at: Date | null;
  completed_at: Date | null;
  created_at: Date;
}

export async function listEarnings(ambassadorId: number, trx?: Db): Promise<EarningRow[]> {
  return db(trx)<EarningRow>("ambassador_earnings")
    .where({ ambassador_id: ambassadorId })
    .orderBy("created_at", "desc");
}

export async function listPayouts(ambassadorId: number, limit: number, trx?: Db): Promise<PayoutRow[]> {
  return db(trx)<PayoutRow>("ambassador_payouts")
    .where({ ambassador_id: ambassadorId })
    .orderBy("created_at", "desc")
    .limit(limit);
}

export async function findPayoutByKey(key: string, trx?: Db): Promise<PayoutRow | null> {
  const row = await db(trx)<PayoutRow>("ambassador_payouts").where({ idempotency_key: key }).first();
  return row ?? null;
}

export async function insertPayout(
  values: {
    ambassador_id: number;
    amount_minor: number;
    currency: string;
    idempotency_key: string;
    status: PayoutStatus;
  },
  trx?: Db,
): Promise<PayoutRow> {
  const [row] = await db(trx)<PayoutRow>("ambassador_payouts")
    .insert(values as never)
    .returning("*");
  return row as PayoutRow;
}

export async function updatePayout(
  id: number,
  values: Record<string, unknown>,
  trx?: Db,
): Promise<PayoutRow> {
  const [row] = await db(trx)<PayoutRow>("ambassador_payouts")
    .where({ id })
    .update({ ...values, updated_at: db(trx).fn.now() } as never)
    .returning("*");
  return row as PayoutRow;
}

/**
 * Lock the ambassador row for the duration of the surrounding transaction.
 * Every balance read that is about to be written back goes through here — a
 * plain SELECT would let two concurrent payouts read the same balance.
 */
export async function lockAmbassador(id: number, trx: Knex.Transaction) {
  const row = await trx("ambassadors").where({ id }).forUpdate().first();
  return row ?? null;
}

/** Move `count` of an ambassador's available earnings onto a payout. */
export async function attachEarningsToPayout(
  ambassadorId: number,
  payoutId: number,
  trx: Db,
): Promise<number> {
  return trx("ambassador_earnings")
    .where({ ambassador_id: ambassadorId, status: "available" })
    .update({ status: "withdrawn", payout_id: payoutId, updated_at: db(trx).fn.now() });
}

export async function insertEarning(
  values: {
    ambassador_id: number;
    inquiry_id: number | null;
    type: EarningType;
    amount_minor: number;
    net_amount_minor: number;
    currency: string;
    status: EarningStatus;
    description?: string | null;
  },
  trx?: Db,
): Promise<EarningRow | null> {
  // ON CONFLICT on (inquiry_id, type): resolving the same inquiry twice must not
  // pay twice. Returns null when the earning already existed.
  const [row] = await db(trx)<EarningRow>("ambassador_earnings")
    .insert({ ...values, available_at: db(trx).fn.now() } as never)
    .onConflict(["inquiry_id", "type"])
    .ignore()
    .returning("*");
  return (row as EarningRow) ?? null;
}
