import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.raw("CREATE SCHEMA IF NOT EXISTS superadmin");
  await knex.schema.withSchema("superadmin").createTable("admin_users", (t) => {
    t.increments("id").primary();
    t.uuid("uuid").unique().notNullable().defaultTo(knex.raw("gen_random_uuid()"));
    t.text("name").notNullable();
    t.text("email").unique().notNullable();
    t.text("role").notNullable().defaultTo("admin"); // super_admin, admin, data_admin, moderator
    t.text("otp").nullable();
    t.timestamp("otp_expires_at").nullable();
    t.text("refresh_token").nullable();
    t.text("photo_url").nullable();
    t.integer("account_status").notNullable().defaultTo(1);
    t.boolean("is_email_verified").notNullable().defaultTo(false);
    t.integer("added_by").unsigned().nullable().references("id").inTable("superadmin.admin_users");
    t.jsonb("meta").defaultTo("{}");
    t.timestamps(true, true);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.withSchema("superadmin").dropTableIfExists("admin_users");
}
