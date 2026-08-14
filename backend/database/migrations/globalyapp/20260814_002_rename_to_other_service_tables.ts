import type { Knex } from "knex";

/**
 * Rename the four Earn-owned tables to `other_service_*`, matching what the feature is called in superadmin.
 *
 * A rename, not a recreate: `ALTER TABLE ... RENAME` carries the data, the indexes, the constraints and the
 * foreign keys with it, so nothing is copied and nothing can be lost. Postgres rewrites dependent FKs
 * automatically, which is why the child tables need no separate treatment.
 *
 * **`service_categories` is deliberately NOT renamed.** It holds two taxonomies — the business
 * default-services list as well as the personal one (see 20260813_002) — and
 * `business_category_default_services` references it. Renaming it would put an `other_service_` prefix on
 * rows that have nothing to do with Earn, and would touch a feature this change has no business touching.
 *
 * Constraint and index names are left as Postgres inherited them. They still say `service_listings_*`, which
 * is cosmetic: nothing looks a constraint up by name except the tests that assert on the error text, and
 * renaming them would be a second pass of churn for no behavioural gain.
 */

const TABLES: [string, string][] = [
  ["service_listings", "other_service_listings"],
  ["service_orders", "other_service_orders"],
  ["service_reviews", "other_service_reviews"],
  ["service_order_messages", "other_service_order_messages"],
];

export async function up(knex: Knex): Promise<void> {
  for (const [from, to] of TABLES) {
    // Guarded so a database that somehow already has the new name does not fail the whole migration.
    const exists = await knex.schema.hasTable(from);
    if (exists) await knex.schema.renameTable(from, to);
  }
}

export async function down(knex: Knex): Promise<void> {
  for (const [from, to] of TABLES) {
    const exists = await knex.schema.hasTable(to);
    if (exists) await knex.schema.renameTable(to, from);
  }
}
