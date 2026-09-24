import type { Knex } from "knex";

// Scholarships tab on an extraction job. Shaped like extraction_eligibility_requirements: a
// job-scoped row shared across courses through a junction table, hand-added for now (no pipeline
// step writes it yet), with the same created_by/updated_by attribution as every other staged row.
const S = "superadmin";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.withSchema(S).createTable("extraction_scholarships", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    t.uuid("job_id").notNullable().references("id").inTable(`${S}.extraction_jobs`).onDelete("CASCADE");
    t.text("name").notNullable();
    t.text("applicable_to").notNullable().defaultTo("both");
    t.text("coverage_type").nullable(); // full_tuition | partial_tuition | stipend | living_allowance | other
    t.decimal("amount", null).nullable();
    t.text("currency").nullable();
    t.date("deadline").nullable();
    t.text("application_url").nullable();
    t.text("description").nullable();
    t.text("source_url").nullable();
    t.integer("created_by_platform_user_id").nullable().references("id").inTable("public.platform_users").onDelete("SET NULL");
    t.integer("updated_by_platform_user_id").nullable().references("id").inTable("public.platform_users").onDelete("SET NULL");
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });
  await knex.raw(`CREATE INDEX idx_extraction_scholarships_job_id ON ${S}.extraction_scholarships (job_id)`);
  // upsertScholarship's ON CONFLICT target: two page workers extracting the same award at once must
  // land on ONE row, not two with the course links split between them.
  await knex.raw(`CREATE UNIQUE INDEX extraction_scholarships_job_name_uniq ON ${S}.extraction_scholarships (job_id, LOWER(TRIM(name)))`);

  await knex.schema.withSchema(S).createTable("extraction_course_scholarship_assignments", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    t.uuid("job_id").notNullable().references("id").inTable(`${S}.extraction_jobs`).onDelete("CASCADE");
    t.uuid("course_id").notNullable().references("id").inTable(`${S}.extraction_courses`).onDelete("CASCADE");
    t.uuid("scholarship_id").notNullable().references("id").inTable(`${S}.extraction_scholarships`).onDelete("CASCADE");
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.unique(["course_id", "scholarship_id"]); // assignJunction's onConflict target
  });
  await knex.raw(`CREATE INDEX idx_ecsa_job ON ${S}.extraction_course_scholarship_assignments (job_id)`);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.withSchema(S).dropTableIfExists("extraction_course_scholarship_assignments");
  await knex.schema.withSchema(S).dropTableIfExists("extraction_scholarships");
}
