import type { Knex } from "knex";

const S = "superadmin";

// Same convention as extraction_jobs' created_by/updated_by (20260908_001): null means the
// stored snapshot is whatever the pipeline last scraped; non-null means a business/institution
// owner hand-corrected this page's content through the self-service Site Mapping tab, and
// page-store.ts's store() refuses to let an automated re-scrape overwrite it until they edit it
// again. ON DELETE SET NULL — losing the editor's account must not take the edit's protection
// away silently; it just stops being attributable.
export async function up(knex: Knex): Promise<void> {
  await knex.schema.withSchema(S).alterTable("extraction_pages", (t) => {
    t.integer("updated_by_platform_user_id").nullable()
      .references("id").inTable("public.platform_users").onDelete("SET NULL");
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.withSchema(S).alterTable("extraction_pages", (t) => {
    t.dropColumn("updated_by_platform_user_id");
  });
}
