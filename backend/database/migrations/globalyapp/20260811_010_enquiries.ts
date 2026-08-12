import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("enquiries", (t) => {
    t.increments("id").primary();
    t.integer("platform_user_id").unsigned().notNullable().references("id").inTable("platform_users").onDelete("CASCADE");
    t.integer("institution_id").unsigned().nullable().references("id").inTable("institutions").onDelete("SET NULL");
    t.text("message").notNullable();
    t.text("preferred_intake").nullable();
    t.integer("preferred_year").nullable();
    // pending | viewed | responded | assigned | converted | closed
    t.text("status").notNullable().defaultTo("pending");
    t.timestamps(true, true);
    t.timestamp("deleted_at").nullable();
    t.index(["platform_user_id", "created_at"], "enquiries_owner_recent_idx");
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("enquiries");
}
