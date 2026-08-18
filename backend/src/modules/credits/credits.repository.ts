// Credit ledger repository — the only way anything writes credit_transactions.
//
// The table is append-only and trigger-protected, so there is deliberately no update() or delete():
// a reversal is a NEW row with a negative amount.

import type { Knex } from "knex";
import { masterKnex } from "../../core/db/master-pool.js";
import { BadRequestError } from "../../shared/errors.js";

export type OwnerType = "user" | "business";

/**
 * Which pot a row belongs to. Folded in from staging's credit_wallets, whose three balance columns
 * this replaces: a pot's balance is SUM(amount) over its rows.
 */
export type BalanceType = "free" | "subscription" | "purchased";

/** Spend order for the AI counsellor: exhaust the free pot before touching paid ones. */
const WATERFALL: BalanceType[] = ["free", "subscription", "purchased"];

/**
 * Kinds any caller may write.
 *
 * `referral_reward` is EXCLUDED on purpose. referrals.credit_transaction_id is only correct because
 * exactly one code path mints rewards (qualification.service.attemptAward), and a "please only call
 * the wrapper" convention is unenforceable — any module could import addTransaction and pass the
 * kind. Excluding it from the type makes the illegal call a COMPILE ERROR instead. Rewards go
 * through addReferralReward, which is not re-exported from this module's index.ts.
 */
export type GeneralKind =
  | "purchase"
  | "manual_adjustment"
  | "referral_reversal"
  | "ai_message"
  | "signup_grant"
  | "subscription_grant"
  | "admin_grant";

export interface CreditTransactionRow {
  id: number;
  owner_type: OwnerType;
  owner_id: number;
  amount: number;
  kind: string;
  balance_type: BalanceType;
  reference_type: string | null;
  reference_id: number | null;
  description: string | null;
  note: string | null;
  created_by: number | null;
  created_at: Date;
}

interface BaseInput {
  owner_type: OwnerType;
  owner_id: number;
  /** Signed. Positive credits the owner, negative debits. Zero is rejected by the DB. */
  amount: number;
  /** Defaults to 'free' — the pot everything except AI counsellor credits lands in. */
  balance_type?: BalanceType;
  reference_type?: string | null;
  reference_id?: number | null;
  description?: string | null;
  note?: string | null;
  created_by?: number | null;
}

/**
 * Repository invariant: the owner must resolve to a live row.
 *
 * There is no foreign key on (owner_type, owner_id) — a polymorphic FK is not expressible, and a
 * per-type FK would drag cascade semantics into financial history. But `user #7` and `business #7`
 * both exist, so an unvalidated id is how garbage silently enters a ledger that can never be
 * cleaned up. A primary-key existence check is cheap insurance.
 */
async function assertOwnerExists(trx: Knex.Transaction, ownerType: OwnerType, ownerId: number) {
  const table = ownerType === "user" ? "platform_users" : "businesses";
  const found = await trx(table).where({ id: ownerId }).whereNull("deleted_at").select("id").first();
  if (!found) {
    throw new BadRequestError(`Credit ledger: ${ownerType} ${ownerId} does not exist or is deleted`);
  }
}

async function insertRow(
  trx: Knex.Transaction,
  input: BaseInput & { kind: string },
): Promise<CreditTransactionRow> {
  await assertOwnerExists(trx, input.owner_type, input.owner_id);

  // A unique violation (23505 from credit_tx_one_referral_reward) is deliberately NOT caught here.
  // It is INV-2 firing, and the caller's transaction must roll back so no half-award survives.
  const [row] = await trx<CreditTransactionRow>("credit_transactions")
    .insert({
      owner_type: input.owner_type,
      owner_id: input.owner_id,
      amount: input.amount,
      kind: input.kind,
      balance_type: input.balance_type ?? "free",
      reference_type: input.reference_type ?? null,
      reference_id: input.reference_id ?? null,
      description: input.description ?? null,
      note: input.note ?? null,
      created_by: input.created_by ?? null,
    })
    .returning("*");
  return row;
}

/** Everything except referral rewards. Takes a transaction so callers can compose atomically. */
export function addTransaction(
  trx: Knex.Transaction,
  input: BaseInput & { kind: GeneralKind },
): Promise<CreditTransactionRow> {
  return insertRow(trx, input);
}

/**
 * The ONLY writer of kind='referral_reward'.
 *
 * ponytail: separate function rather than a `kind` argument, so the type system — not a code review
 * — is what stops anything else minting a reward. Intentionally absent from index.ts.
 */
export function addReferralReward(
  trx: Knex.Transaction,
  input: Omit<BaseInput, "reference_type" | "reference_id"> & { referral_id: number },
): Promise<CreditTransactionRow> {
  return insertRow(trx, {
    ...input,
    kind: "referral_reward",
    reference_type: "referral",
    reference_id: input.referral_id,
  });
}

/**
 * Per-pot balances, plus the total. Replaces credit_wallets' free/subscription/purchased columns —
 * same three numbers, derived from the rows instead of cached alongside them.
 */
export async function balanceByType(
  ownerType: OwnerType,
  ownerId: number,
  db: Knex | Knex.Transaction = masterKnex,
): Promise<Record<BalanceType, number> & { total: number }> {
  const rows = await db("credit_transactions")
    .where({ owner_type: ownerType, owner_id: ownerId })
    .groupBy("balance_type")
    .select("balance_type")
    .sum({ total: "amount" }) as Array<{ balance_type: BalanceType; total: string | null }>;

  const out = { free: 0, subscription: 0, purchased: 0, total: 0 };
  for (const r of rows) {
    out[r.balance_type] = Number(r.total ?? 0);
    out.total += Number(r.total ?? 0);
  }
  return out;
}

/**
 * Spends `amount` across the pots in waterfall order (free -> subscription -> purchased), writing one
 * negative row per pot it draws from. Returns null — spending NOTHING — when the total does not cover
 * the amount, which callers turn into a 402.
 *
 * The advisory lock is what a wallet row's SELECT ... FOR UPDATE used to do. There is no balance row
 * to lock any more, so two concurrent spends would each read the same pot and both insert, overdrawing
 * it. The lock is keyed on the owner and released with the transaction, so spends serialise per owner
 * while different owners still run in parallel.
 *
 * ponytail: advisory lock rather than reintroducing a lockable balance row — a cached balance is the
 * one thing this ledger exists to avoid. Move to SELECT ... FOR UPDATE on a real balances table only
 * if per-owner serialisation ever becomes a measured bottleneck.
 */
export async function spend(
  trx: Knex.Transaction,
  input: {
    owner_type: OwnerType;
    owner_id: number;
    /** Positive number of credits to spend. */
    amount: number;
    kind: GeneralKind;
    reference_type?: string | null;
    reference_id?: number | null;
    description?: string | null;
  },
): Promise<CreditTransactionRow[] | null> {
  if (input.amount <= 0) throw new BadRequestError("Credit ledger: spend amount must be positive");

  await trx.raw("SELECT pg_advisory_xact_lock(hashtext(?), ?)", [input.owner_type, input.owner_id]);

  const balances = await balanceByType(input.owner_type, input.owner_id, trx);
  if (balances.total < input.amount) return null;

  const rows: CreditTransactionRow[] = [];
  let outstanding = input.amount;
  for (const pot of WATERFALL) {
    if (outstanding === 0) break;
    const take = Math.min(balances[pot], outstanding);
    if (take <= 0) continue; // empty or negative pot — skip, never mint credits into it
    rows.push(await insertRow(trx, { ...input, amount: -take, balance_type: pot }));
    outstanding -= take;
  }
  return rows;
}
/** Current balance. Derived, never stored — so it cannot drift from the rows. */
export async function balance(ownerType: OwnerType, ownerId: number): Promise<number> {
  const row = await masterKnex("credit_transactions")
    .where({ owner_type: ownerType, owner_id: ownerId })
    .sum({ total: "amount" })
    .first<{ total: string | null }>();
  return Number(row?.total ?? 0);
}

/**
 * Paginated ledger, newest first, with a running balance per row.
 *
 * `balance_after` comes from a window function because an append-only ledger stores no balance, and
 * accumulating it in the client would be wrong the moment a page boundary is crossed. Partitioned by
 * owner so a user and a business sharing an integer id can never mix.
 */
export async function listTransactions(params: {
  owner_type: OwnerType;
  owner_id: number;
  limit: number;
  offset: number;
}): Promise<Array<CreditTransactionRow & { balance_after: number }>> {
  const rows = await masterKnex
    .with("ledger", (qb) => {
      qb.select(
        "*",
        masterKnex.raw(
          "SUM(amount) OVER (PARTITION BY owner_type, owner_id ORDER BY id) AS balance_after",
        ),
      )
        .from("credit_transactions")
        .where({ owner_type: params.owner_type, owner_id: params.owner_id });
    })
    .select("*")
    .from("ledger")
    .orderBy("id", "desc")
    .limit(params.limit)
    .offset(params.offset);

  return rows.map((r) => ({ ...r, balance_after: Number(r.balance_after) }));
}

export interface AdminLedgerRow extends CreditTransactionRow {
  balance_after: number;
  /** Resolved owner name, or null when the account no longer resolves. */
  owner_name: string | null;
}

/**
 * Admin-wide ledger across every owner, newest first.
 *
 * Owner names are LEFT JOINed and may come back null: referral and credit history outlives the
 * accounts it refers to (INV-6), so a deleted owner must still render as a row — with an id fallback in
 * the UI — rather than vanishing from the ledger or 500ing the page.
 *
 * balance_after stays partitioned by (owner_type, owner_id) even in a cross-owner list, so each row
 * shows that OWNER's running balance rather than a meaningless global total.
 */
export async function listAllTransactions(params: {
  limit: number;
  offset: number;
  kind?: string;
}): Promise<AdminLedgerRow[]> {
  const rows = await masterKnex
    .with("ledger", (qb) => {
      qb.select(
        "*",
        masterKnex.raw(
          "SUM(amount) OVER (PARTITION BY owner_type, owner_id ORDER BY id) AS balance_after",
        ),
      ).from("credit_transactions");
    })
    .select(
      "l.*",
      masterKnex.raw(`COALESCE(
        NULLIF(TRIM(CONCAT_WS(' ', u.first_name, u.last_name)), ''),
        b.business_name
      ) AS owner_name`),
    )
    .from({ l: "ledger" })
    .leftJoin({ u: "platform_users" }, function () {
      this.on("u.id", "=", "l.owner_id").andOnVal("l.owner_type", "=", "user");
    })
    .leftJoin({ b: "businesses" }, function () {
      this.on("b.id", "=", "l.owner_id").andOnVal("l.owner_type", "=", "business");
    })
    .modify((qb) => {
      if (params.kind) qb.where("l.kind", params.kind);
    })
    .orderBy("l.id", "desc")
    .limit(params.limit)
    .offset(params.offset) as Array<AdminLedgerRow & { balance_after: string | number }>;

  // Postgres returns SUM() as a string, so coerce rather than shipping "140" to the client.
  return rows.map((r) => ({ ...r, balance_after: Number(r.balance_after) }));
}

export async function countAllTransactions(kind?: string): Promise<number> {
  const row = await masterKnex("credit_transactions")
    .modify((qb) => {
      if (kind) qb.where({ kind });
    })
    .count({ n: "*" })
    .first<{ n: string }>();
  return Number(row?.n ?? 0);
}

export async function countTransactions(ownerType: OwnerType, ownerId: number): Promise<number> {
  const row = await masterKnex("credit_transactions")
    .where({ owner_type: ownerType, owner_id: ownerId })
    .count({ n: "*" })
    .first<{ n: string }>();
  return Number(row?.n ?? 0);
}
