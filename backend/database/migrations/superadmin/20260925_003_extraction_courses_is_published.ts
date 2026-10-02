// Institution courses had no real is_published column — the backend hardcoded true for every
// course, so a newly created one was always immediately public with no way to hold it as a draft
// first (unlike a plain business's own services, which already default to unpublished).
// Backfills existing rows to true first — they were effectively always public before this column
// existed, so this only changes behavior for courses created/edited from here on.

import type { Knex } from "knex";

const S = "superadmin";
const TABLE = "extraction_courses";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.withSchema(S).alterTable(TABLE, (t) => {
    t.boolean("is_published").notNullable().defaultTo(false);
  });
  await knex(`${S}.${TABLE}`).update({ is_published: true });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.withSchema(S).alterTable(TABLE, (t) => {
    t.dropColumn("is_published");
  });
}
