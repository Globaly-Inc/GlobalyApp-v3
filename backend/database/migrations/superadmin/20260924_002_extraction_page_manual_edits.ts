import type { Knex } from "knex";

const S = "superadmin";

// A job's own correction of a page's content, kept apart from extraction_pages (shared, keyed by
// URL ALONE and read by every job whose site list includes that URL). Two orgs whose sites happen
// to share a URL must never read or overwrite each other's edit — this table is the fix: an edit
// is scoped to the job that made it, never written into the shared row. unique(job_id, url) — one
// active correction per job per page; saving again replaces it.
export async function up(knex: Knex): Promise<void> {
  await knex.schema.withSchema(S).createTable("extraction_page_manual_edits", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    t.uuid("job_id").notNullable().references("id").inTable(`${S}.extraction_jobs`).onDelete("CASCADE");
    t.text("url").notNullable();
    t.text("markdown").notNullable();
    t.integer("editor_id").nullable().references("id").inTable("public.platform_users").onDelete("SET NULL");
    t.timestamps(true, true);
    t.unique(["job_id", "url"]);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.withSchema(S).dropTableIfExists("extraction_page_manual_edits");
}
