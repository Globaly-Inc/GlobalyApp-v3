import type { Knex } from "knex";

// Other Service Categories — the taxonomy a person sells from through Earn → My Services.
// Admin-managed reference data, separate from the business service_categories table.

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("other_service_categories", (t) => {
    t.increments("id").primary();
    t.text("slug").notNullable().unique();
    t.text("name").notNullable();
    t.text("description").nullable();
    t.text("icon").nullable().defaultTo("Package");
    t.boolean("is_active").notNullable().defaultTo(true);
    t.integer("sort_order").notNullable().defaultTo(0);
    t.timestamps(true, true);
    t.timestamp("deleted_at").nullable();
    t.index(["is_active", "sort_order"], "other_service_categories_active_idx");
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("other_service_categories");
}
