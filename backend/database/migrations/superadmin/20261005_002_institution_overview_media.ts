// The overview's cover photo and up to 3 media photos, picked from the scraped homepage when the
// overview is written. Before this they were only worked out at promote/backfill time, so the
// admin Institution tab couldn't show or correct them. Null = not picked yet; [] = none found or
// an admin cleared them.

import type { Knex } from "knex";

const S = "superadmin";
const TABLE = "extraction_institution_overview";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.withSchema(S).alterTable(TABLE, (t) => {
    t.text("cover_url").nullable();
    t.jsonb("gallery_images").nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.withSchema(S).alterTable(TABLE, (t) => {
    t.dropColumn("cover_url");
    t.dropColumn("gallery_images");
  });
}
