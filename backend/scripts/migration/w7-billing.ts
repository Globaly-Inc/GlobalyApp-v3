/**
 * W7c — credits and subscriptions (Part 3 §4 W7, build wave C3's schema).
 *
 * §4 W7: "credits/subscriptions (plans + coupons in public, wallets per business)".
 * C3 shipped all seven targets in `public`, and the reconciliation log (§5 decision
 * D) settled the two shapes that could have gone either way:
 *
 *   subscription_plans        5   -> public.subscription_plans        slug -> code
 *   subscription_plan_features 0  -> public.subscription_plan_features
 *   coupons                   1   -> public.coupons
 *   business_subscriptions   33   -> public.business_subscriptions
 *   business_ai_credits       4   -> public.business_ai_credits
 *   credit_wallets           55   -> public.credit_wallets            polymorphic owner
 *   credit_transactions     162   -> public.credit_transactions       one polymorphic ledger
 *
 * THE 22 ROWS THAT CANNOT LOAD, AND WHY THAT IS THE RIGHT ANSWER.
 * business_subscriptions, credit_wallets and business_ai_credits each declare
 * `business_id integer NOT NULL REFERENCES public.businesses(id)` — C3 did NOT make
 * them polymorphic, because a subscription is a commercial relationship with a
 * claimed business, not with an unclaimed institution record. 22 of the 33 V1
 * subscriptions (all of them `expired`) and 22 of the 35 business-owned wallets
 * belong to a V1 business that W1 turned into an INSTITUTION, so they have no V3
 * home: skipped, reason-coded `unresolved_business`. Resolving them through the org
 * union would put an institution id in a businesses FK — a wrong row rather than a
 * missing one, and the 22 credit_transactions hanging off those wallets would then
 * hang off someone else's balance.
 *
 * TEN V1 PLAN COLUMNS FOLD INTO `limits`. pay_per_lead_cost, the five max_* caps and
 * the three has_* flags have no V3 column; subscription_plans.limits is jsonb
 * precisely so a plan can carry what the columns do not. Folded under their V1 names
 * with jsonb_strip_nulls, so a plan that had none of them keeps an empty `{}` — the
 * same treatment W5 gave audit_events' four orphan facts. Dropping them would lose
 * the entire commercial shape of the V1 pricing table.
 *
 * Usage:
 *   node --import tsx scripts/migration/w7-billing.ts --self-check
 *   node --import tsx scripts/migration/w7-billing.ts             # dry run
 *   node --import tsx scripts/migration/w7-billing.ts --apply
 */

import assert from "node:assert/strict";

import { BUSINESS_ONLY_ID, USER_ID } from "./w7-orgs.js";
import {
  assertParentCounts,
  clearReport,
  execWrite,
  quoteIdent,
  reportUnresolvedQuery,
  runTransform,
  STAGING_SCHEMA,
  type TransformContext,
} from "./lib.js";

/** Every V1 table this wave reads, so a re-run replaces its verdict rather than appending one. */
export const W7_BILLING_SOURCE_TABLES: readonly string[] = [
  "subscription_plans",
  "subscription_plan_features",
  "coupons",
  "business_subscriptions",
  "business_ai_credits",
  "credit_wallets",
  "credit_transactions",
];

/**
 * The ten V1 plan columns public.subscription_plans has no column for.
 *
 * They are LIMITS — per-lead pricing, five entitlement caps, three feature flags —
 * and `limits` is the jsonb column C3 gave the plan for exactly that. Folded under
 * their V1 names so a future schema change can find them; jsonb_strip_nulls keeps a
 * plan that set none of them at `{}` rather than a wall of nulls.
 */
export const PLAN_LIMITS = `jsonb_strip_nulls(jsonb_build_object(
   'pay_per_lead_cost',         s.pay_per_lead_cost,
   'pay_per_application_cost',  s.pay_per_application_cost,
   'max_ad_campaigns',          s.max_ad_campaigns,
   'max_events_per_month',      s.max_events_per_month,
   'max_job_postings',          s.max_job_postings,
   'max_ambassador_programs',   s.max_ambassador_programs,
   'max_branch_connections',    s.max_branch_connections,
   'has_analytics',             s.has_analytics,
   'has_api_access',            s.has_api_access,
   'has_ai_tools',              s.has_ai_tools))`;

/** The V1 plan columns PLAN_LIMITS carries. Named so the self-check can count them. */
export const FOLDED_PLAN_COLUMNS: readonly string[] = [
  "pay_per_lead_cost",
  "pay_per_application_cost",
  "max_ad_campaigns",
  "max_events_per_month",
  "max_job_postings",
  "max_ambassador_programs",
  "max_branch_connections",
  "has_analytics",
  "has_api_access",
  "has_ai_tools",
];

/** V1 plan uuid -> public.subscription_plans.id, through the v1_id this wave writes. */
export const PLAN_ID = (col: string): string => `(SELECT p.id FROM public.subscription_plans p WHERE p.v1_id = ${col})`;

/** V1 wallet uuid -> public.credit_wallets.id, through the v1_id this wave writes. */
export const WALLET_ID = (col: string): string => `(SELECT w.id FROM public.credit_wallets w WHERE w.v1_id = ${col})`;

/** One public table, loaded in a single statement, keyed on the V1 uuid in v1_id. */
async function loadBilling(
  ctx: TransformContext,
  spec: { table: string; select: Record<string, string>; where?: string },
): Promise<number> {
  const columns = Object.keys(spec.select).sort();
  const updates = columns.filter((c) => c !== "v1_id");
  return execWrite(
    ctx,
    `public.${spec.table}`,
    `INSERT INTO public.${quoteIdent(spec.table)} (${columns.map(quoteIdent).join(", ")})
     SELECT ${columns.map((c) => `${spec.select[c]} AS ${quoteIdent(c)}`).join(", ")}
       FROM ${STAGING_SCHEMA}.${quoteIdent(spec.table)} s
      ${spec.where ? `WHERE ${spec.where}` : ""}
     ON CONFLICT (v1_id) DO UPDATE SET
       ${updates.map((c) => `${quoteIdent(c)} = EXCLUDED.${quoteIdent(c)}`).join(", ")}`,
  );
}

export async function transformBilling(ctx: TransformContext, allowedCodes: ReadonlySet<string>): Promise<void> {
  await clearReport(ctx, W7_BILLING_SOURCE_TABLES);

  // ── the catalogue: plans, their features, coupons (all `public`) ───────────
  await loadBilling(ctx, {
    table: "subscription_plans",
    select: {
      v1_id: "s.id",
      code: "s.slug",
      name: "s.name",
      description: "s.description",
      tagline: "s.tagline",
      monthly_price: "s.monthly_price",
      annual_price: "s.annual_price",
      currency: "s.currency",
      trial_days: "s.trial_days",
      stripe_monthly_price_id: "s.stripe_monthly_price_id",
      stripe_annual_price_id: "s.stripe_annual_price_id",
      monthly_credit_grant: "coalesce(s.monthly_credit_grant, 0)",
      personal_credit_per_member: "coalesce(s.personal_credit_per_member, 0)",
      monthly_ai_credits: "s.monthly_ai_credits",
      limits: PLAN_LIMITS,
      is_active: "s.is_active",
      is_public: "s.is_public",
      is_popular: "s.is_popular",
      sort_order: "s.sort_order",
      feature_highlights: "s.feature_highlights",
      created_at: "s.created_at",
      updated_at: "s.updated_at",
    },
  });

  await assertParentCounts(ctx, "public.subscription_plan_features", [
    {
      label: "subscription_plans",
      stagingTable: "subscription_plans",
      targetTable: "public.subscription_plans",
      targetFilter: "deleted_at IS NULL",
    },
  ]);
  await reportUnresolvedQuery(ctx, allowedCodes, {
    sourceTable: "subscription_plan_features",
    targetTable: "public.subscription_plan_features",
    column: "plan_id",
    reasonCode: "unresolved_parent",
    sql: `SELECT s.id::text, 'plan ' || s.plan_id::text || ' did not migrate to public.subscription_plans'
            FROM ${STAGING_SCHEMA}.subscription_plan_features s
           WHERE ${PLAN_ID("s.plan_id")} IS NULL`,
  });
  await loadBilling(ctx, {
    table: "subscription_plan_features",
    where: `${PLAN_ID("s.plan_id")} IS NOT NULL`,
    select: {
      v1_id: "s.id",
      plan_id: PLAN_ID("s.plan_id"),
      feature_key: "s.feature_key",
      feature_label: "s.feature_label",
      feature_value: "s.feature_value",
      is_included: "coalesce(s.is_included, true)",
      sort_order: "coalesce(s.sort_order, 0)",
    },
  });

  await loadBilling(ctx, {
    table: "coupons",
    select: {
      v1_id: "s.id",
      code: "s.code",
      description: "s.description",
      discount_type: "s.discount_type",
      discount_value: "s.discount_value",
      applicable_plans: "s.applicable_plans",
      valid_from: "s.valid_from",
      valid_until: "s.valid_until",
      max_uses: "s.max_uses",
      current_uses: "s.current_uses",
      is_active: "s.is_active",
      created_at: "s.created_at",
    },
  });

  // ── the three businesses-only tables ──────────────────────────────────────
  // business_id is NOT NULL and FKs to public.businesses. A V1 business that
  // became an institution has no V3 home here — see the header.
  for (const table of ["business_subscriptions", "business_ai_credits"] as const) {
    await reportUnresolvedQuery(ctx, allowedCodes, {
      sourceTable: table,
      targetTable: `public.${table}`,
      column: "business_id",
      reasonCode: "unresolved_business",
      sql: `SELECT s.id::text,
                   'business ' || s.business_id::text || ' is not a public.businesses row (it migrated as an institution, ' ||
                   'and public.${table}.business_id FKs to businesses only)'
              FROM ${STAGING_SCHEMA}.${quoteIdent(table)} s
             WHERE ${BUSINESS_ONLY_ID("s.business_id")} IS NULL`,
    });
  }
  await reportUnresolvedQuery(ctx, allowedCodes, {
    sourceTable: "business_subscriptions",
    targetTable: "public.business_subscriptions",
    column: "plan_id",
    reasonCode: "unresolved_parent",
    sql: `SELECT s.id::text, 'plan ' || s.plan_id::text || ' did not migrate to public.subscription_plans'
            FROM ${STAGING_SCHEMA}.business_subscriptions s
           WHERE ${PLAN_ID("s.plan_id")} IS NULL`,
  });
  await loadBilling(ctx, {
    table: "business_subscriptions",
    where: `${BUSINESS_ONLY_ID("s.business_id")} IS NOT NULL AND ${PLAN_ID("s.plan_id")} IS NOT NULL`,
    select: {
      v1_id: "s.id",
      business_id: BUSINESS_ONLY_ID("s.business_id"),
      plan_id: PLAN_ID("s.plan_id"),
      status: "s.status",
      stripe_subscription_id: "s.stripe_subscription_id",
      stripe_customer_id: "s.stripe_customer_id",
      current_period_start: "s.current_period_start",
      current_period_end: "s.current_period_end",
      trial_ends_at: "s.trial_ends_at",
      canceled_at: "s.canceled_at",
      downgrade_at: "s.downgrade_at",
      monthly_credit_grant: "s.monthly_credit_grant",
      personal_credit_per_member: "s.personal_credit_per_member",
      created_at: "coalesce(s.created_at, now())",
      updated_at: "coalesce(s.updated_at, now())",
    },
  });

  await loadBilling(ctx, {
    table: "business_ai_credits",
    where: `${BUSINESS_ONLY_ID("s.business_id")} IS NOT NULL`,
    select: {
      v1_id: "s.id",
      business_id: BUSINESS_ONLY_ID("s.business_id"),
      period_start: "s.period_start",
      period_end: "s.period_end",
      granted: "s.granted",
      used: "s.used",
      created_at: "s.created_at",
      updated_at: "s.updated_at",
    },
  });

  // ── wallets, then the ledger that hangs off them ──────────────────────────
  // V3 keeps V1's polymorphic owner_type/(platform_user_id | business_id) shape
  // (reconciliation log §5) and adds free_balance, which V1 never had — it is left
  // at the V3 default rather than invented from the other three balances.
  await reportUnresolvedQuery(ctx, allowedCodes, {
    sourceTable: "credit_wallets",
    targetTable: "public.credit_wallets",
    column: "business_id",
    reasonCode: "unresolved_business",
    sql: `SELECT s.id::text,
                 'wallet owner ' || s.business_id::text || ' is not a public.businesses row (it migrated as an ' ||
                 'institution, and credit_wallets.business_id FKs to businesses only)'
            FROM ${STAGING_SCHEMA}.credit_wallets s
           WHERE s.business_id IS NOT NULL AND ${BUSINESS_ONLY_ID("s.business_id")} IS NULL`,
  });
  await reportUnresolvedQuery(ctx, allowedCodes, {
    sourceTable: "credit_wallets",
    targetTable: "public.credit_wallets",
    column: "platform_user_id",
    reasonCode: "unresolved_user",
    sql: `SELECT s.id::text, 'wallet owner ' || s.user_id::text || ' has no public.platform_users row'
            FROM ${STAGING_SCHEMA}.credit_wallets s
           WHERE s.user_id IS NOT NULL AND ${USER_ID("s.user_id")} IS NULL`,
  });
  // A wallet with neither owner resolved has no owner at all, and the partial
  // uniques (one per business, one per user) mean it cannot be parked anywhere.
  await loadBilling(ctx, {
    table: "credit_wallets",
    where: `coalesce(${BUSINESS_ONLY_ID("s.business_id")}, ${USER_ID("s.user_id")}) IS NOT NULL`,
    select: {
      v1_id: "s.id",
      owner_type: "s.owner_type",
      platform_user_id: USER_ID("s.user_id"),
      business_id: BUSINESS_ONLY_ID("s.business_id"),
      balance: "s.balance",
      subscription_balance: "s.subscription_balance",
      purchased_balance: "s.purchased_balance",
      lifetime_earned: "s.lifetime_earned",
      lifetime_spent: "s.lifetime_spent",
      created_at: "coalesce(s.created_at, now())",
      updated_at: "coalesce(s.updated_at, now())",
    },
  });

  await assertParentCounts(ctx, "public.credit_transactions", [
    {
      label: "credit_wallets",
      stagingTable: "credit_wallets",
      targetTable: "public.credit_wallets",
      targetFilter: "deleted_at IS NULL",
    },
  ]);
  await reportUnresolvedQuery(ctx, allowedCodes, {
    sourceTable: "credit_transactions",
    targetTable: "public.credit_transactions",
    column: "wallet_id",
    reasonCode: "unresolved_parent",
    sql: `SELECT s.id::text, 'wallet ' || s.wallet_id::text || ' did not migrate to public.credit_wallets'
            FROM ${STAGING_SCHEMA}.credit_transactions s
           WHERE ${WALLET_ID("s.wallet_id")} IS NULL`,
  });
  await reportUnresolvedQuery(ctx, allowedCodes, {
    sourceTable: "credit_transactions",
    targetTable: "public.credit_transactions",
    column: "performed_by",
    reasonCode: "unresolved_user",
    sql: `SELECT s.id::text, 'performed_by ' || s.performed_by::text || ' has no public.platform_users row'
            FROM ${STAGING_SCHEMA}.credit_transactions s
           WHERE s.performed_by IS NOT NULL AND ${USER_ID("s.performed_by")} IS NULL`,
  });
  await loadBilling(ctx, {
    table: "credit_transactions",
    where: `${WALLET_ID("s.wallet_id")} IS NOT NULL`,
    select: {
      v1_id: "s.id",
      wallet_id: WALLET_ID("s.wallet_id"),
      transaction_type: "s.transaction_type",
      amount: "s.amount",
      balance_after: "s.balance_after",
      subscription_amount: "s.subscription_amount",
      purchased_amount: "s.purchased_amount",
      description: "s.description",
      reference_type: "s.reference_type",
      reference_id: "s.reference_id",
      performed_by: USER_ID("s.performed_by"),
      created_at: "coalesce(s.created_at, now())",
    },
  });
}

export function billingSelfCheck(): void {
  const body = transformBilling.toString().replace(/'/g, '"').replace(/\s+/g, " ");
  assert.equal(W7_BILLING_SOURCE_TABLES.length, 7);
  for (const t of W7_BILLING_SOURCE_TABLES) {
    assert.ok(new RegExp(`table: ?"${t}"`).test(body), `${t} must be loaded by this wave`);
  }
  // Plans and coupons are master-level catalogue: `public`, per §4 W7.
  assert.ok(!/\{tenant\}|\{\{schema\}\}/.test(body), "the billing catalogue and the ledger live in public");

  // All ten orphan plan columns must survive into `limits`, or the V1 pricing table
  // loses its commercial shape.
  assert.equal(FOLDED_PLAN_COLUMNS.length, 10);
  for (const c of FOLDED_PLAN_COLUMNS) {
    assert.ok(PLAN_LIMITS.includes(`'${c}'`), `${c} must be folded into subscription_plans.limits, not dropped`);
    assert.ok(PLAN_LIMITS.includes(`s.${c}`), `${c} must read from the source row`);
  }
  assert.ok(PLAN_LIMITS.includes("jsonb_strip_nulls"), "a plan that set none of them keeps an empty {}");

  // The businesses-only FKs must never be resolved through the org union: an
  // institution id in a businesses FK is a wrong row, not a missing one.
  assert.ok(BUSINESS_ONLY_ID("x").includes("public.businesses"));
  assert.ok(!BUSINESS_ONLY_ID("x").includes("institutions"));
  assert.ok(!body.includes("ORG_ID") && !body.includes("org_type"), "no billing table went polymorphic in C3");

  // Both parent resolvers go through v1_id — the serial ids are V3's own and bear
  // no relation to V1's uuids.
  assert.ok(PLAN_ID("x").includes("p.v1_id = x"));
  assert.ok(WALLET_ID("x").includes("w.v1_id = x"));
  for (const r of [PLAN_ID, WALLET_ID]) {
    assert.ok(!r("x").includes("coalesce"), "an unresolved parent is reported, never defaulted");
  }

  console.log("w7-billing self-check: ok");
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  process.exit(await runTransform({ wave: "W7-billing", body: transformBilling, selfCheck: billingSelfCheck }));
}
