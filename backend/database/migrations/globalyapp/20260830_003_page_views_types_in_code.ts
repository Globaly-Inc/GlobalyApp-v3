// Drops the page_views type check, so adding a counted page type is a code change rather than a
// migration.
//
// 20260830_001 put the allowed types in a CHECK constraint and 20260830_002 immediately had to
// widen it — which is the whole argument: this list grows as pages get counters, and the DB gains
// nothing by policing it. PAGE_VIEW_TYPES (page-views/consts.ts) is now the only definition, and
// the zod enum in the route rejects anything else before it reaches a query, so the column still
// cannot take a value the app does not know.
//
// The column default stays at 500 as a backstop; the insert passes STARTING_VIEWS explicitly, so
// the number a visitor sees is the const, not the default.

import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.raw("ALTER TABLE page_views DROP CONSTRAINT IF EXISTS page_views_type_chk");
}

export async function down(knex: Knex): Promise<void> {
  // Back to the five types 20260830_002 allowed. Rows of any type added since would violate it, so
  // they go first — rolling this back means going back to a DB-policed list.
  await knex("page_views")
    .whereNotIn("entity_type", ["business", "service", "course", "institution", "visa-service"])
    .delete();
  await knex.raw(
    `ALTER TABLE page_views ADD CONSTRAINT page_views_type_chk
       CHECK (entity_type IN ('business', 'service', 'course', 'institution', 'visa-service'))`,
  );
}
