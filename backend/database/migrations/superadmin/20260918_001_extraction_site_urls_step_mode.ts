import type { Knex } from "knex";

const S = "superadmin";

// docs/data-extraction/2026-09-18-one-step-at-a-time-scraping-plan.md §4.
//
// extraction_site_urls replaces the job worker's in-memory `allUrls` array. Discovery (site_map)
// writes it, the snapshot step reads it, the classifier writes `category` onto it, and queue_pages
// reads `category = 'course'` out of it — so every step is re-runnable from the table rather than
// from a fresh crawl, and an admin can exclude or re-categorise a URL BEFORE it is scraped or sent to
// Gemini. `excluded` is admin intent and survives a re-run of discovery (upsert never touches it).
//
// step_mode is the whole gate between steps: 'auto' chains them as the pipeline always has,
// 'manual' stops after each step with the next one marked "waiting" until the admin presses Run.
export async function up(knex: Knex): Promise<void> {
  await knex.schema.withSchema(S).createTable("extraction_site_urls", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    t.uuid("job_id").notNullable().references("id").inTable(`${S}.extraction_jobs`).onDelete("CASCADE");
    t.text("url").notNullable(); // normalised — see page-store.normaliseUrl
    t.text("source").notNullable(); // map | sitemap | seed_sitemap | catalogue | cert_log | links | guided | related_domain | homepage
    t.text("category").nullable(); // NULL until url_classify; then one of lib/url-categories.ts SITE_URL_CATEGORIES (no CHECK — adding one is a one-place change)
    t.text("category_source").nullable(); // heuristic | llm | admin
    t.boolean("excluded").notNullable().defaultTo(false);
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.unique(["job_id", "url"], { indexName: "uq_extraction_site_urls_job_url" });
  });
  await knex.raw(`CREATE INDEX idx_extraction_site_urls_job_category ON ${S}.extraction_site_urls (job_id, category) WHERE NOT excluded`);

  await knex.schema.withSchema(S).alterTable("extraction_jobs", (t) => {
    t.text("step_mode").notNullable().defaultTo("auto");
  });
  await knex.raw(`ALTER TABLE ${S}.extraction_jobs ADD CONSTRAINT chk_extraction_jobs_step_mode CHECK (step_mode IN ('auto','manual'))`);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`ALTER TABLE ${S}.extraction_jobs DROP CONSTRAINT IF EXISTS chk_extraction_jobs_step_mode`);
  await knex.schema.withSchema(S).alterTable("extraction_jobs", (t) => {
    t.dropColumn("step_mode");
  });
  await knex.schema.withSchema(S).dropTableIfExists("extraction_site_urls");
}
