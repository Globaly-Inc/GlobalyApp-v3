// The overview only had one column per known platform (facebook_url, instagram_url,
// twitter_url, linkedin_url, youtube_url) — any other social/profile link (TikTok, Threads,
// WhatsApp Business, a booking page, ...) was silently discarded during extraction. This
// column holds those as a plain JSON array of URLs.

import type { Knex } from "knex";

const S = "superadmin";
const TABLE = "extraction_institution_overview";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.withSchema(S).alterTable(TABLE, (t) => {
    t.jsonb("other_social_links").notNullable().defaultTo("[]");
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.withSchema(S).alterTable(TABLE, (t) => {
    t.dropColumn("other_social_links");
  });
}
