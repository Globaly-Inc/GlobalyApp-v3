import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("business_credit_wallets", (t) => {
    t.increments("id").primary();
    t.integer("business_id").unsigned().notNullable().unique()
      .references("id").inTable("businesses").onDelete("CASCADE");
    t.integer("balance").notNullable().defaultTo(0);
    t.timestamps(true, true);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("business_credit_wallets");
}
