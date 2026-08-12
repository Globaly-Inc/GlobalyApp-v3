import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("schema_fields", (t) => {
    t.increments("id").primary();
    t.integer("entity_id").unsigned().notNullable(); // 
    t.text("entity_type").notNullable(); // table name to join with: "business_categories" | "service_categories"
    t.boolean("is_default").notNullable().defaultTo(false); // true if this field is a default field for the entity type
    t.text("label").notNullable();
    t.text("key").notNullable();
    t.text("type").notNullable(); // "text" | "number" | "select" | "multi_select" | ...
    t.boolean("is_required").notNullable().defaultTo(false);
    t.boolean("filterable").notNullable().defaultTo(false);
    t.jsonb("options").nullable(); // used when type is "select" or "multi_select"
    t.timestamps(true, true);
    t.unique(["entity_id", "entity_type", "key"]);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("schema_fields");
}
