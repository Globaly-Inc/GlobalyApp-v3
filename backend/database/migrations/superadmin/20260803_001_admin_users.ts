import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.raw("CREATE SCHEMA IF NOT EXISTS superadmin");
  await knex.schema.withSchema("superadmin").createTable("admin_users", (t) => {
    t.increments("id").primary();
    t.integer("platform_user_id").unsigned().notNullable().unique().references("id").inTable("platform_users").onDelete("CASCADE");
    t.text("role").notNullable().defaultTo("admin"); // super_admin, admin, data_admin, moderator
    t.boolean("is_active").notNullable().defaultTo(true);
    t.integer("added_by").unsigned().nullable().references("id").inTable("superadmin.admin_users");
    t.timestamps(true, true);
    t.timestamp("deleted_at").nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.withSchema("superadmin").dropTableIfExists("admin_users");
}
