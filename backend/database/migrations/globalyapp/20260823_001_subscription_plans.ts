import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("subscription_plans", (t) => {
    t.increments("id").primary();
    t.text("code").unique().notNullable();
    t.text("name").notNullable();
    t.text("description").nullable();
    t.integer("price_minor").notNullable();
    t.text("currency").notNullable().defaultTo("USD");
    t.text("billing_interval").notNullable().defaultTo("month");
    t.integer("included_credits").notNullable().defaultTo(0);
    t.jsonb("features").notNullable().defaultTo("[]");
    t.boolean("is_active").notNullable().defaultTo(true);
    t.integer("sort_order").notNullable().defaultTo(0);
    t.timestamps(true, true);
    t.timestamp("deleted_at").nullable();
  });

  await knex.raw(
    `ALTER TABLE subscription_plans ADD CONSTRAINT chk_sp_billing_interval CHECK (billing_interval IN ('month', 'year'))`,
  );
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("subscription_plans");
}
