import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("areas_of_study", (t) => {
    t.increments("id").primary();
    t.text("name").notNullable().unique();
    t.text("slug").notNullable().unique();
    t.integer("sort_order").notNullable().defaultTo(0);
    t.boolean("is_active").notNullable().defaultTo(true);
    t.timestamps(true, true);
    t.timestamp("deleted_at").nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("areas_of_study");
}
