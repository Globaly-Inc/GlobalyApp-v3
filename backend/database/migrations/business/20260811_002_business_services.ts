import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("business_services", (t) => {
    t.increments("id").primary();
    t.uuid("uuid").notNullable().unique().defaultTo(knex.raw("gen_random_uuid()"));
    t.integer("service_category_id").unsigned().nullable().references("id").inTable("service_categories");
    t.text("name").notNullable();
    t.text("description").nullable();
    t.decimal("price").nullable();
    t.boolean("is_published").defaultTo(false);
    t.timestamps(true, true);
    t.timestamp("deleted_at").nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("business_services");
}
