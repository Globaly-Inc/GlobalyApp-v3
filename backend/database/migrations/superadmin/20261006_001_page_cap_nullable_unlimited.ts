import type { Knex } from "knex";

const S = "superadmin";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.withSchema(S).alterTable("extraction_jobs", (t) => {
    t.integer("page_cap").nullable().defaultTo(null).alter();
  });
  await knex(`${S}.extraction_jobs`).update({ page_cap: null });
}

export async function down(knex: Knex): Promise<void> {
  await knex(`${S}.extraction_jobs`).update({ page_cap: 500 });
  await knex.schema.withSchema(S).alterTable("extraction_jobs", (t) => {
    t.integer("page_cap").notNullable().defaultTo(500).alter();
  });
}
