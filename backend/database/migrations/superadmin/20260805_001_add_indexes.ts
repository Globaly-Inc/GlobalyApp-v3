import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.withSchema("superadmin").alterTable("admin_users", (t) => {
    t.index(["refresh_token"]);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.withSchema("superadmin").alterTable("admin_users", (t) => {
    t.dropIndex(["refresh_token"]);
  });
}
