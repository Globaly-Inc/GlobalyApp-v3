import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("roles", (t) => {
    t.increments("id").primary();
    t.text("name").unique().notNullable();       // e.g. "owner", "admin", "manager"
    t.text("display_name").notNullable();         // e.g. "Owner", "Admin", "Manager"
    t.text("description").nullable();
    t.boolean("is_system").notNullable().defaultTo(false); // true = cannot be deleted
    t.integer("sort_order").notNullable().defaultTo(0);
    t.timestamps(true, true);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("roles");
}
