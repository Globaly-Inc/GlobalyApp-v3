import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("schema_field_values", (t) => {
    t.increments("id").primary();
    t.uuid("entity_id").nullable(); // null when entity_type is "businesses" (the tenant's own business row)
    t.text("entity_type").notNullable(); // "businesses" | "business_services"
    t.integer("schema_field_id").unsigned().notNullable().references("id").inTable("schema_fields").onDelete("CASCADE");
    t.jsonb("value").nullable();
    t.jsonb("meta").nullable();
    t.timestamps(true, true);
    t.unique(["entity_id", "entity_type", "schema_field_id"]);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("schema_field_values");
}
