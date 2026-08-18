// Billing repository — every query runs against the master schema (see the header
// of 20260817_002_billing_accounts.ts for why billing is not per-tenant).
//
// Tenant isolation is this layer's job: nothing here is reachable without a
// business_id, and routes derive that id from req.auth.orgId, never from the body.

import type { Knex } from "knex";
import { masterKnex } from "../../../core/db/master-pool.js";
import type { BusinessRecord } from "../../../core/types.js";
import type { BillingInterval, SubscriptionStatus, TransactionType } from "../consts.js";

/** Master connection, or the transaction the caller is already inside. */
export type Db = Knex | Knex.Transaction;

export function db(trx?: Db): Db {
  return trx ?? masterKnex;
}

// ── Rows ────────────────────────────────────────────────────────────────────

export interface WalletRow {
  id: number;
  owner_type: "user" | "business";
  platform_user_id: number | null;
  business_id: number | null;
  balance: number;
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
  transaction_type: TransactionType;
  amount: number;
  balance_after: number;
  subscription_amount: number | null;
  purchased_amount: number | null;
  description: string | null;
  reference_type: string | null;
  reference_id: string | null;
  performed_by: number | null;
  idempotency_key: string | null;
  created_at: Date;
}

export interface PlanRow {
  id: number;
  code: string;
  name: string;
  description: string | null;
  tagline: string | null;
  monthly_price: string;
  annual_price: string;
  currency: string;
  trial_days: number;
  stripe_monthly_price_id: string | null;
  stripe_annual_price_id: string | null;
  monthly_credit_grant: number;
  personal_credit_per_member: number;
  monthly_ai_credits: number;
  limits: Record<string, unknown>;
  is_active: boolean;
  is_public: boolean;
  is_popular: boolean;
  sort_order: number;
  feature_highlights: string[] | null;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
}

export interface SubscriptionRow {
  id: number;
  business_id: number;
  plan_id: number;
  status: SubscriptionStatus;
  billing_interval: BillingInterval;
  stripe_subscription_id: string | null;
  stripe_customer_id: string | null;
  current_period_start: Date | null;
  current_period_end: Date | null;
  trial_ends_at: Date | null;
  canceled_at: Date | null;
  downgrade_at: Date | null;
  monthly_credit_grant: number;
  personal_credit_per_member: number;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
}

// ── Business lookup ─────────────────────────────────────────────────────────

/** req.auth.orgId is businesses.schema_name — resolve it to the numeric id. */
export async function findBusinessBySchema(schema: string): Promise<BusinessRecord | undefined> {
  return masterKnex<BusinessRecord>("businesses")
    .where({ schema_name: schema })
    .whereNull("deleted_at")
    .first();
}

// ── Wallets ─────────────────────────────────────────────────────────────────

export async function findBusinessWallet(businessId: number, trx?: Db): Promise<WalletRow | undefined> {
  return db(trx)<WalletRow>("credit_wallets")
    .where({ business_id: businessId, owner_type: "business" })
    .whereNull("deleted_at")
    .first();
}

export async function ensureBusinessWallet(businessId: number, trx?: Db): Promise<WalletRow> {
  const existing = await findBusinessWallet(businessId, trx);
  if (existing) return existing;

  await db(trx)("credit_wallets")
    .insert({ owner_type: "business", business_id: businessId })
    .onConflict()
    .ignore();

  const wallet = await findBusinessWallet(businessId, trx);
  if (!wallet) throw new Error(`Failed to create wallet for business ${businessId}`);
  return wallet;
}

/**
 * Atomically debit `amount`, spending subscription credits before purchased ones.
 *
 * Returns undefined when the wallet cannot cover it — the caller turns that into a
 * 402. Correctness under concurrency comes from the `FOR UPDATE` in the CTE: every
 * competing spend queues on the same row, then re-reads the committed balance
 * before its own `balance >= amount` guard is evaluated. The CTE also carries the
 * pre-update subscription_balance out, which is the only way to record the
 * subscription/purchased split on the ledger row without a second, racy read.
 */
export async function debitWallet(
  walletId: number,
  amount: number,
  trx: Db,
): Promise<(WalletRow & { subscription_spent: number }) | undefined> {
  const result = await trx.raw(
    `WITH locked AS (
       SELECT id, subscription_balance
         FROM credit_wallets
        WHERE id = ? AND deleted_at IS NULL
        FOR UPDATE
     ), updated AS (
       UPDATE credit_wallets c
          SET subscription_balance = c.subscription_balance - LEAST(c.subscription_balance, ?),
              purchased_balance    = c.purchased_balance - (? - LEAST(c.subscription_balance, ?)),
              balance              = c.balance - ?,
              lifetime_spent       = c.lifetime_spent + ?,
              updated_at           = now()
         FROM locked l
        WHERE c.id = l.id AND c.balance >= ?
        RETURNING c.*, LEAST(l.subscription_balance, ?) AS subscription_spent
     )
     SELECT * FROM updated`,
    [walletId, amount, amount, amount, amount, amount, amount, amount],
  );
  return result.rows[0];
}

/** Add credits to a bucket. Grants go to `subscription`, purchases to `purchased`. */
export async function creditWallet(
  walletId: number,
  amount: number,
  bucket: "subscription" | "purchased",
  trx: Db,
): Promise<WalletRow> {
  const column = bucket === "subscription" ? "subscription_balance" : "purchased_balance";
  const result = await trx.raw(
    `UPDATE credit_wallets
        SET ${column}     = ${column} + ?,
            balance        = balance + ?,
            lifetime_earned = lifetime_earned + ?,
            updated_at     = now()
      WHERE id = ? AND deleted_at IS NULL
      RETURNING *`,
    [amount, amount, amount, walletId],
  );
  const row = result.rows[0];
  if (!row) throw new Error(`Wallet ${walletId} not found`);
  return row;
}

// ── Transactions ────────────────────────────────────────────────────────────

export async function insertTransaction(
  values: Omit<TransactionRow, "id" | "created_at">,
  trx: Db,
): Promise<TransactionRow> {
  const [row] = await trx<TransactionRow>("credit_transactions").insert(values).returning("*");
  return row;
}

export async function listTransactions(
  walletId: number,
  limit: number,
  offset: number,
): Promise<TransactionRow[]> {
  return masterKnex<TransactionRow>("credit_transactions")
    .where({ wallet_id: walletId })
    .whereNull("deleted_at")
    .orderBy("created_at", "desc")
    .orderBy("id", "desc")
    .limit(limit)
    .offset(offset);
}

export async function countTransactions(walletId: number): Promise<number> {
  const row = await masterKnex("credit_transactions")
    .where({ wallet_id: walletId })
    .whereNull("deleted_at")
    .count<{ count: string }[]>("* as count");
  return Number(row[0]?.count ?? 0);
}

export interface LedgerFilters {
  businessId?: number;
  transactionType?: TransactionType;
}

function ledgerQuery(filters: LedgerFilters) {
  const q = masterKnex("credit_transactions as t")
    .join("credit_wallets as w", "w.id", "t.wallet_id")
    .leftJoin("businesses as b", "b.id", "w.business_id")
    .whereNull("t.deleted_at");
  if (filters.businessId) q.where("w.business_id", filters.businessId);
  if (filters.transactionType) q.where("t.transaction_type", filters.transactionType);
  return q;
}

/** Admin: the ledger across every business and personal wallet. */
export async function listLedger(filters: LedgerFilters, limit: number, offset: number) {
  return ledgerQuery(filters)
    .select(
      "t.*",
      "w.owner_type",
      "w.business_id",
      "w.platform_user_id",
      "b.business_name",
    )
    .orderBy("t.created_at", "desc")
    .orderBy("t.id", "desc")
    .limit(limit)
    .offset(offset);
}

export async function countLedger(filters: LedgerFilters): Promise<number> {
  const rows = await ledgerQuery(filters).count<{ count: string }[]>("t.id as count");
  return Number(rows[0]?.count ?? 0);
}

// ── Plans ───────────────────────────────────────────────────────────────────

export async function listPlans(opts: { publicOnly: boolean }): Promise<PlanRow[]> {
  const q = masterKnex<PlanRow>("subscription_plans").whereNull("deleted_at");
  if (opts.publicOnly) q.where({ is_active: true, is_public: true });
  return q.orderBy("sort_order").orderBy("id");
}

export async function findPlanById(id: number, trx?: Db): Promise<PlanRow | undefined> {
  return db(trx)<PlanRow>("subscription_plans").where({ id }).whereNull("deleted_at").first();
}

export async function findPlanByCode(code: string, trx?: Db): Promise<PlanRow | undefined> {
  return db(trx)<PlanRow>("subscription_plans").where({ code }).whereNull("deleted_at").first();
}

export async function findPlanByStripePrice(priceId: string, trx?: Db): Promise<PlanRow | undefined> {
  // The either-price match MUST be a parenthesised group. Ungrouped, knex emits
  // `monthly = ? or annual = ? and deleted_at is null`, and SQL binds AND tighter
  // than OR — so the deleted_at filter applied only to the annual branch and a
  // soft-deleted plan still resolved by its monthly price id. The webhook falls
  // back to this lookup when a payload has no plan_code, so that handed out the
  // withdrawn plan's monthly_credit_grant on every delivery (defect COV2-1).
  return db(trx)<PlanRow>("subscription_plans")
    .where((q) =>
      q.where({ stripe_monthly_price_id: priceId }).orWhere({ stripe_annual_price_id: priceId }),
    )
    .whereNull("deleted_at")
    .first();
}

export async function insertPlan(values: Record<string, unknown>): Promise<PlanRow> {
  const [row] = await masterKnex<PlanRow>("subscription_plans").insert(values).returning("*");
  return row;
}

export async function updatePlan(id: number, values: Record<string, unknown>): Promise<PlanRow | undefined> {
  const [row] = await masterKnex<PlanRow>("subscription_plans")
    .where({ id })
    .whereNull("deleted_at")
    .update({ ...values, updated_at: masterKnex.fn.now() })
    .returning("*");
  return row;
}

export async function softDeletePlan(id: number): Promise<number> {
  return masterKnex("subscription_plans")
    .where({ id })
    .whereNull("deleted_at")
    .update({ deleted_at: masterKnex.fn.now(), is_active: false });
}

export async function listPlanFeatures(planIds: number[]) {
  if (planIds.length === 0) return [];
  return masterKnex("subscription_plan_features")
    .whereIn("plan_id", planIds)
    .whereNull("deleted_at")
    .orderBy("sort_order")
    .select("*");
}

// ── Coupons ─────────────────────────────────────────────────────────────────

export async function listCoupons() {
  return masterKnex("coupons").whereNull("deleted_at").orderBy("id", "desc").select("*");
}

export async function findCouponByCode(code: string, trx?: Db) {
  return db(trx)("coupons").whereRaw("lower(code) = lower(?)", [code]).whereNull("deleted_at").first();
}

export async function insertCoupon(values: Record<string, unknown>) {
  const [row] = await masterKnex("coupons").insert(values).returning("*");
  return row;
}

export async function updateCoupon(id: number, values: Record<string, unknown>) {
  const [row] = await masterKnex("coupons")
    .where({ id })
    .whereNull("deleted_at")
    .update({ ...values, updated_at: masterKnex.fn.now() })
    .returning("*");
  return row;
}

export async function softDeleteCoupon(id: number): Promise<number> {
  return masterKnex("coupons")
    .where({ id })
    .whereNull("deleted_at")
    .update({ deleted_at: masterKnex.fn.now(), is_active: false });
}

// ── Subscriptions ───────────────────────────────────────────────────────────

export async function findSubscription(businessId: number, trx?: Db): Promise<SubscriptionRow | undefined> {
  return db(trx)<SubscriptionRow>("business_subscriptions")
    .where({ business_id: businessId })
    .whereNull("deleted_at")
    .first();
}

export async function findSubscriptionByStripeId(
  stripeSubscriptionId: string,
  trx?: Db,
): Promise<SubscriptionRow | undefined> {
  return db(trx)<SubscriptionRow>("business_subscriptions")
    .where({ stripe_subscription_id: stripeSubscriptionId })
    .whereNull("deleted_at")
    .first();
}

export async function findSubscriptionByCustomer(
  stripeCustomerId: string,
  trx?: Db,
): Promise<SubscriptionRow | undefined> {
  return db(trx)<SubscriptionRow>("business_subscriptions")
    .where({ stripe_customer_id: stripeCustomerId })
    .whereNull("deleted_at")
    .first();
}

/**
 * Upsert the single live subscription for a business and keep the denormalised
 * columns on `businesses` (subscription_id / customer_id / plan_code / currency)
 * in step — those already existed in 20260804_001 and are what the rest of the
 * app reads.
 */
export async function upsertSubscription(
  businessId: number,
  values: Record<string, unknown>,
  trx: Db,
): Promise<SubscriptionRow> {
  const existing = await findSubscription(businessId, trx);

  const [row] = existing
    ? await trx<SubscriptionRow>("business_subscriptions")
        .where({ id: existing.id })
        .update({ ...values, updated_at: trx.fn.now() })
        .returning("*")
    : await trx<SubscriptionRow>("business_subscriptions")
        .insert({ ...values, business_id: businessId })
        .returning("*");

  const plan = await findPlanById(row.plan_id, trx);
  await trx("businesses").where({ id: businessId }).update({
    subscription_id: row.stripe_subscription_id,
    customer_id: row.stripe_customer_id,
    plan_code: plan?.code ?? null,
    payment_currency: plan?.currency ?? null,
    updated_at: trx.fn.now(),
  });

  return row;
}

/** Admin: every business with a subscription row, newest first. */
export async function listSubscribers(
  filters: { status?: SubscriptionStatus; planId?: number },
  limit: number,
  offset: number,
) {
  const build = () => {
    const q = masterKnex("business_subscriptions as s")
      .join("businesses as b", "b.id", "s.business_id")
      .join("subscription_plans as p", "p.id", "s.plan_id")
      .whereNull("s.deleted_at");
    if (filters.status) q.where("s.status", filters.status);
    if (filters.planId) q.where("s.plan_id", filters.planId);
    return q;
  };

  const [rows, counted] = await Promise.all([
    build()
      .select(
        "s.*",
        "b.business_name",
        "b.subdomain",
        "p.code as plan_code",
        "p.name as plan_name",
        "p.currency",
      )
      .orderBy("s.created_at", "desc")
      .limit(limit)
      .offset(offset),
    build().count<{ count: string }[]>("s.id as count"),
  ]);

  return { rows, total: Number(counted[0]?.count ?? 0) };
}

// ── Webhook de-duplication ──────────────────────────────────────────────────

/**
 * Claim a provider event. Returns true the first time and false for every
 * redelivery. Must be called inside the same transaction that settles the event.
 */
export async function claimEvent(
  params: {
    provider: string;
    eventId: string;
    eventType: string;
    businessId: number | null;
    payload: unknown;
  },
  trx: Db,
): Promise<boolean> {
  const rows = await trx("billing_events")
    .insert({
      provider: params.provider,
      event_id: params.eventId,
      event_type: params.eventType,
      business_id: params.businessId,
      payload: JSON.stringify(params.payload ?? {}),
    })
    .onConflict(["provider", "event_id"])
    .ignore()
    .returning("id");
  return rows.length > 0;
}
