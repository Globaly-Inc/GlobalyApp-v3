import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("business_representations", (t) => {
    t.increments("id").primary();
    t.uuid("uuid").notNullable().unique().defaultTo(knex.raw("gen_random_uuid()"));
    t.integer("business_id").unsigned().notNullable().references("id").inTable("businesses").onDelete("CASCADE");
    t.integer("partner_business_id").unsigned().notNullable().references("id").inTable("businesses").onDelete("CASCADE");
    t.text("partner_business_name").notNullable();
    t.text("partner_business_logo_url").nullable();
    t.text("relation_type").notNullable().defaultTo("partner");
    t.text("status").notNullable().defaultTo("active");
    t.specificType("country_ids", "integer[]").nullable();
    t.date("valid_from").nullable();
    t.date("valid_until").nullable();
    t.text("notes").nullable();
    t.timestamps(true, true);
    t.timestamp("deleted_at").nullable();
    t.unique(["business_id", "partner_business_id"]);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw("DROP TABLE IF EXISTS business_representations CASCADE");
}
