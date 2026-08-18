// subscription_plans.pay_per_application_cost (Wave G5).
//
// PARITY-FIRST (§1.2.1): V1's `subscription_plans` carries this column and V1's
// `get_active_subscription` RPC is where `charge-application` reads the price of
// one application from — the hard-coded 10 in that function is only the fallback
// for a business with no active plan. V3's 20260816_004 table has no such column,
// so the feature cannot be expressed without adding it. Reshape V3, don't
// approximate the feature.
//
// It is a plain integer credit count, not money: application charges are settled
// out of the credit wallet, never against a card. See 20260817_803.
//
// NOT stuffed into `subscription_plans.limits` (jsonb). `limits` holds caps —
// "how many of X may you have" — and this is a price. A price the charge path
// reads on every accept belongs in a typed, constrained column where a bad value
// is rejected at write time rather than discovered at charge time.

import type { Knex } from "knex";

/** V1's `charge-application` fallback when the business has no active plan. */
export const DEFAULT_APPLICATION_CREDIT_COST = 10;

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("subscription_plans", (t) => {
    t.integer("pay_per_application_cost").notNullable().defaultTo(DEFAULT_APPLICATION_CREDIT_COST);
  });
  await knex.raw(`
    ALTER TABLE subscription_plans
      ADD CONSTRAINT subscription_plans_pay_per_application_cost_check
      CHECK (pay_per_application_cost > 0)
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(
    `ALTER TABLE subscription_plans DROP CONSTRAINT IF EXISTS subscription_plans_pay_per_application_cost_check`,
  );
  await knex.schema.alterTable("subscription_plans", (t) => {
    t.dropColumn("pay_per_application_cost");
  });
}
