import type { Knex } from "knex";

// course_id / extraction_job_id -> superadmin.extraction_courses/extraction_jobs.
// Cross-schema (not cross-database) reference — see representations migration comment.
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("enquiries", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    t.integer("student_id").unsigned().notNullable().references("id").inTable("platform_users");
    t.uuid("course_id").notNullable().references("id").inTable("superadmin.extraction_courses");
    t.uuid("extraction_job_id").nullable().references("id").inTable("superadmin.extraction_jobs");
    // The institution profile the enquiry is about. Derived server-side from the
    // course's job, not supplied by the client. Nullable because a job does not
    // always have an extraction_institution_overview row.
    t.uuid("institution_id")
      .nullable()
      .references("id")
      .inTable("superadmin.extraction_institution_overview")
      .onDelete("SET NULL");
    t.integer("business_id").unsigned().nullable().references("id").inTable("businesses").onDelete("SET NULL");
    t.text("message").notNullable();
    t.text("preferred_intake").nullable();
    t.integer("preferred_year").nullable();
    t.text("student_country_code").nullable();
    t.decimal("student_latitude", 10, 6).nullable();
    t.decimal("student_longitude", 10, 6).nullable();
    t.text("status").notNullable().defaultTo("pending");
    t.integer("max_accepts").notNullable().defaultTo(3);
    t.integer("accept_count").notNullable().defaultTo(0);
    t.integer("distribution_count").notNullable().defaultTo(0);
    t.timestamp("last_distributed_at", { useTz: true }).nullable();
    t.timestamp("closed_at", { useTz: true }).nullable();
    t.text("close_reason").nullable();
    t.timestamps(true, true);
    t.timestamp("deleted_at").nullable();
  });

  await knex.raw(`
    ALTER TABLE enquiries
      ADD CONSTRAINT chk_enquiries_status
      CHECK (status IN ('pending','distributed','unlocked','in_conversation','converted','closed','no_match','expired'))
  `);
  await knex.raw(`
    ALTER TABLE enquiries
      ADD CONSTRAINT chk_enquiries_accept_count
      CHECK (accept_count BETWEEN 0 AND max_accepts)
  `);
  await knex.raw(`
    ALTER TABLE enquiries
      ADD CONSTRAINT chk_enquiries_message_length
      CHECK (char_length(message) BETWEEN 10 AND 5000)
  `);

  await knex.raw("CREATE INDEX idx_enquiries_student ON enquiries (student_id)");
  await knex.raw("CREATE INDEX idx_enquiries_course ON enquiries (course_id)");
  await knex.raw("CREATE INDEX idx_enquiries_business ON enquiries (business_id)");
  await knex.raw("CREATE INDEX idx_enquiries_status ON enquiries (status)");
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("enquiries");
}
