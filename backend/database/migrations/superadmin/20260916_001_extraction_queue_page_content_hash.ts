import type { Knex } from "knex";

const S = "superadmin";

// extraction_queue.page_id (20260915_002) names the extraction_pages ROW the page worker read,
// but that row is refreshed IN PLACE on every fresh fetch (verify worker, retry ladder), so on
// its own it cannot say what the model saw — a later refresh silently repoints an older
// queue item at newer text. This column pins the CONTENT: the sha256 of the markdown at the
// moment of extraction, the same value extraction_pages.content_hash held then. A queue row
// whose hash differs from its page row was extracted against content that has since moved.
// The store stays single-row-per-URL on purpose; it is a cost cache, not an archive.
export async function up(knex: Knex): Promise<void> {
  await knex.schema.withSchema(S).alterTable("extraction_queue", (t) => {
    t.text("page_content_hash").nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.withSchema(S).alterTable("extraction_queue", (t) => {
    t.dropColumn("page_content_hash");
  });
}
