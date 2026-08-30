// Widens the page_views type check to every public detail page that has one.
//
// The counter shipped for businesses (education agents are businesses too — same page) and
// marketplace services. Courses, institutions and scraped visa-service providers have the same
// kind of page, so they get their own type rather than being folded into an existing one: ids
// don't collide today, but a shared type would make "which page is this row" unanswerable.
//
// A separate migration because 20260830_001 is already applied — constraints are replaced by a
// new file, never by editing the old one.

import type { Knex } from "knex";

const TYPES = ["business", "service", "course", "institution", "visa-service"] as const;

export async function up(knex: Knex): Promise<void> {
  await knex.raw("ALTER TABLE page_views DROP CONSTRAINT IF EXISTS page_views_type_chk");
  await knex.raw(
    `ALTER TABLE page_views ADD CONSTRAINT page_views_type_chk
       CHECK (entity_type IN (${TYPES.map((type) => `'${type}'`).join(", ")}))`,
  );
}

export async function down(knex: Knex): Promise<void> {
  // Back to the two types 20260830_001 allowed. Rows of the widened types would violate it, so
  // they go first — dropping a counter is the point of rolling this back.
  await knex("page_views").whereIn("entity_type", ["course", "institution", "visa-service"]).delete();
  await knex.raw("ALTER TABLE page_views DROP CONSTRAINT IF EXISTS page_views_type_chk");
  await knex.raw(
    `ALTER TABLE page_views ADD CONSTRAINT page_views_type_chk
       CHECK (entity_type IN ('business', 'service'))`,
  );
}
