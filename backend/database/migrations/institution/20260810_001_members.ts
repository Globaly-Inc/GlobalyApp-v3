import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("members", (t) => {
    t.increments("id").primary();
    t.integer("platform_user_id").notNullable().unique(); // app-level FK to platform_users.id (cross-DB)
    // ponytail: role as text, no roles table — add one when institutions need custom roles/permissions
    t.text("role").notNullable().defaultTo("member");
    t.boolean("is_owner").notNullable().defaultTo(false);
    t.integer("account_status").notNullable().defaultTo(1);
    t.integer("added_by").unsigned().nullable().references("id").inTable("members");
    t.text("first_name").nullable();
    t.text("last_name").nullable();
    t.text("email").nullable();
    t.text("phone").nullable();
    t.jsonb("meta").defaultTo("{}");
    t.timestamps(true, true);
    t.timestamp("deleted_at").nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("members");
}
