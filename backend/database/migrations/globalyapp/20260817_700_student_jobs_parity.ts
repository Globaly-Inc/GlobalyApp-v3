// Brings `student_jobs` (20260816_002) up to the V2 `jobs` contract so the board
// can carry postings, not just the read-only search rows it was cut for.
//
// Reshape, not adaptation (master plan §1.2): where V2 and the existing V3 table
// disagree, V2 wins.
//   • `is_published` (bool) → `status` text in {draft, open, closed, expired}.
//     V2's public filter is `status = 'open'`; a boolean cannot express "closed
//     but still visible to its owner", which is the whole posting lifecycle.
//   • `closing_date` (date) → `closing_at` timestamptz, matching V2's closingAt.
// Both old columns are backfilled then dropped — the only reader is
// modules/search/repositories/student-jobs.repository.ts, updated in the same PR.
//
// Additive rather than an in-place edit of 20260816_002 because that migration has
// already run against the shared dev/test databases; §1.5's "edit in place" only
// holds for a migration nobody has applied.
//
// `business_id` stays NULLABLE, unlike V2's NOT NULL: V3's table also carries
// scraped/company_name-only rows for the public board (see the search repository's
// company_name fallback). Posting routes always set it.

import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("student_jobs", (t) => {
    t.integer("created_by").unsigned().nullable().references("id").inTable("platform_users").onDelete("SET NULL");
    t.text("slug").nullable();
    t.text("summary").nullable();
    t.boolean("is_hybrid").notNullable().defaultTo(false);
    t.text("category").nullable();
    t.specificType("skill_tags", "text[]").notNullable().defaultTo("{}");
    t.boolean("work_rights_required").notNullable().defaultTo(false);
    t.specificType("visa_types_allowed", "text[]").notNullable().defaultTo("{}");
    t.text("apply_method").notNullable().defaultTo("internal");
    t.text("apply_url").nullable();
    t.jsonb("screening_questions").notNullable().defaultTo("[]");
    t.boolean("is_student_friendly").notNullable().defaultTo(true);
    t.text("status").notNullable().defaultTo("draft");
    t.timestamp("published_at", { useTz: true }).nullable();
    t.timestamp("closing_at", { useTz: true }).nullable();
    t.integer("views_count").notNullable().defaultTo(0);
    t.integer("applications_count").notNullable().defaultTo(0);
    t.boolean("is_featured").notNullable().defaultTo(false);
  });

  await knex.raw(`
    UPDATE student_jobs
       SET status       = CASE WHEN is_published THEN 'open' ELSE 'draft' END,
           published_at = CASE WHEN is_published THEN created_at ELSE NULL END,
           closing_at   = closing_date::timestamptz
  `);

  await knex.schema.alterTable("student_jobs", (t) => {
    t.dropColumn("is_published");
    t.dropColumn("closing_date");
  });

  await knex.raw(`
    ALTER TABLE student_jobs
      ADD CONSTRAINT student_jobs_status_check
      CHECK (status IN ('draft', 'open', 'closed', 'expired'))
  `);
  // Partial: soft-deleted rows keep their slug without blocking a re-post.
  await knex.raw(
    `CREATE UNIQUE INDEX student_jobs_slug_uniq ON student_jobs (slug) WHERE deleted_at IS NULL`,
  );
  await knex.raw(`CREATE INDEX student_jobs_business_idx ON student_jobs (business_id)`);
  await knex.raw(`CREATE INDEX student_jobs_status_idx ON student_jobs (status)`);
  await knex.raw(`CREATE INDEX student_jobs_category_idx ON student_jobs (category)`);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("student_jobs", (t) => {
    t.boolean("is_published").notNullable().defaultTo(false);
    t.date("closing_date").nullable();
  });
  await knex.raw(`
    UPDATE student_jobs
       SET is_published = (status = 'open'),
           closing_date = closing_at::date
  `);
  await knex.raw(`DROP INDEX IF EXISTS student_jobs_category_idx`);
  await knex.raw(`DROP INDEX IF EXISTS student_jobs_status_idx`);
  await knex.raw(`DROP INDEX IF EXISTS student_jobs_business_idx`);
  await knex.raw(`DROP INDEX IF EXISTS student_jobs_slug_uniq`);
  await knex.raw(`ALTER TABLE student_jobs DROP CONSTRAINT IF EXISTS student_jobs_status_check`);
  await knex.schema.alterTable("student_jobs", (t) => {
    t.dropColumn("created_by");
    t.dropColumn("slug");
    t.dropColumn("summary");
    t.dropColumn("is_hybrid");
    t.dropColumn("category");
    t.dropColumn("skill_tags");
    t.dropColumn("work_rights_required");
    t.dropColumn("visa_types_allowed");
    t.dropColumn("apply_method");
    t.dropColumn("apply_url");
    t.dropColumn("screening_questions");
    t.dropColumn("is_student_friendly");
    t.dropColumn("status");
    t.dropColumn("published_at");
    t.dropColumn("closing_at");
    t.dropColumn("views_count");
    t.dropColumn("applications_count");
    t.dropColumn("is_featured");
  });
}
