import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  // ── Business Categories ──
  await knex.schema.createTable("business_categories", (t) => {
    t.increments("id").primary();
    t.text("slug").notNullable().unique();
    t.text("name").notNullable();
    t.text("description").nullable();
    t.text("icon").nullable();
    t.boolean("is_active").notNullable().defaultTo(true);
    t.integer("sort_order").notNullable().defaultTo(0);
    t.timestamps(true, true);
  });

  // ── Service Categories ──
  await knex.schema.createTable("service_categories", (t) => {
    t.increments("id").primary();
    t.text("slug").notNullable().unique();
    t.text("name").notNullable();
    t.text("description").nullable();
    t.text("icon").nullable().defaultTo("Package");
    t.boolean("is_active").notNullable().defaultTo(true);
    t.integer("sort_order").notNullable().defaultTo(0);
    t.timestamps(true, true);
  });

  // ── Business ↔ Service default categories junction ──
  await knex.schema.createTable("business_category_default_services", (t) => {
    t.integer("business_category_id").unsigned().notNullable().references("id").inTable("business_categories").onDelete("CASCADE");
    t.integer("service_category_id").unsigned().notNullable().references("id").inTable("service_categories").onDelete("CASCADE");
    t.primary(["business_category_id", "service_category_id"]);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("business_category_default_services");
  await knex.schema.dropTableIfExists("service_categories");
  await knex.schema.dropTableIfExists("business_categories");
}
