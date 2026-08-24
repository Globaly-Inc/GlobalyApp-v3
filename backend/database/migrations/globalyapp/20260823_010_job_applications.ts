import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("job_applications", (t) => {
    t.increments("id").primary();
    t.integer("job_id").unsigned().notNullable().references("id").inTable("student_jobs").onDelete("CASCADE");
    t.integer("applicant_user_id").unsigned().notNullable().references("id").inTable("platform_users").onDelete("CASCADE");
    t.text("status").notNullable().defaultTo("applied");
    t.text("cover_note").nullable();
    t.text("resume_url").nullable();
    t.timestamps(true, true);
  });

  await knex.raw(
    `ALTER TABLE job_applications ADD CONSTRAINT chk_ja_status CHECK (status IN ('applied', 'reviewed', 'rejected', 'hired'))`,
  );
  await knex.raw(`CREATE UNIQUE INDEX idx_job_applications_unique ON job_applications (job_id, applicant_user_id)`);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("job_applications");
}
