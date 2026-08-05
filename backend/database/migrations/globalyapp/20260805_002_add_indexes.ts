import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  // Refresh token lookups (auth hot path)
  await knex.schema.alterTable("platform_users", (t) => {
    t.index(["refresh_token"]);
  });

  // Sub-resource queries filter by user_id
  await knex.schema.alterTable("platform_user_qualifications", (t) => {
    t.index(["user_id"]);
  });
  await knex.schema.alterTable("platform_user_language_tests", (t) => {
    t.index(["user_id"]);
  });
  await knex.schema.alterTable("platform_user_work_experiences", (t) => {
    t.index(["user_id"]);
  });

  // Institution lookup by owner
  await knex.schema.alterTable("institutions", (t) => {
    t.index(["platform_user_id"]);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("platform_users", (t) => {
    t.dropIndex(["refresh_token"]);
  });
  await knex.schema.alterTable("platform_user_qualifications", (t) => {
    t.dropIndex(["user_id"]);
  });
  await knex.schema.alterTable("platform_user_language_tests", (t) => {
    t.dropIndex(["user_id"]);
  });
  await knex.schema.alterTable("platform_user_work_experiences", (t) => {
    t.dropIndex(["user_id"]);
  });
  await knex.schema.alterTable("institutions", (t) => {
    t.dropIndex(["platform_user_id"]);
  });
}
