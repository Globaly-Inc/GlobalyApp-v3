import type { Knex } from "knex";

// Same shape as business/20260811_002_business_services.ts (final, with 20260824_001's
// public_visibility column folded in since this table never existed for institutions before now)
// plus business/20260812_001_schema_field_values.ts — this lets the existing business-services
// repository (business-services.repository.ts) work unmodified for institutions too: every
// function there takes a generic (id, schemaName) pair. Institutions had no service/course
// tenant table until now (an institution's own services previously only existed as a read-only
// scraped stand-in from the extraction catalog).
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("business_services", (t) => {
    t.increments("id").primary();
    t.uuid("uuid").notNullable().unique().defaultTo(knex.raw("gen_random_uuid()"));
    t.integer("service_category_id").unsigned().nullable().references("id").inTable("service_categories");
    t.text("name").notNullable();
    t.text("description").nullable();
    t.decimal("price").nullable();
    t.boolean("is_published").defaultTo(false);
    t.jsonb("public_visibility").notNullable().defaultTo("{}");
    t.timestamps(true, true);
    t.timestamp("deleted_at").nullable();
  });

  await knex.schema.createTable("schema_field_values", (t) => {
    t.increments("id").primary();
    t.uuid("entity_id").nullable();
    t.text("entity_type").notNullable(); // "business_services" for institutions today
    t.integer("schema_field_id").unsigned().notNullable().references("id").inTable("schema_fields").onDelete("CASCADE");
    t.jsonb("value").nullable();
    t.jsonb("meta").nullable();
    t.timestamps(true, true);
    t.unique(["entity_id", "entity_type", "schema_field_id"]);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("schema_field_values");
  await knex.schema.dropTableIfExists("business_services");
}
