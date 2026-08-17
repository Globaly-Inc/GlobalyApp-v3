// Billing catalogue — the globally shared, tenant-agnostic half of billing.
//
// `subscription_plans`, `subscription_plan_features` and `coupons` describe the
// products the platform sells. They are identical for every tenant, so they live
// in the master schema and are read (never written) by business-context routes.
//
// Two deliberate shape changes from V1:
//
//  * V1's `slug` becomes `code`, because `businesses.plan_code` (already present
//    in 20260804_001) is the column that points at it. One name, one meaning.
//  * V1's 9 entitlement columns (max_ad_campaigns, has_ai_tools, …) collapse into
//    a single `limits` jsonb. The access check reads arbitrary feature keys, so a
//    bag beats 9 columns plus a migration every time a feature is added. Prices
//    and credit grants stay as real columns — they are billing arithmetic, not
//    entitlements. `subscription_plan_features` remains purely presentational
//    (the pricing page's bullet list); it is never consulted for access.

import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("subscription_plans", (t) => {
    t.increments("id").primary();
    t.uuid("v1_id").nullable().unique();

    t.text("code").notNullable().unique(); // businesses.plan_code -> this
    t.text("name").notNullable();
    t.text("description").nullable();
    t.text("tagline").nullable();

    // Pricing
    t.decimal("monthly_price", 12, 2).notNullable().defaultTo(0);
    t.decimal("annual_price", 12, 2).notNullable().defaultTo(0);
    t.text("currency").notNullable().defaultTo("AUD");
    t.integer("trial_days").notNullable().defaultTo(0);
    t.text("stripe_monthly_price_id").nullable();
    t.text("stripe_annual_price_id").nullable();

    // Credit grants (billing arithmetic — kept as columns)
    t.integer("monthly_credit_grant").notNullable().defaultTo(0);
    t.integer("personal_credit_per_member").notNullable().defaultTo(0);
    t.integer("monthly_ai_credits").notNullable().defaultTo(0);

    // Entitlements consulted by GET /subscriptions/access/:feature
    t.jsonb("limits").notNullable().defaultTo("{}");

    // Merchandising
    t.boolean("is_active").notNullable().defaultTo(true);
    t.boolean("is_public").notNullable().defaultTo(true);
    t.boolean("is_popular").notNullable().defaultTo(false);
    t.integer("sort_order").notNullable().defaultTo(0);
    t.specificType("feature_highlights", "text[]").nullable();

    t.jsonb("meta").defaultTo("{}");
    t.timestamps(true, true);
    t.timestamp("deleted_at").nullable();
  });

  await knex.schema.createTable("subscription_plan_features", (t) => {
    t.increments("id").primary();
    t.uuid("v1_id").nullable().unique();
    t.integer("plan_id").unsigned().notNullable()
      .references("id").inTable("subscription_plans").onDelete("CASCADE");
    t.text("feature_key").notNullable();
    t.text("feature_label").notNullable();
    t.text("feature_value").nullable();
    t.boolean("is_included").notNullable().defaultTo(true);
    t.integer("sort_order").notNullable().defaultTo(0);
    t.timestamps(true, true);
    t.timestamp("deleted_at").nullable();
    t.unique(["plan_id", "feature_key"], { indexName: "subscription_plan_features_plan_key_unique" });
  });

  await knex.schema.createTable("coupons", (t) => {
    t.increments("id").primary();
    t.uuid("v1_id").nullable().unique();
    t.text("code").notNullable().unique();
    t.text("description").nullable();
    t.text("discount_type").notNullable().defaultTo("percentage")
      .checkIn(["percentage", "fixed"], "coupons_discount_type_check");
    t.decimal("discount_value", 12, 2).notNullable().defaultTo(0);
    t.specificType("applicable_plans", "text[]").nullable(); // plan codes; empty/null = all
    t.timestamp("valid_from").nullable();
    t.timestamp("valid_until").nullable();
    t.integer("max_uses").nullable();
    t.integer("current_uses").notNullable().defaultTo(0);
    t.boolean("is_active").notNullable().defaultTo(true);
    t.timestamps(true, true);
    t.timestamp("deleted_at").nullable();
    t.check("discount_value >= 0", [], "coupons_discount_value_check");
    t.check(
      "discount_type <> 'percentage' OR discount_value <= 100",
      [],
      "coupons_percentage_range_check",
    );
    t.check("max_uses IS NULL OR current_uses <= max_uses", [], "coupons_uses_check");
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("coupons");
  await knex.schema.dropTableIfExists("subscription_plan_features");
  // business_subscriptions (20260817_002) references this — CASCADE keeps the
  // rollback order-independent when both migrations are rolled back together.
  await knex.raw("DROP TABLE IF EXISTS subscription_plans CASCADE");
}
