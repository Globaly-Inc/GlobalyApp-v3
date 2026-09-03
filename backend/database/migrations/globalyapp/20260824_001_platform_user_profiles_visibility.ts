import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("platform_user_profiles", (t) => {
    t.jsonb("public_visibility").notNullable().defaultTo("{}");
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("platform_user_profiles", (t) => {
    t.dropColumn("public_visibility");
  });
}
