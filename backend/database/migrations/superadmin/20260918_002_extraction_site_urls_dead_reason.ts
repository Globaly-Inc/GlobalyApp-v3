import type { Knex } from "knex";

const S = "superadmin";

// A URL the snapshot step could not read — 404, blocked, or an empty body — is INACTIVE: it is
// counted on the Site Context tab and skipped by url_classify and queue_pages, but stays on the site
// list so a re-run of discovery does not re-add it as new. Cleared when a later snapshot succeeds.
// Distinct from `excluded`, which is admin intent.
export async function up(knex: Knex): Promise<void> {
  await knex.schema.withSchema(S).alterTable("extraction_site_urls", (t) => {
    t.text("dead_reason").nullable(); // not_found | blocked | empty
    t.timestamp("liveness_checked_at", { useTz: true }).nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.withSchema(S).alterTable("extraction_site_urls", (t) => {
    t.dropColumn("dead_reason");
    t.dropColumn("liveness_checked_at");
  });
}
