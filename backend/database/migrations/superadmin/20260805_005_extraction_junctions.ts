// Migration 4/8: Junction / assignment tables (course ↔ entity mappings).
// Tables: extraction_course_campuses, extraction_course_intake_assignments,
//         extraction_course_fee_assignments, extraction_course_eligibility_assignments,
//         extraction_course_study_option_assignments, extraction_course_study_unit_assignments,
//         extraction_course_accreditation_assignments

import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  const s = "superadmin";
  const jobsRef = `${s}.extraction_jobs`;
  const coursesRef = `${s}.extraction_courses`;

  // -- extraction_course_campuses --
  await knex.schema.withSchema(s).createTable("extraction_course_campuses", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    t.uuid("job_id").notNullable().references("id").inTable(jobsRef).onDelete("CASCADE");
    t.uuid("course_id").nullable().references("id").inTable(coursesRef).onDelete("CASCADE");
    t.uuid("campus_id").nullable().references("id").inTable(`${s}.extraction_campuses`).onDelete("SET NULL");
    t.text("campus_name").nullable();
    t.text("campus_email").nullable();
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  // -- extraction_course_intake_assignments --
  await knex.schema.withSchema(s).createTable("extraction_course_intake_assignments", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    t.uuid("job_id").notNullable().references("id").inTable(jobsRef).onDelete("CASCADE");
    t.uuid("course_id").notNullable().references("id").inTable(coursesRef).onDelete("CASCADE");
    t.uuid("intake_id").notNullable().references("id").inTable(`${s}.extraction_intakes`).onDelete("CASCADE");
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.unique(["course_id", "intake_id"]);
  });
  await knex.raw(`CREATE INDEX idx_eci_assignments_course_id ON ${s}.extraction_course_intake_assignments (course_id)`);
  await knex.raw(`CREATE INDEX idx_eci_assignments_intake_id ON ${s}.extraction_course_intake_assignments (intake_id)`);
  await knex.raw(`CREATE INDEX idx_eci_assignments_job_id ON ${s}.extraction_course_intake_assignments (job_id)`);

  // -- extraction_course_fee_assignments --
  await knex.schema.withSchema(s).createTable("extraction_course_fee_assignments", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    t.uuid("job_id").notNullable().references("id").inTable(jobsRef).onDelete("CASCADE");
    t.uuid("course_fee_id").nullable().references("id").inTable(`${s}.extraction_course_fees`).onDelete("CASCADE");
    t.uuid("course_id").nullable().references("id").inTable(coursesRef).onDelete("CASCADE");
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.unique(["course_id", "course_fee_id"]); // V3 tightening — V2 had no unique here
  });
  await knex.raw(`CREATE INDEX idx_extraction_course_fee_assignments_job_id ON ${s}.extraction_course_fee_assignments (job_id)`);

  // -- extraction_course_eligibility_assignments --
  await knex.schema.withSchema(s).createTable("extraction_course_eligibility_assignments", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    t.uuid("job_id").notNullable().references("id").inTable(jobsRef).onDelete("CASCADE");
    t.uuid("course_id").nullable().references("id").inTable(coursesRef).onDelete("CASCADE");
    t.uuid("eligibility_requirement_id").nullable().references("id").inTable(`${s}.extraction_eligibility_requirements`).onDelete("CASCADE");
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.unique(["course_id", "eligibility_requirement_id"]); // V3 tightening
  });

  // -- extraction_course_study_option_assignments --
  await knex.schema.withSchema(s).createTable("extraction_course_study_option_assignments", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    t.uuid("job_id").notNullable().references("id").inTable(jobsRef).onDelete("CASCADE");
    t.uuid("course_id").notNullable().references("id").inTable(coursesRef).onDelete("CASCADE");
    t.uuid("study_option_id").notNullable().references("id").inTable(`${s}.extraction_study_options`).onDelete("CASCADE");
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.unique(["course_id", "study_option_id"]);
  });
  await knex.raw(`CREATE INDEX idx_ecsoa_course ON ${s}.extraction_course_study_option_assignments (course_id)`);
  await knex.raw(`CREATE INDEX idx_ecsoa_job ON ${s}.extraction_course_study_option_assignments (job_id)`);
  await knex.raw(`CREATE INDEX idx_ecsoa_option ON ${s}.extraction_course_study_option_assignments (study_option_id)`);

  // -- extraction_course_study_unit_assignments --
  await knex.schema.withSchema(s).createTable("extraction_course_study_unit_assignments", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    t.uuid("job_id").notNullable().references("id").inTable(jobsRef).onDelete("CASCADE");
    t.uuid("course_id").nullable().references("id").inTable(coursesRef).onDelete("CASCADE");
    t.uuid("study_unit_id").nullable().references("id").inTable(`${s}.extraction_study_units`).onDelete("CASCADE");
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.unique(["course_id", "study_unit_id"]); // V3 tightening
  });

  // -- extraction_course_accreditation_assignments --
  await knex.schema.withSchema(s).createTable("extraction_course_accreditation_assignments", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    t.uuid("job_id").notNullable().references("id").inTable(jobsRef).onDelete("CASCADE");
    t.uuid("course_id").nullable().references("id").inTable(coursesRef).onDelete("CASCADE");
    t.uuid("extraction_accreditation_id").nullable().references("id").inTable(`${s}.extraction_accreditations`).onDelete("CASCADE");
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.uuid("accreditation_id").nullable(); // FK target: public.accreditations(id), add when table exists
    t.unique(["course_id", "extraction_accreditation_id"]); // V3 tightening
  });
  await knex.raw(`CREATE INDEX idx_eca_accreditation ON ${s}.extraction_course_accreditation_assignments (accreditation_id)`);
  await knex.raw(`CREATE INDEX idx_eca_job_extraction ON ${s}.extraction_course_accreditation_assignments (job_id, extraction_accreditation_id)`);
}

export async function down(knex: Knex): Promise<void> {
  const s = "superadmin";
  const tables = [
    "extraction_course_accreditation_assignments",
    "extraction_course_study_unit_assignments",
    "extraction_course_study_option_assignments",
    "extraction_course_eligibility_assignments",
    "extraction_course_fee_assignments",
    "extraction_course_intake_assignments",
    "extraction_course_campuses",
  ];
  for (const table of tables) {
    await knex.schema.withSchema(s).dropTableIfExists(table);
  }
}
