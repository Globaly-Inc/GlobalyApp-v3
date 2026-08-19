import type { Knex } from "knex";

// business_id -> businesses.id (globalyapp schema, same DB)
// extraction_job_id / extraction_course_id -> superadmin.extraction_jobs/extraction_courses.
// Those are real FK constraints, but they are added by the SUPERADMIN migration
// 20260815_001_cross_schema_fks — the extraction tables don't exist yet when the
// globalyapp env runs on a fresh database (globalyapp migrates first), so the columns
// are created plain here and constrained once both sides exist.
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("representations", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    t.integer("business_id").unsigned().notNullable().references("id").inTable("businesses").onDelete("CASCADE");
    t.uuid("extraction_job_id").nullable();
    t.uuid("extraction_course_id").nullable();
    t.text("status").notNullable().defaultTo("active"); // 'active' | 'inactive'
    t.timestamps(true, true);
    t.timestamp("deleted_at").nullable();

    t.unique(["business_id", "extraction_job_id", "extraction_course_id"]);
  });

  await knex.raw("CREATE INDEX idx_representations_business ON representations (business_id)");
  await knex.raw("CREATE INDEX idx_representations_job ON representations (extraction_job_id)");
  await knex.raw("CREATE INDEX idx_representations_course ON representations (extraction_course_id)");
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("representations");
}
