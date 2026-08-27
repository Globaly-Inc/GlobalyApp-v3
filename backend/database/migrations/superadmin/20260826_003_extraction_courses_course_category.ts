// Real bug: a job scoped to "Academic Courses" (service_category_id) still saved every
// short course found on the same pages under the same extraction_courses table, with no
// way to tell them apart afterward. The LLM now classifies each course as it extracts it
// ("academic" | "short_course") and staging-writer stores that verdict per-row instead of
// trusting the job-level category for everything the pipeline happens to find.

import type { Knex } from "knex";

const S = "superadmin";
const TABLE = "extraction_courses";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.withSchema(S).alterTable(TABLE, (t) => {
    t.text("course_category").nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.withSchema(S).alterTable(TABLE, (t) => {
    t.dropColumn("course_category");
  });
}
