import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("business_representations", (t) => {
    t.increments("id").primary();
    t.uuid("uuid").notNullable().unique().defaultTo(knex.raw("gen_random_uuid()"));
    t.integer("originator_id").unsigned().notNullable();
    t.text("originator_type").notNullable();
    t.integer("target_id").unsigned().notNullable();
    t.text("target_type").notNullable();
    t.text("status").notNullable().defaultTo("active");
    t.specificType("country_ids", "integer[]").nullable();
    t.date("valid_from").nullable();
    t.date("valid_until").nullable();
    t.text("notes").nullable();
    t.timestamps(true, true);
    t.timestamp("deleted_at").nullable();
    t.unique(["originator_id", "originator_type", "target_id", "target_type"]);
    t.index(["target_type", "target_id"]);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw("DROP TABLE IF EXISTS business_representations CASCADE");
}
