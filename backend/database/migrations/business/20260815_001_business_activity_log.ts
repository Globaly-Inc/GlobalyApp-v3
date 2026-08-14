import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("business_activity_log", (t) => {
    t.increments("id").primary();
    t.integer("agent_id").unsigned().nullable().references("id").inTable("agents");
    t.text("action").notNullable();
    t.text("entity_type").notNullable();
    t.text("entity_id").nullable();
    t.jsonb("details").defaultTo("{}");
    t.timestamp("created_at").defaultTo(knex.fn.now());
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("business_activity_log");
}
