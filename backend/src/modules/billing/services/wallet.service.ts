// Business credit wallet — the real, per-business, DB-backed ledger that
// enquiries/services/credits.service.ts's in-memory placeholder was explicitly
// written to be swapped out for once it existed. See that file's header.

import type { Knex } from "knex";
import { masterKnex } from "../../../core/db/master-pool.js";
import * as repo from "../repositories/wallet.repository.js";
import { SIGNUP_GRANT_CREDITS, type CreditReason, type ReferenceType } from "../consts.js";

/** Read-only balance for status displays. Creates nothing — a business with no wallet yet reads as 0. */
export async function getBalance(businessId: number): Promise<number> {
  const wallet = await repo.findByBusinessId(businessId);
  return wallet?.balance ?? 0;
}

/**
 * Spend `amount` if the balance covers it, inside the caller's own transaction so the deduction
 * commits or rolls back with whatever it is paying for (e.g. an enquiry unlock).
 *
 * A business's first spend lazily provisions its wallet with a signup grant — this preserves the
 * placeholder's "starts with credits" behaviour without a separate seeding step per business.
 *
 * Returns the new balance, or null when the balance does not cover `amount` (caller must not proceed).
 */
export async function deduct(
  trx: Knex.Transaction,
  businessId: number,
  amount: number,
  reason: CreditReason,
  reference?: { type: ReferenceType; id: string },
): Promise<number | null> {
  const wallet = await repo.lockOrCreate(trx, businessId);
  let balance = wallet.balance;

  if (balance === 0) {
    balance = SIGNUP_GRANT_CREDITS;
    await repo.insertTransaction(trx, { walletId: wallet.id, amount: SIGNUP_GRANT_CREDITS, reason: "signup_grant" });
  }

  if (balance < amount) return null;

  balance -= amount;
  await repo.updateBalance(trx, wallet.id, balance);
  await repo.insertTransaction(trx, {
    walletId: wallet.id,
    amount: -amount,
    reason,
    referenceType: reference?.type,
    referenceId: reference?.id,
  });
  return balance;
}

/**
 * Puts credits back after a deduction whose transaction already committed but whose surrounding
 * operation then failed — a new transaction, since the original one is gone. Mirrors the
 * placeholder's post-hoc refund exactly.
 */
export async function refund(
  businessId: number,
  amount: number,
  reference?: { type: ReferenceType; id: string },
): Promise<number> {
  return masterKnex.transaction(async (trx) => {
    const wallet = await repo.lockOrCreate(trx, businessId);
    const balance = wallet.balance + amount;
    await repo.updateBalance(trx, wallet.id, balance);
    await repo.insertTransaction(trx, {
      walletId: wallet.id,
      amount,
      reason: "unlock_refund",
      referenceType: reference?.type,
      referenceId: reference?.id,
    });
    return balance;
  });
}

/** Add credits from a source outside the wallet's own spend path — a subscription grant or admin top-up. */
export async function grant(
  businessId: number,
  amount: number,
  reason: CreditReason,
  reference?: { type: ReferenceType; id: string },
): Promise<number> {
  return masterKnex.transaction(async (trx) => {
    const wallet = await repo.lockOrCreate(trx, businessId);
    const balance = wallet.balance + amount;
    await repo.updateBalance(trx, wallet.id, balance);
    await repo.insertTransaction(trx, {
      walletId: wallet.id,
      amount,
      reason,
      referenceType: reference?.type,
      referenceId: reference?.id,
    });
    return balance;
  });
}
