// Social/profile links beyond the fixed platform columns (Weibo, Medium, Bluesky, …), each with a
// label — the institution twin of superadmin.extraction_institution_overview.other_social_links,
// copied over when the profile is filled from its extraction. Nullable, not '[]': null is "never
// set", which is what lets the fill-blanks backfill tell an untouched profile from one the owner
// emptied.

import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("institutions", (t) => {
    t.jsonb("other_social_links").nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("institutions", (t) => {
    t.dropColumn("other_social_links");
  });
}
