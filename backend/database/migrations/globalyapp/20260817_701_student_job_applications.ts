// Job applications — V2's `job_applications`, in V3 shape.
//
// PLACEMENT (master plan §1.2). This row is a FK that crosses a tenant boundary:
// it points at a platform user (master `platform_users`) AND at a business's job.
// §1.2 says such a FK must live in master (`public`), never inside one tenant's
// schema — so the table lands here, in the globalyapp/master database, alongside
// `student_jobs` itself (20260816_002 already put postings in master).
//
// The consequence is that isolation is enforced in code, not by the schema: every
// business-side query filters on `business_id`, taken from req.business (resolved
// by tenant.plugin from the JWT's orgId) and never from a path or body. Same
// contract as enquiry distributions. `business_id` is denormalized off the job so
// that filter stays a single-table predicate.
//
// The three resume CHECK constraints are carried over verbatim from V2 — they are
// the upload trust boundary and belong in the database, not in a route.

import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("student_job_applications", (t) => {
    t.increments("id").primary();
    t.integer("job_id").unsigned().notNullable().references("id").inTable("student_jobs").onDelete("CASCADE");
    t.integer("user_id").unsigned().notNullable().references("id").inTable("platform_users").onDelete("CASCADE");
    // Nullable because student_jobs.business_id is (scraped listings carry only
    // company_name); a posting made through the business routes always has one.
    t.integer("business_id").unsigned().nullable().references("id").inTable("businesses").onDelete("CASCADE");
    t.text("resume_url").nullable();
    t.text("resume_mime_type").nullable();
    t.integer("resume_size_bytes").nullable();
    t.integer("resume_uploaded_by").unsigned().nullable().references("id").inTable("platform_users").onDelete("SET NULL");
    t.timestamp("resume_uploaded_at", { useTz: true }).nullable();
    t.text("cover_letter").nullable();
    t.jsonb("screening_answers").notNullable().defaultTo("[]");
    t.text("stage").notNullable().defaultTo("new");
    t.jsonb("match_score").nullable();
    t.timestamp("stage_changed_at", { useTz: true }).nullable();
    t.integer("stage_changed_by").unsigned().nullable().references("id").inTable("platform_users").onDelete("SET NULL");
    t.text("notes").nullable();
    t.timestamps(true, true);
    t.timestamp("deleted_at", { useTz: true }).nullable();

    t.unique(["job_id", "user_id"], { indexName: "student_job_applications_job_user_uniq" });
    t.index(["job_id"], "student_job_applications_job_idx");
    t.index(["user_id"], "student_job_applications_user_idx");
    t.index(["business_id"], "student_job_applications_business_idx");
  });

  await knex.raw(`
    ALTER TABLE student_job_applications
      ADD CONSTRAINT student_job_applications_stage_check
      CHECK (stage IN ('new', 'shortlisted', 'interview', 'offer', 'rejected', 'withdrawn'))
  `);

  // Verbatim from V2 job_applications.
  await knex.raw(`
    ALTER TABLE student_job_applications
      ADD CONSTRAINT student_job_applications_resume_mime_whitelist
      CHECK (resume_mime_type IS NULL OR resume_mime_type IN (
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      ))
  `);
  await knex.raw(`
    ALTER TABLE student_job_applications
      ADD CONSTRAINT student_job_applications_resume_size_limit
      CHECK (resume_size_bytes IS NULL OR (resume_size_bytes > 0 AND resume_size_bytes <= 10485760))
  `);
  await knex.raw(`
    ALTER TABLE student_job_applications
      ADD CONSTRAINT student_job_applications_resume_metadata_consistency
      CHECK (
        (resume_mime_type IS NULL AND resume_size_bytes IS NULL
          AND resume_uploaded_by IS NULL AND resume_uploaded_at IS NULL)
        OR (resume_url IS NOT NULL AND resume_mime_type IS NOT NULL
          AND resume_size_bytes IS NOT NULL AND resume_uploaded_by IS NOT NULL
          AND resume_uploaded_at IS NOT NULL)
      )
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("student_job_applications");
}
