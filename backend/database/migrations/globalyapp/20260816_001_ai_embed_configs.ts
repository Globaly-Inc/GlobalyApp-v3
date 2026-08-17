import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("ai_embed_configs", (t) => {
    t.increments("id").primary();
    t.integer("business_id").unsigned().notNullable().references("id").inTable("businesses").onDelete("CASCADE");
    t.uuid("embed_key").unique().notNullable().defaultTo(knex.raw("gen_random_uuid()"));
    t.text("display_name").nullable();
    t.text("logo_url").nullable();
    t.text("brand_color").nullable();
    t.text("custom_instructions").nullable();
    t.integer("monthly_credit_limit").defaultTo(1000);
    t.integer("credits_used_this_month").notNullable().defaultTo(0);
    t.timestamp("month_reset_at", { useTz: true }).notNullable().defaultTo(knex.raw("date_trunc('month', now()) + INTERVAL '1 month'"));
    t.boolean("is_active").notNullable().defaultTo(true);
    t.timestamps(true, true);
    t.index(["business_id"], "ai_embed_configs_business_idx");
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("ai_embed_configs");
}
