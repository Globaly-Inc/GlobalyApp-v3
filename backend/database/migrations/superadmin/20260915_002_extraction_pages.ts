import type { Knex } from "knex";

const S = "superadmin";

// Step 3 of docs/data-extraction/2026-09-15-extraction-cost-reduction-design.md — what was
// scraped, kept. Until now a page lived in memory for one queue message and nothing of it
// survived but a 500-char excerpt, so verify re-scraped to compare against content it had
// already seen, a fees PDF was re-read by Gemini Vision from every message that needed it,
// and "what did the model actually see?" had no answer.
//
// Keyed on (url, mode): scrapeMarkdown is not a pure function of the URL — onlyMainContent
// asks Crawl4AI for its "fit" markdown (right for a course page) or the whole page (right for
// a homepage, whose footer IS the data). Same URL, two legitimately different outputs.
// forceFirecrawl / mobile / proxy / expandCollapsed are NOT in the key: they are ways of
// obtaining the page, used only on the retry ladder, which always fetches fresh and overwrites.
//
// markdown is the FULL cleaned page, never the truncated prompt input — truncation moves to
// prompt time, so a bigger model window or a targeted prompt later sees everything. Failures
// (blocked, 404, thin) are never stored: caching one would freeze a transient WAF block for
// the whole freshness window.
export async function up(knex: Knex): Promise<void> {
  await knex.schema.withSchema(S).createTable("extraction_pages", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    t.text("url").notNullable(); // normalised — see page-store.normaliseUrl
    t.text("mode").notNullable(); // 'main' | 'full'
    t.text("domain").notNullable();
    t.text("markdown").notNullable();
    t.jsonb("links").notNullable().defaultTo("[]");
    t.text("content_hash").notNullable();
    t.text("scraper").notNullable(); // scrapling | crawl4ai | firecrawl | pdf-vision
    t.timestamp("scraped_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.unique(["url", "mode"]);
  });
  await knex.raw(`ALTER TABLE ${S}.extraction_pages ADD CONSTRAINT chk_extraction_pages_mode CHECK (mode IN ('main','full'))`);
  // Per-institution listing and purge ("the site was redesigned, forget it").
  await knex.raw(`CREATE INDEX idx_extraction_pages_domain ON ${S}.extraction_pages (domain, scraped_at DESC)`);

  // Which snapshot the page worker read for this queue item — the join from a staged course
  // (source_url + job → queue row) back to the exact content the model saw.
  await knex.schema.withSchema(S).alterTable("extraction_queue", (t) => {
    t.uuid("page_id").nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.withSchema(S).alterTable("extraction_queue", (t) => {
    t.dropColumn("page_id");
  });
  await knex.schema.withSchema(S).dropTableIfExists("extraction_pages");
}
