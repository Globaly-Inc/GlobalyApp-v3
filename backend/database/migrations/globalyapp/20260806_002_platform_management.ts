import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.raw("CREATE SCHEMA IF NOT EXISTS superadmin");

  // ── Feature Flags ──
  await knex.schema.withSchema("superadmin").createTable("feature_flags", (t) => {
    t.increments("id").primary();
    t.text("flag_key").notNullable().unique();
    t.boolean("is_enabled").notNullable().defaultTo(false);
    t.text("description").nullable();
    t.integer("updated_by").unsigned().nullable();
    t.timestamps(true, true);
    t.timestamp("deleted_at").nullable();
  });

  // ── Site Access Settings (singleton) ──
  await knex.schema.withSchema("superadmin").createTable("site_access_settings", (t) => {
    t.increments("id").primary();
    t.boolean("is_locked").notNullable().defaultTo(false);
    t.text("access_code").nullable();
    t.integer("updated_by").unsigned().nullable();
    t.timestamps(true, true);
  });

  // Seed single row for site access
  await knex("superadmin.site_access_settings").insert({
    is_locked: false,
    access_code: null,
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.withSchema("superadmin").dropTableIfExists("site_access_settings");
  await knex.schema.withSchema("superadmin").dropTableIfExists("feature_flags");
}