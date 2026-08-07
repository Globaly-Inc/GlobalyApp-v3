import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("agents", (t) => {
    t.increments("id").primary();
    t.integer("platform_user_id").notNullable().unique(); // app-level FK to platform_users.id (cross-DB)
    t.integer("role_id").unsigned().notNullable().references("id").inTable("roles");
    t.boolean("is_owner").notNullable().defaultTo(false);
    t.integer("account_status").notNullable().defaultTo(1);
    t.integer("added_by").unsigned().nullable().references("id").inTable("agents");
    t.jsonb("meta").defaultTo("{}");
    t.timestamps(true, true);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("agents");
}
