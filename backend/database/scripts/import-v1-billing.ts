// Loads V1 billing into V3: plan catalogue, coupons, wallets, ledger,
// subscriptions and AI credit periods.
//
//   node --import tsx database/scripts/import-v1-billing.ts             # dry run
//   node --import tsx database/scripts/import-v1-billing.ts --apply     # write
//   node --import tsx database/scripts/import-v1-billing.ts --self-check
//
// Requires import-v1-users and import-v1-businesses to have run first: businesses
// are matched by `businesses.meta->>'v1_business_id'` and users by
// `platform_users.uuid`. Anything that cannot be resolved is REPORTED, never
// silently dropped — a wallet with money in it belonging to a business nobody
// migrated is a finding, not a rounding error.
//
// Idempotent: every table carries `v1_id uuid UNIQUE` and every write is an
// ON CONFLICT (v1_id) upsert, so re-running converges instead of duplicating.
// Everything happens in ONE transaction — a partial billing import is worse than
// none at all.

import assert from "node:assert/strict";
import pg from "pg";
import type { Knex } from "knex";

import { masterKnex } from "../../src/core/db/master-pool.js";

// ── V1 row shapes ───────────────────────────────────────────────────────────

interface V1Plan {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  tagline: string | null;
  monthly_price: string;
  annual_price: string;
  currency: string;
  trial_days: number;
  is_active: boolean;
  is_public: boolean;
  is_popular: boolean;
  sort_order: number;
  feature_highlights: string[] | null;
  stripe_monthly_price_id: string | null;
  stripe_annual_price_id: string | null;
  monthly_credit_grant: number | null;
  personal_credit_per_member: number | null;
  monthly_ai_credits: number;
  pay_per_lead_cost: number | null;
  pay_per_application_cost: number | null;
  max_ad_campaigns: number | null;
  max_events_per_month: number | null;
  max_job_postings: number | null;
  max_ambassador_programs: number | null;
  max_branch_connections: number | null;
  has_analytics: boolean | null;
  has_api_access: boolean | null;
  has_ai_tools: boolean | null;
}

interface V1PlanFeature {
  id: string;
  plan_id: string;
  feature_key: string;
  feature_label: string;
  feature_value: string | null;
  is_included: boolean | null;
  sort_order: number | null;
}

interface V1Coupon {
  id: string;
  code: string;
  description: string | null;
  discount_type: string;
  discount_value: string;
  applicable_plans: string[] | null;
  valid_from: string | null;
  valid_until: string | null;
  max_uses: number | null;
  current_uses: number;
  is_active: boolean;
  created_at: string;
}

interface V1Wallet {
  id: string;
  owner_type: string;
  user_id: string | null;
  business_id: string | null;
  balance: number;
  subscription_balance: number;
  purchased_balance: number;
  lifetime_earned: number;
  lifetime_spent: number;
  created_at: string;
  updated_at: string;
}

interface V1Transaction {
  id: string;
  wallet_id: string;
  transaction_type: string;
  amount: number;
  balance_after: number;
  subscription_amount: number | null;
  purchased_amount: number | null;
  description: string | null;
  reference_type: string | null;
  reference_id: string | null;
  performed_by: string | null;
  created_at: string;
}

interface V1Subscription {
  id: string;
  business_id: string;
  plan_id: string;
  status: string;
  stripe_subscription_id: string | null;
  stripe_customer_id: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
  trial_ends_at: string | null;
  canceled_at: string | null;
  downgrade_at: string | null;
  monthly_credit_grant: number;
  personal_credit_per_member: number;
  created_at: string;
  updated_at: string;
}

interface V1AiCredits {
  id: string;
  business_id: string;
  period_start: string;
  period_end: string;
  granted: number;
  used: number;
  created_at: string;
  updated_at: string;
}

// ── Pure helpers (covered by --self-check) ──────────────────────────────────

/**
 * V1 spread entitlements over 10 columns; V3 keeps them in one `limits` jsonb so
 * the access check can look up an arbitrary feature key. Nulls are dropped rather
 * than stored as null — an absent key and a null key mean the same "no".
 */
export function toPlanLimits(plan: Partial<V1Plan>): Record<string, number | boolean> {
  const source: Record<string, number | boolean | null | undefined> = {
    pay_per_lead_cost: plan.pay_per_lead_cost,
    pay_per_application_cost: plan.pay_per_application_cost,
    max_ad_campaigns: plan.max_ad_campaigns,
    max_events_per_month: plan.max_events_per_month,
    max_job_postings: plan.max_job_postings,
    max_ambassador_programs: plan.max_ambassador_programs,
    max_branch_connections: plan.max_branch_connections,
    has_analytics: plan.has_analytics,
    has_api_access: plan.has_api_access,
    has_ai_tools: plan.has_ai_tools,
  };

  const limits: Record<string, number | boolean> = {};
  for (const [key, value] of Object.entries(source)) {
    if (value !== null && value !== undefined) limits[key] = value;
  }
  return limits;
}

/** V1's status vocabulary is already V3's; anything unexpected is treated as expired. */
export function toSubscriptionStatus(status: string): string {
  const known = ["trialing", "active", "past_due", "canceled", "expired"];
  return known.includes(status) ? status : "expired";
}

/**
 * V1 has no billing_interval. A subscription is annual only if its paid period is
 * clearly longer than a couple of months; everything else (including trials with
 * no period at all) is monthly, which is what V1's UI defaulted to.
 */
export function inferInterval(start: string | null, end: string | null): "month" | "year" {
  if (!start || !end) return "month";
  const days = (new Date(end).getTime() - new Date(start).getTime()) / 86_400_000;
  return days > 70 ? "year" : "month";
}

/** V1 coupons only ever used 'percentage'; anything else is normalised to 'fixed'. */
export function toDiscountType(discountType: string): "percentage" | "fixed" {
  return discountType === "percentage" ? "percentage" : "fixed";
}

// ── Source load ─────────────────────────────────────────────────────────────

async function fetchSource(v1: pg.Client) {
  const q = async <T>(sql: string): Promise<T[]> => (await v1.query<T>(sql)).rows;

  return {
    plans: await q<V1Plan>(
      `SELECT id::text, name, slug, description, tagline, monthly_price::text, annual_price::text,
              currency, trial_days, is_active, is_public, is_popular, sort_order, feature_highlights,
              stripe_monthly_price_id, stripe_annual_price_id, monthly_credit_grant,
              personal_credit_per_member, monthly_ai_credits, pay_per_lead_cost,
              pay_per_application_cost, max_ad_campaigns, max_events_per_month, max_job_postings,
              max_ambassador_programs, max_branch_connections, has_analytics, has_api_access,
              has_ai_tools
         FROM public.subscription_plans ORDER BY sort_order, slug`,
    ),
    planFeatures: await q<V1PlanFeature>(
      `SELECT id::text, plan_id::text, feature_key, feature_label, feature_value, is_included, sort_order
         FROM public.subscription_plan_features ORDER BY sort_order`,
    ),
    coupons: await q<V1Coupon>(
      `SELECT id::text, code, description, discount_type, discount_value::text, applicable_plans,
              valid_from, valid_until, max_uses, current_uses, is_active, created_at
         FROM public.coupons ORDER BY code`,
    ),
    wallets: await q<V1Wallet>(
      `SELECT id::text, owner_type, user_id::text, business_id::text, balance, subscription_balance,
              purchased_balance, lifetime_earned, lifetime_spent, created_at, updated_at
         FROM public.credit_wallets ORDER BY created_at`,
    ),
    transactions: await q<V1Transaction>(
      `SELECT id::text, wallet_id::text, transaction_type, amount, balance_after, subscription_amount,
              purchased_amount, description, reference_type, reference_id, performed_by::text, created_at
         FROM public.credit_transactions ORDER BY created_at`,
    ),
    subscriptions: await q<V1Subscription>(
      `SELECT id::text, business_id::text, plan_id::text, status, stripe_subscription_id,
              stripe_customer_id, current_period_start, current_period_end, trial_ends_at,
              canceled_at, downgrade_at, monthly_credit_grant, personal_credit_per_member,
              created_at, updated_at
         FROM public.business_subscriptions ORDER BY created_at`,
    ),
    aiCredits: await q<V1AiCredits>(
      `SELECT id::text, business_id::text, period_start::text, period_end::text, granted, used,
              created_at, updated_at
         FROM public.business_ai_credits ORDER BY period_start`,
    ),
  };
}

// ── Report ──────────────────────────────────────────────────────────────────

interface Report {
  counts: Record<string, number>;
  unresolved: { table: string; v1_id: string; reason: string }[];
}

function newReport(): Report {
  return { counts: {}, unresolved: [] };
}

function bump(report: Report, key: string): void {
  report.counts[key] = (report.counts[key] ?? 0) + 1;
}

// ── Load ────────────────────────────────────────────────────────────────────

type Source = Awaited<ReturnType<typeof fetchSource>>;

async function load(trx: Knex.Transaction, source: Source, report: Report) {
  // V1 uuid -> V3 serial id, for each already-migrated parent table.
  const businesses = await trx("businesses")
    .whereNotNull(trx.raw("meta->>'v1_business_id'"))
    .select("id", trx.raw("meta->>'v1_business_id' AS v1_id"));
  const businessIdByV1 = new Map<string, number>(
    businesses.map((b: { id: number; v1_id: string }) => [b.v1_id, b.id]),
  );

  const users = await trx("platform_users").whereNotNull("uuid").select("id", "uuid");
  const userIdByUuid = new Map<string, number>(
    users.map((u: { id: number; uuid: string }) => [u.uuid, u.id]),
  );

  // ── Plans ──
  const planIdByV1 = new Map<string, number>();
  for (const plan of source.plans) {
    const [row] = await trx("subscription_plans")
      .insert({
        v1_id: plan.id,
        code: plan.slug,
        name: plan.name,
        description: plan.description,
        tagline: plan.tagline,
        monthly_price: plan.monthly_price,
        annual_price: plan.annual_price,
        currency: plan.currency,
        trial_days: plan.trial_days,
        stripe_monthly_price_id: plan.stripe_monthly_price_id,
        stripe_annual_price_id: plan.stripe_annual_price_id,
        monthly_credit_grant: plan.monthly_credit_grant ?? 0,
        personal_credit_per_member: plan.personal_credit_per_member ?? 0,
        monthly_ai_credits: plan.monthly_ai_credits,
        limits: JSON.stringify(toPlanLimits(plan)),
        is_active: plan.is_active,
        is_public: plan.is_public,
        is_popular: plan.is_popular,
        sort_order: plan.sort_order,
        feature_highlights: plan.feature_highlights,
      })
      .onConflict("v1_id")
      .merge()
      .returning(["id"]);
    planIdByV1.set(plan.id, row.id);
    bump(report, "subscription_plans");
  }

  for (const feature of source.planFeatures) {
    const planId = planIdByV1.get(feature.plan_id);
    if (!planId) {
      report.unresolved.push({ table: "subscription_plan_features", v1_id: feature.id, reason: "plan not migrated" });
      continue;
    }
    await trx("subscription_plan_features")
      .insert({
        v1_id: feature.id,
        plan_id: planId,
        feature_key: feature.feature_key,
        feature_label: feature.feature_label,
        feature_value: feature.feature_value,
        is_included: feature.is_included ?? true,
        sort_order: feature.sort_order ?? 0,
      })
      .onConflict("v1_id")
      .merge();
    bump(report, "subscription_plan_features");
  }

  // ── Coupons ──
  for (const coupon of source.coupons) {
    await trx("coupons")
      .insert({
        v1_id: coupon.id,
        code: coupon.code,
        description: coupon.description,
        discount_type: toDiscountType(coupon.discount_type),
        discount_value: coupon.discount_value,
        applicable_plans: coupon.applicable_plans,
        valid_from: coupon.valid_from,
        valid_until: coupon.valid_until,
        max_uses: coupon.max_uses,
        current_uses: coupon.current_uses,
        is_active: coupon.is_active,
        created_at: coupon.created_at,
      })
      .onConflict("v1_id")
      .merge();
    bump(report, "coupons");
  }

  // ── Wallets ──
  const walletIdByV1 = new Map<string, number>();
  for (const wallet of source.wallets) {
    const businessId = wallet.business_id ? businessIdByV1.get(wallet.business_id) : undefined;
    const userId = wallet.user_id ? userIdByUuid.get(wallet.user_id) : undefined;

    if (wallet.owner_type === "business" && !businessId) {
      report.unresolved.push({
        table: "credit_wallets",
        v1_id: wallet.id,
        reason: `business ${wallet.business_id} was never migrated (balance ${wallet.balance})`,
      });
      continue;
    }
    if (wallet.owner_type === "user" && !userId) {
      report.unresolved.push({
        table: "credit_wallets",
        v1_id: wallet.id,
        reason: `user ${wallet.user_id} was never migrated (balance ${wallet.balance})`,
      });
      continue;
    }

    const [row] = await trx("credit_wallets")
      .insert({
        v1_id: wallet.id,
        owner_type: wallet.owner_type,
        business_id: wallet.owner_type === "business" ? businessId : null,
        platform_user_id: wallet.owner_type === "user" ? userId : null,
        balance: wallet.balance,
        subscription_balance: wallet.subscription_balance,
        purchased_balance: wallet.purchased_balance,
        lifetime_earned: wallet.lifetime_earned,
        lifetime_spent: wallet.lifetime_spent,
        created_at: wallet.created_at,
        updated_at: wallet.updated_at,
      })
      .onConflict("v1_id")
      .merge()
      .returning(["id"]);
    walletIdByV1.set(wallet.id, row.id);
    bump(report, "credit_wallets");
  }

  // ── Ledger ──
  for (const tx of source.transactions) {
    const walletId = walletIdByV1.get(tx.wallet_id);
    if (!walletId) {
      report.unresolved.push({
        table: "credit_transactions",
        v1_id: tx.id,
        reason: `wallet ${tx.wallet_id} was not migrated (${tx.transaction_type} ${tx.amount})`,
      });
      continue;
    }
    await trx("credit_transactions")
      .insert({
        v1_id: tx.id,
        wallet_id: walletId,
        transaction_type: tx.transaction_type,
        amount: tx.amount,
        balance_after: tx.balance_after,
        subscription_amount: tx.subscription_amount,
        purchased_amount: tx.purchased_amount,
        description: tx.description,
        reference_type: tx.reference_type,
        reference_id: tx.reference_id,
        performed_by: tx.performed_by ? (userIdByUuid.get(tx.performed_by) ?? null) : null,
        // V1 ids are globally unique, so they double as the settle-once key for
        // anything a later Stripe redelivery might try to re-apply.
        idempotency_key: `v1:credit_transaction:${tx.id}`,
        created_at: tx.created_at,
      })
      .onConflict("v1_id")
      .merge();
    bump(report, "credit_transactions");
  }

  // ── Subscriptions ──
  for (const sub of source.subscriptions) {
    const businessId = businessIdByV1.get(sub.business_id);
    const planId = planIdByV1.get(sub.plan_id);
    if (!businessId || !planId) {
      report.unresolved.push({
        table: "business_subscriptions",
        v1_id: sub.id,
        reason: !businessId
          ? `business ${sub.business_id} was never migrated (status ${sub.status})`
          : `plan ${sub.plan_id} was never migrated`,
      });
      continue;
    }

    await trx("business_subscriptions")
      .insert({
        v1_id: sub.id,
        business_id: businessId,
        plan_id: planId,
        status: toSubscriptionStatus(sub.status),
        billing_interval: inferInterval(sub.current_period_start, sub.current_period_end),
        stripe_subscription_id: sub.stripe_subscription_id,
        stripe_customer_id: sub.stripe_customer_id,
        current_period_start: sub.current_period_start,
        current_period_end: sub.current_period_end,
        trial_ends_at: sub.trial_ends_at,
        canceled_at: sub.canceled_at,
        downgrade_at: sub.downgrade_at,
        monthly_credit_grant: sub.monthly_credit_grant,
        personal_credit_per_member: sub.personal_credit_per_member,
        created_at: sub.created_at,
        updated_at: sub.updated_at,
      })
      .onConflict("v1_id")
      .merge();
    bump(report, "business_subscriptions");

    // Keep the denormalised columns 20260804_001 already reserved in step.
    const plan = source.plans.find((p) => p.id === sub.plan_id)!;
    await trx("businesses").where({ id: businessId }).update({
      subscription_id: sub.stripe_subscription_id,
      customer_id: sub.stripe_customer_id,
      plan_code: plan.slug,
      payment_currency: plan.currency,
    });
  }

  // ── AI credit periods ──
  for (const period of source.aiCredits) {
    const businessId = businessIdByV1.get(period.business_id);
    if (!businessId) {
      report.unresolved.push({
        table: "business_ai_credits",
        v1_id: period.id,
        reason: `business ${period.business_id} was never migrated (granted ${period.granted})`,
      });
      continue;
    }
    await trx("business_ai_credits")
      .insert({
        v1_id: period.id,
        business_id: businessId,
        period_start: period.period_start,
        period_end: period.period_end,
        granted: period.granted,
        used: period.used,
        created_at: period.created_at,
        updated_at: period.updated_at,
      })
      .onConflict("v1_id")
      .merge();
    bump(report, "business_ai_credits");
  }
}

// ── Main ────────────────────────────────────────────────────────────────────

function selfCheck(): void {
  assert.deepEqual(
    toPlanLimits({
      pay_per_lead_cost: 20,
      max_ad_campaigns: 1,
      has_ai_tools: false,
      has_analytics: true,
      max_job_postings: null,
      has_api_access: undefined,
    }),
    { pay_per_lead_cost: 20, max_ad_campaigns: 1, has_ai_tools: false, has_analytics: true },
  );
  // `false` and `0` are real answers and must survive.
  assert.deepEqual(toPlanLimits({ max_ad_campaigns: 0, has_analytics: false }), {
    max_ad_campaigns: 0,
    has_analytics: false,
  });
  assert.deepEqual(toPlanLimits({}), {});

  assert.equal(toSubscriptionStatus("expired"), "expired");
  assert.equal(toSubscriptionStatus("active"), "active");
  assert.equal(toSubscriptionStatus("something_else"), "expired");

  assert.equal(inferInterval(null, null), "month");
  assert.equal(inferInterval("2026-01-01", null), "month");
  assert.equal(inferInterval("2026-01-01", "2026-02-01"), "month");
  assert.equal(inferInterval("2026-01-01", "2027-01-01"), "year");

  assert.equal(toDiscountType("percentage"), "percentage");
  assert.equal(toDiscountType("amount"), "fixed");

  console.log("self-check: all assertions passed");
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.includes("--self-check")) {
    selfCheck();
    await masterKnex.destroy();
    return;
  }

  const apply = args.includes("--apply");
  const v1Url = process.env.V1_DATABASE_URL;
  if (!v1Url) {
    console.error("V1_DATABASE_URL is not set (the restored V1 database).");
    process.exit(2);
  }

  const v1 = new pg.Client({ connectionString: v1Url });
  await v1.connect();
  await v1.query("SET default_transaction_read_only = on");

  const report = newReport();

  try {
    const source = await fetchSource(v1);
    console.log(
      `source: ${source.plans.length} plans, ${source.planFeatures.length} plan features, ` +
        `${source.coupons.length} coupons, ${source.wallets.length} wallets, ` +
        `${source.transactions.length} transactions, ${source.subscriptions.length} subscriptions, ` +
        `${source.aiCredits.length} ai credit periods`,
    );
    console.log(apply ? "mode: APPLY (writing)\n" : "mode: DRY RUN (rolled back)\n");

    // The dry run does the identical work and then rolls back, so it exercises
    // every constraint instead of guessing at them.
    await masterKnex
      .transaction(async (trx) => {
        await load(trx, source, report);
        if (!apply) throw new DryRun();
      })
      .catch((err) => {
        if (!(err instanceof DryRun)) throw err;
      });

    for (const [table, count] of Object.entries(report.counts)) {
      console.log(`${table.padEnd(28)} ${count}`);
    }
    if (report.unresolved.length > 0) {
      console.log(`\nunresolved (${report.unresolved.length}) — NOT migrated:`);
      for (const item of report.unresolved) {
        console.log(`   ${item.table} ${item.v1_id}: ${item.reason}`);
      }
    } else {
      console.log("\nunresolved: none");
    }
    if (!apply) console.log("\nnothing was written — re-run with --apply");
  } finally {
    await v1.end().catch(() => {});
    await masterKnex.destroy().catch(() => {});
  }
}

/** Sentinel used to roll a dry run back without reporting it as a failure. */
class DryRun extends Error {}

await main();
