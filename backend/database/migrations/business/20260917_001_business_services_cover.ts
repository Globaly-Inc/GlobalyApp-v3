import type { Knex } from "knex";

// Per-service cover image. Null means "no cover of its own" — the service editor and the public
// pages fall back to the owning business's cover, so a service always has a banner without
// anyone having to upload one. Holds a storage path (or an external URL), the same convention as
// businesses.cover_url; it is signed into a viewable URL on the way out.
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("business_services", (t) => {
    t.text("cover_url").nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("business_services", (t) => {
    t.dropColumn("cover_url");
  });
}
