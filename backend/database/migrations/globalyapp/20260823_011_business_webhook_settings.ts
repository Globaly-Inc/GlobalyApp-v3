import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("business_webhook_settings", (t) => {
    t.increments("id").primary();
    t.integer("business_id").unsigned().notNullable().unique()
      .references("id").inTable("businesses").onDelete("CASCADE");
    t.text("url").notNullable();
    t.text("secret").notNullable();
    t.specificType("subscribed_events", "text[]").notNullable().defaultTo("{}");
    t.boolean("is_active").notNullable().defaultTo(true);
    t.timestamp("last_triggered_at").nullable();
    t.timestamps(true, true);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("business_webhook_settings");
}
