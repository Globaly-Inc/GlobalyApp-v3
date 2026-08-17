import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("credit_wallets", (t) => {
    t.increments("id").primary();
    t.integer("platform_user_id").unsigned().notNullable().unique()
      .references("id").inTable("platform_users").onDelete("CASCADE");
    t.integer("free_balance").notNullable().defaultTo(0);
    t.integer("subscription_balance").notNullable().defaultTo(0);
    t.integer("purchased_balance").notNullable().defaultTo(0);
    t.timestamps(true, true);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("credit_wallets");
}
